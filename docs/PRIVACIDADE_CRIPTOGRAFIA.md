# Privacidade e criptografia das notas

Status: planejamento aprovado; Fase 0 implementada no código (falta migração no Supabase); primitivas da Fase 1 prontas.
Última atualização: 2026-10-23.

## 1. Objetivo

Dar privacidade real ao conteúdo das notas sem quebrar o funcionamento offline-first do app.

A meta final é **criptografia ponta a ponta (E2E)**: o conteúdo sai do dispositivo já cifrado e o servidor (Supabase) só armazena ciphertext. O servidor não consegue ler texto, título, transcrição, áudio ou imagem.

## 2. Modelo de ameaça

| Ameaça | Proteção atual | O que faremos |
| --- | --- | --- |
| Outro usuário lendo notas alheias | RLS por `user_id` | Manter e testar |
| Pessoa com a URL de um áudio/imagem | Nenhuma: buckets `public` | **Fase 0:** buckets privados + URLs assinadas |
| Operador do Supabase ou vazamento do banco | Nada: texto em claro | **Fase 1:** E2E do conteúdo |
| Provedor de IA/transcrição lendo conteúdo | Nada: envio em claro | **Fase 3:** consentimento explícito ou IA local |
| XSS ou dispositivo comprometido | CSP parcial | Hardening contínuo; E2E não protege esse caso |
| Metadados (horários, quantidade, IDs) | Visíveis | Aceitos nesta versão; documentar |

Fora de escopo: impedir que o usuário exporte o próprio conteúdo, proteger contra o dono do dispositivo, ou garantir anonimato da conta.

## 3. Decisões de arquitetura

### 3.1 Criptografia

- AES-256-GCM via WebCrypto (`crypto.subtle`), sem biblioteca de criptografia própria.
- IV aleatório de 96 bits por operação; nunca reutilizar IV com a mesma chave.
- `additionalData` amarra o ciphertext ao contexto: `notethread:v1:<userId>:<threadId>:<clientId>:<campo>`.
- Payload armazenado: `{ v: 1, iv: <base64>, ct: <base64> }`.
- Chave de dados (DEK) aleatória de 256 bits por usuário.
- DEK embrulhada por uma chave derivada de senha (KEK) usando PBKDF2-SHA-256 com salt aleatório e 600.000+ iterações. Argon2id pode substituir o PBKDF2 depois, via wasm.
- O servidor guarda apenas `salt`, `iv`, `wrapped_dek` e versão. Nunca vê a senha nem a DEK.
- Código de recuperação aleatório (exibido uma única vez) embrulha uma segunda cópia da DEK. Perder senha e código = perder acesso aos dados.
- Chave em memória como `CryptoKey` não-exportável. "Lembrar neste dispositivo" pode persistir a chave no IndexedDB; é opt-in.

### 3.2 O que é cifrado

Fase 1:
- `notes.text`
- `threads.name`
- `threads.last_preview`
- `notes.tags`
- `notes.reactions`
- `audio.transcript`

Fase 2:
- blob de imagem e áudio (antes do upload)
- `audio.peaks`, `dur`, `mime`, `sender`
- caminho do arquivo pode continuar visível (metadado), mas o conteúdo não

Continuam visíveis (metadados): `user_id`, `thread_id`, `client_id`, timestamps, `sort_order`, `remind_at`, tamanho aproximado e quantidade de notas. O título da conversa pode ser cifrado sem afetar a ordenação, que usa `updated_at`.

### 3.3 Chaves e multi-dispositivo

- Login Google não fornece chave. Na primeira vez, o usuário cria uma **senha de criptografia** separada da conta.
- Novo dispositivo: login Google -> baixa `wrapped_dek` -> pede senha ou código de recuperação -> desembrulha a DEK.
- Troca de senha: reembrulha a mesma DEK; não recifra todos os dados.
- Rotação de chave: nova versão de DEK e recifragem progressiva client-side; só necessária se houver suspeita de vazamento.
- Backups/exportação: exportar ciphertext + metadados, ou texto claro somente após confirmação e com aviso.

