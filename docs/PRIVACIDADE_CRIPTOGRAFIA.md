# Privacidade e criptografia das notas

Status: planejamento aprovado; Fase 0 implementada no código (falta migração no Supabase); Fase 1 implementada no código (chaves, gate, cifragem de `notes.text`/`last_preview`, cache local cifrado, backfill, corte e consentimento da IA) — falta rodar a migração no Supabase e ligar o corte.
Última atualização: 2026-10-27.

Decisões de produto (2026-10-23):
- A criptografia será **obrigatória para todos**.
- A IA só lê uma conversa após **consentimento explícito por conversa**.
- A implantação será em etapas: chaves para todos, backfill, corte do texto claro e bloqueio de clientes antigos.

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

A Store continua síncrona em memória, mas o cache local é cifrado:

- Memória: dados decifrados apenas enquanto a sessão está desbloqueada.
- `localStorage`: o bucket da conta guarda `{ v: 1, enc: { v, iv, ct } }` (AAD `notethread:cache:v1:<uid>`). As preferências do dispositivo (tema, som) continuam em claro na raiz — não são conteúdo.
- No boot o Store sobe `locked` (conteúdo fora da memória) e o `CryptoGate` pede a senha; `Store.hydrate()` abre o bucket depois do unlock. Enquanto bloqueado, `save()` não regrava o bucket — conta que já teve cache cifrado nunca volta ao texto claro.
- A fila offline cifra o payload com AAD próprio (`notethread:queue:v1:<uid>`) e só entrega o item quando a chave da conta dona está em memória; itens legados em claro continuam drenáveis.
- O bundle de chaves (`salt` + `wrapped_dek`) é copiado para `localStorage` para não depender do servidor na hora de desbloquear; ele não é segredo sem a senha/código.
- "Lembrar neste dispositivo" (persistir a DEK no IndexedDB) continua opt-in e não está implementado.

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
- [x] Módulo `keys.js`: cria bundle, abre com senha, abre com código de recuperação.
- [x] Tabela `user_keys` no `supabase.sql` com RLS por usuário (falta rodar no Supabase).
- [x] Tela de criação obrigatória de senha + código de recuperação (com confirmação de que o código foi guardado).
- [x] Tela de unlock no boot e em novo dispositivo; sem chave, o app não carrega notas.
- [x] Cifrar `notes.text` e `threads.last_preview`; `threads.name`, `tags`, `reactions` e `audio.transcript` continuam em claro nesta etapa.
- [x] Store em memória + cache local cifrado (IndexedDB/localStorage não guarda texto claro). O bucket da conta vira `{ v, enc }`; sem a DEK o app sobe bloqueado (`locked`) e só abre no `hydrate()` depois do unlock. A fila offline também grava o item cifrado.
- [x] Migração dual-read: lê ciphertext; se não existir, lê texto antigo e cifra ao salvar.
- [x] Backfill client-side obrigatório com progresso e retomada (`backfill.js` + barra em `ui/privacy.js`). Retomável por construção; CAS em `text`/`last_preview` evita sobrescrever edição concorrente.
- [x] Corte: trigger `notes_no_plaintext`/`threads_no_plaintext` rejeita texto claro e o cliente trata o erro como terminal (modal "Atualize o app", sem reenfileirar). Nasce DESLIGADO (`app_config.encryption_enforced = false`) — ligar só depois do backfill de todos.
- [x] Consentimento de IA por conversa (decisão local em `thread.aiShared`, padrão NADA liberado), com painel "Privacidade" na página da IA.

Critério de aceite: inspecionar o banco não revela texto, título, tags nem transcrição; dois dispositivos da mesma conta leem o mesmo conteúdo após unlock; perder a senha sem código de recuperação é irreversível e isso fica explícito.

### Fase 2 — Mídia E2E

- [ ] Cifrar blob de imagem/áudio antes do upload.
- [ ] Guardar `audio` e metadados sensíveis cifrados.
- [ ] Player e lightbox baixam, decifram e criam `objectURL` (revogar ao fechar).
- [ ] Transcrição local ou consentimento explícito para enviar áudio a provedor.
- [ ] Migrar objetos existentes para a versão cifrada e apagar os antigos.

### Fase 3 — IA com consentimento

> O consentimento por conversa (itens 1–3) foi antecipado na Fase 1: a decisão
> é local (`thread.aiShared`), o padrão é nada liberado e o contexto é montado
> só com o que foi marcado.

- [x] Marcar conversas como privadas/não privadas (painel "Privacidade" da IA).
- [x] Ação explícita "compartilhar com a IA" por conversa.
- [ ] Aviso do que sai do dispositivo e para qual provedor.
- [x] Contexto da IA montado somente com conteúdo autorizado.
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
  kdf text not null default 'PBKDF2-SHA256',
  kdf_iterations integer not null default 600000,
  wrapped_dek jsonb not null,
  recovery_wrapped_dek jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_keys enable row level security;
create policy "own keys" on user_keys for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`wrapped_dek` usa o mesmo envelope `{ v, iv, ct }` de `public/js/crypto.js`. A senha nunca é enviada nem armazenada; só a DEK embrulhada.

Nas tabelas de conteúdo, adicionar colunas de ciphertext em vez de sobrescrever as antigas durante a transição:

```sql
alter table notes add column if not exists text_enc jsonb;
alter table notes add column if not exists enc_version integer;
alter table threads add column if not exists name_enc jsonb;
alter table threads add column if not exists last_preview_enc jsonb;
```

## 6. Migração e compatibilidade

1. Fase 0 pode ir antes de tudo: o código novo assina tanto paths novos quanto URLs públicas antigas.
2. Fase 1a (chaves obrigatórias): todos criam `user_keys` no próximo login; o conteúdo ainda pode estar claro.
3. Fase 1b (backfill): leitura tolerante (`text_enc` se existir; senão `text`) e cifragem ao salvar; backfill cliente, uma nota por vez, com retomada e progresso.
4. Fase 1c (corte): quando o backfill do usuário terminar, o cliente grava só ciphertext e limpa o claro. Um trigger/constraint no banco rejeita texto claro novo.
5. Clientes antigos do PWA não podem continuar gravando texto claro depois do corte; versão mínima + update forçado + aviso.
6. Nenhuma migração de Fase 1 pode ser feita em lote no servidor sem as chaves dos usuários.
7. Perder senha e código de recuperação significa perder o conteúdo; o onboarding precisa bloquear até o usuário confirmar que guardou o código.

Ordem de implantação da Fase 1 (não inverter):

1. Rodar o `supabase.sql` atualizado (colunas `text_enc`/`last_preview_enc`, `app_config` e triggers). Os triggers nascem inertes porque `encryption_enforced = false`.
2. Publicar o cliente novo (cache local cifrado + backfill). Ele já grava ciphertext e mantém a leitura tolerante do que ainda está claro.
3. Acompanhar o backfill: o banner aparece uma vez por sessão e retoma a cada conexão até zerar `text`/`last_preview` em claro.
4. Confirmar no banco que não sobra texto claro (`select count(*) from notes where text is not null;` e o mesmo para `threads.last_preview <> ''`).
5. Ligar o corte quando a base estiver migrada: `update app_config set encryption_enforced = true, min_client_version = '1.27.0' where id;` — a partir daí só a versão mínima grava.
6. Emergência: `update app_config set encryption_enforced = false where id;` (não apaga nada; só reabre a escrita em claro).

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

1. Metadados (timestamps, quantidade, pasta) podem ficar visíveis? A recomendação é sim; cifrar tudo inviabiliza busca/ordenação no servidor e aumenta muito o custo.
2. O consentimento de IA fica por conversa (recomendado) ou por mensagem? Por conversa reduz atrito; por mensagem é mais granular.
3. Quem perder senha e código de recuperação aceita perder o conteúdo, ou haverá um custódia/escrow (que enfraquece o E2E)?
4. Mídia E2E é necessária na Fase 2 ou o bucket privado + URL assinada já basta por enquanto?
5. Qual o prazo de compatibilidade com clientes antigos do PWA?