### 3.4 Offline-first e localStorage

O Store é síncrono e hoje guarda texto claro. Para E2E:

- Memória: dados decifrados apenas enquanto a sessão está desbloqueada.
- `localStorage`: guardar ciphertext; a Store descriptografa no boot depois do unlock.
- Se o usuário optar por "lembrar neste dispositivo", a DEK não-exportável fica no IndexedDB.
- Sem unlock, o app mostra a lista de conversas bloqueada; não mostra conteúdo.

Isso exige refatorar o Store para um cache em memória hidratado a partir do ciphertext. É a maior mudança da Fase 1.

### 3.5 IA e transcrição

E2E e IA server-side não coexistem sem consentimento. Decisão pendente:

1. **Modo privado por conversa:** conversas privadas não entram no contexto da IA.
2. **Compartilhar sob demanda:** o usuário aperta "usar na IA" e o cliente descriptografa somente aquele conteúdo, com aviso claro.
3. **IA local:** modelo/Whisper no navegador; mais pesado e com pior qualidade.

Recomendação: opção 1 como padrão e opção 2 como ação explícita. A transcrição automática deve seguir a mesma regra; hoje `api/transcribe.js` recebe áudio em claro.

## 4. Fases

### Fase 0 — Fechar o vazamento de mídia (implementada no código)

- [x] Buckets `note-images` e `note-audio` privados.
- [x] Remover policies de leitura pública.
- [x] Upload guarda o *path* no storage, não a URL pública.
- [x] Renderização resolve *path* em URL assinada de curta duração.
- [x] Compatibilidade com notas antigas que guardaram URL pública: extrair o path e assinar.
- [x] Transcrição aceita URL assinada do próprio projeto.
- [ ] Rodar a migração SQL no Supabase de produção.
- [ ] Apagar os objetos públicos antigos após a migração.

Critério de aceite: sem sessão, uma URL antiga de áudio/imagem não abre; com sessão, imagens e áudios continuam funcionando em qualquer dispositivo da conta.

Ordem de implantação (não inverter):
1. Publicar o cliente novo com buckets ainda públicos. Ele já grava *paths* e assina URLs antigas.
2. Validar imagem, áudio, waveform, transcrição e anexo em produção.
3. Rodar a migração SQL (buckets privados + remover policies públicas).
4. Apagar os objetos públicos antigos depois da janela de compatibilidade.
5. Clientes antigos que ainda chamam `getPublicUrl` perdem mídia depois do passo 3; por isso o cliente novo precisa estar no ar antes.

### Fase 1 — E2E do conteúdo textual

- [x] Módulo `crypto.js`: AES-GCM, PBKDF2, wrap/unwrap, código de recuperação.
- [ ] Integrar `crypto.js` ao fluxo de chaves e à UI (hoje só primitivas testadas).
- [ ] Tabela `user_keys` (RLS por usuário) com `salt`, `iv`, `wrapped_dek`, `version`.
- [ ] Tela de criação de senha de criptografia + código de recuperação.
- [ ] Tela de unlock no boot e em novo dispositivo.
- [ ] Cifrar `notes.text`, `threads.name`, `last_preview`, `tags`, `reactions`, `audio.transcript`.
- [ ] Store em memória + cache local cifrado.
- [ ] Migração dual-read: lê ciphertext; se não existir, lê texto antigo e cifra ao salvar.
- [ ] Backfill client-side com progresso.
- [ ] Bloquear clientes antigos de regravar texto claro (versão mínima / feature flag).

Critério de aceite: inspecionar o banco não revela texto, título, tags nem transcrição; dois dispositivos da mesma conta leem o mesmo conteúdo após unlock; perder a senha sem código de recuperação é irreversível e isso fica explícito.

### Fase 2 — Mídia E2E

- [ ] Cifrar blob de imagem/áudio antes do upload.
- [ ] Guardar `audio` e metadados sensíveis cifrados.
- [ ] Player e lightbox baixam, decifram e criam `objectURL` (revogar ao fechar).
- [ ] Transcrição local ou consentimento explícito para enviar áudio a provedor.
- [ ] Migrar objetos existentes para a versão cifrada e apagar os antigos.

### Fase 3 — IA com consentimento

- [ ] Marcar conversas como privadas/não privadas.
- [ ] Ação explícita "compartilhar com a IA" por mensagem/conversa.
- [ ] Aviso do que sai do dispositivo e para qual provedor.
- [ ] Contexto da IA montado somente com conteúdo autorizado.
- [ ] Avaliar IA/Whisper local como alternativa.

### Fase 4 — Operação e hardening

- [ ] Rotação de chave e versão de ciphertext.
- [ ] Exportação/backup seguro.
- [ ] Auditoria de CSP, sanitização de Markdown e dependências.
- [ ] Testes de migração, perda de chave, dispositivo novo e concorrência.
- [ ] Documentação para usuários e política de privacidade.

## 5. Modelo de dados previsto

```sql
create table if not exists user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1,
  salt text not null,
  iv text not null,
  wrapped_dek text not null,
  recovery_iv text,
  recovery_wrapped_dek text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_keys enable row level security;
create policy "own keys" on user_keys for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Nas tabelas de conteúdo, adicionar colunas de ciphertext em vez de sobrescrever as antigas durante a transição:

```sql
alter table notes add column if not exists text_enc jsonb;
alter table notes add column if not exists enc_version integer;
alter table threads add column if not exists name_enc jsonb;
alter table threads add column if not exists last_preview_enc jsonb;
```

## 6. Migração e compatibilidade

1. Fase 0 pode ir antes de tudo: o código novo assina tanto paths novos quanto URLs públicas antigas.
2. A Fase 1 usa leitura tolerante: se `text_enc` existir, decifra; senão usa `text`.
3. Ao salvar, grava ciphertext e limpa o campo claro.
4. Backfill roda no cliente, uma nota por vez, com retomada e progresso.
5. Clientes antigos do PWA não podem continuar gravando texto claro depois do corte; definir versão mínima e aviso de atualização.
6. Nenhuma migração de Fase 1 pode ser feita em lote no servidor sem as chaves dos usuários.

## 7. Riscos

- **Perda de dados:** senha esquecida sem código de recuperação. Mitigação: onboarding forte, teste do código, cópia impressa/gerenciador de senhas.
- **Falsa sensação de segurança:** se a chave for derivada do Google ou guardada crua, não é E2E. Mitigação: revisão criptográfica e mensagens honestas.
- **IA quebrada:** E2E por padrão impede leitura pelo servidor. Mitigação: consentimento explícito ou IA local.
- **XSS:** com a chave na página, XSS decifra tudo. Mitigação: CSP, sanitização, revisão de dependências e do service worker.
- **Migração longa:** backfill client-side depende de cada usuário abrir o app. Mitigação: banner de progresso e migração preguiçosa ao editar.
- **URLs antigas:** objetos públicos continuam acessíveis até serem apagados. Mitigação: migrar e remover após a janela de compatibilidade.

## 8. Testes

- Unitários: criptografia roundtrip, IV único, AAD trocado, senha errada, wrap/unwrap, código de recuperação, parsing de paths/URLs.
- Migração: texto claro -> ciphertext -> leitura em outro dispositivo; retomada no meio.
- Storage: bucket privado nega acesso sem token; URL assinada expira; path antigo é reassinado.
- Privacidade: inspecionar linhas do banco e objetos do storage não revela conteúdo.
- Regressão: offline, realtime, busca local, player, lightbox, transcrição e IA com/sem consentimento.

## 9. Perguntas em aberto

1. A IA continua sendo parte central do produto? Se sim, aceitamos consentimento por conversa ou migramos para IA local?
2. A senha de criptografia será obrigatória para todos ou opt-in por conta?
3. Metadados (timestamps, quantidade) podem ficar visíveis?
4. Mídia E2E é necessária na Fase 2 ou o bucket privado + URL assinada já basta por enquanto?
5. Qual o prazo de compatibilidade com clientes antigos do PWA?
