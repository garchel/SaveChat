# Backlog — SaveChat

Trabalho aberto, medido contra o código em **20/10/2026** (v1.25.0, `a8e010b`).

> **O que existe hoje:** o inventário completo, com evidência por feature e
> os limites numéricos, está em [ESTADO_ATUAL.md](ESTADO_ATUAL.md). Este
> arquivo lista só o que está aberto.

> Regra: um item só entra aqui com **evidência no código**. Documento que
> afirma pendência sem conferir é pior que nenhum — já aconteceu (ver
> "Armadilha do backlog" no fim). Os números abaixo foram medidos nesta
> auditoria; o comando de cada medição está em "Como medir".

## Como usar

1. Escolha um item e abra a branch: `git switch staging && git switch -c fix/<item>`
2. `npm run promote` → `npm run preview` → PR para `main`.
3. Ao resolver, mova o item para "Resolvido" com o commit e apague a
   linha do aberto.

---

## Resumo da auditoria

| Item | Status | Prioridade |
|---|---|---|
| B1. Tipografia abaixo de 12px | 🟡 parcial — 4 regras de texto em 11px | 1 |
| B1b. Contraste abaixo de AA | 🟡 parcial — 3 focos ainda falham | 1 |
| B2. `.bubble .del` invisível em touch | ✅ obsoleto — CSS morto | — |
| B3. `.search-results` em telas pequenas | ⏳ aberto, exige device real | 3 |
| B4. `.pin-badge` espalhado em 3 arquivos | ⏳ aberto (5 blocos) | 3 |
| B5. Auditar `MOTION_DESIGN.md` | ✅ auditado — fases 1–4 existem | — |
| B6. Busca global limitada ao cache local | 🔴 aberto — bug funcional | 2 |
| B7. Contexto da IA limitado a 15×10 notas | 🔴 aberto — limitação de produto | 2 |
| B8. Falha silenciosa de persistência local | 🔴 aberto — risco de perda de dados | 1 |
| B9. Conflito de edição (last-write-wins) | 🔴 aberto — perda silenciosa | 2 |
| B10. `supabase-js` via CDN em runtime | 🟡 aberto — confiabilidade | 3 |
| B11. Observabilidade inerte (Sentry sem DSN) | 🟡 aberto — operação | 3 |
| B12. Documentação desatualizada | ✅ corrigido nesta auditoria | — |
| B13. Snapshot corta conversas/cadernos em 100 | 🔴 aberto — conteúdo inacessível | 2 |
| B14. Compartilhar conversa entre pessoas | ⛔ não existe — lacuna de produto | 3 |
| B15. Lembretes só com o app aberto | 🔴 aberto — sem push | 2 |
| B16. `/api/ai` e `/api/transcribe` sem cota por conta | 🟡 aberto — custo/abuso | 2 |
| B17. Buckets de imagem/áudio públicos por URL | 🟡 aberto — privacidade | 2 |

---

## Prioridade 1 — Acessibilidade

### B1. Tipografia abaixo de 12px — PARCIALMENTE RESOLVIDO

**Medido:** 211 declarações `font-size` em `public/styles/`; **13** estão
abaixo de 12px. Nove são glifos numéricos/badges (exceção legítima:
`.nav-badge`, `.notif-count`, `.tnode .count`, `.ctm-badge`, `.pin-badge`,
`.note-count`, `.remind-badge`, `.va-av-ini` e o morto `.del`). **Quatro
são texto corrido**, que o piso deveria cobrir:

| Arquivo:linha | Seletor | px | Conteúdo real |
|---|---|---|---|
| `01-temas.css:455` | `.update-chip` | 11 | "Atualizar app" |
| `03a-sidebar-explorer.css:249` | `.sr-count` | 11 | "12 resultados · filtros: …" |
| `03a-sidebar-explorer.css:260` | `.tag-chip` | 11 | nome da tag |
| `17-workspace-paginas.css:118` | `.daily-counter small` | 11 | "de 5" |

**Por que o teste não pegou:** `tests/sync.test.js:111` valida o piso, mas
isenta qualquer seletor que case com
`/badge|count|chip|dot|png|ini\b|av-|glyph|indicator|\.del\b/i`. A regex
foi pensada para glifo numérico e acabou isentando **texto** com "chip"
ou "count" no nome. O teste passa, o texto continua em 11px.

**Como fechar:** subir as quatro regras para 12px e validar em 375px
(`.tag-chip` é a mais apertada: `padding: 4px 9px`). Estreitar a isenção
do teste para os seletores realmente numéricos — não para qualquer
`chip|count`.

### B1b. Contraste abaixo de AA — PARCIALMENTE RESOLVIDO

**Medido** pela fórmula WCAG 2.1 sobre os tokens de `01-temas.css`
(alpha composto sobre o fundo real; no caso da bolha, o fim do gradiente
`--bubble-me-2`, que é onde a meta fica).

O que **já está resolvido** no código atual:

- `.bubble .meta` em bolhas próprias e remotas: **5,11–9,21:1** nos temas claros
  (usa `--bubble-meta`, não mais `inherit` + `opacity`).
- `.explorer-label`: passou a usar `--text` — não é mais `--text-dim`.
- `.settings-label` sobre `--bg-elev`: mínimo **4,54:1** (sakura).

O que **ainda falha**:

| Onde | Tema | Ratio | Piso |
|---|---|---|---|
| `.bubble-idea` — texto e meta brancos sobre `--bubble-gray` | sakura | **2,36** | 4,5 |
| idem | napolitano | **2,52** | 4,5 |
| idem | terracota | **3,33** | 4,5 |
| idem | mint | **3,61** | 4,5 |
| idem | ocean | **3,83** | 4,5 |
| idem | lavender | **3,89** | 4,5 |
| `.bubble .meta` sobre `--bubble-me-2` | midnight | **4,11** | 4,5 |
| `--text-dim` sobre `--surf-explorer` (`.brand-sub`, `.me-mail`, `.tree-title`) | sakura | **4,02** | 4,5 |

`dark` e `midnight` passam no idea bubble (14,3:1); `dark` passa na meta
(7,81:1). A `.tag-chip` herda a cor da bolha e, por isso, falha junto com
a ideia nos mesmos seis temas.

**Por que ainda falha:** a correção de 29/09 criou `--bubble-meta` para as
bolhas **normais**, mas `.bubble-idea` usa `--bubble-gray` (um fundo
claro) e continua herdando branco. O `midnight` ficou fora da medição
anterior: a meta dele é `rgba(255,255,255,.7)`, e scripts que só leem
`#rrggbb` pulam o valor.

**Como fechar:** definir `--on-bubble`/`--bubble-meta` escuros para o
estado idea nos seis temas (ou escurecer `--bubble-gray` até 4,5:1),
ajustar a meta do `midnight` e escurecer `--text-dim` do sakura só no
contexto da sidebar. Revalidar os 8 temas com a fórmula — não a olho.

### B2. `.bubble .del` invisível em touch — OBSOLETO (CSS morto)

O item pedia uma decisão de produto entre (a) mostrar sempre e (b) remover.
A decisão já foi tomada pelo uso: **o botão não existe mais**. Não há
`class="del"` em `public/partials/`, `public/index.html` nem nos módulos
de mensagem; a exclusão acontece pelo menu ▾. Sobrou apenas o CSS:

- `03b-chat-bolhas.css:952` — `.bubble .del`
- `03b-chat-bolhas.css:954` — `.bubble:hover .del`

**Como fechar:** apagar as duas regras. Não é mais decisão de produto.

### B3. `.search-results` em telas pequenas — ABERTO (só device)

`03a-sidebar-explorer.css:233` mantém `max-height: 40vh`; o painel novo
de busca usa `45vh` (`16-explorer-busca-paginas.css:33`). Nenhum dos dois
foi validado em iPhone SE real — e não é auditável em CI. Continua como
item de validação física, não de código.

---

## Prioridade 2 — Correção funcional (novos)

### B6. A busca global só enxerga o cache local (≤200 notas) e ignora acento

**Evidência:** `runSearch` varre apenas `Store.data.notes`
(`public/js/ui/navigation.js:120`). Esse mapa é preenchido pelo snapshot
com `limit(200)` — as 200 notas mais recentes de todas as conversas
(`public/js/sync-supabase.js:143`) — mais as páginas de 25 que o usuário
já rolou. Nota antiga de conversa nunca aberta **não aparece na busca**.
Além disso, a comparação é `toLowerCase().includes()`, sem `NFD`: buscar
"coracao" não encontra "coração". Não existe nenhum teste de busca no
repo.

**Impacto:** para quem tem histórico, a busca — que é o principal atalho
do app — responde "nenhum resultado" para conteúdo que existe.

**Como fechar:** busca no servidor com `tsvector` + índice GIN +
`unaccent`/`pg_trgm` e RPC com `ts_headline` para o trecho; fallback
offline no cache local; manter os filtros (`in:`, `#tag`, `depois:`,
`antes:`) no cliente. Testes: unit do parser de filtros e e2e com nota
antiga que não está no snapshot.

### B7. O assistente só conhece as 15 conversas mais recentes × 10 notas

**Evidência:** `_buildAiContext` ordena por criação, corta em 15 conversas
e pega `slice(-10)` de cada uma; cada nota é truncada em 300 caracteres
(600 para transcrição) e o contexto inteiro em 24.000 caracteres —
`public/js/ui/workspace-ai.js:50-68`. O CHANGELOG v1.25.0 documenta o
mesmo limite.

**Impacto:** a promessa "ela conhece suas notas" vale só para o recorte
recente. Perguntas sobre um projeto antigo recebem "não encontrei", mesmo
com a nota no banco.

**Como fechar:** retrieval de verdade — embeddings do Gemini em `pgvector`,
top-k por similaridade + citações (conversa e data), e o contexto montado
a partir dos resultados, não de um `slice`. Reaproveita a infra de IA que
já existe (`api/ai.js`, chave no servidor).

### B8. A gravação local pode falhar em silêncio (risco de perda de dados)

**Evidência:** `_write` engole qualquer exceção —
`public/js/store.js:40` (`catch (e) {}`). O store principal é
`localStorage` (~5 MB por origem), e imagens têm fallback base64 quando o
upload falha (`public/js/ui/composer.js:186`). `_read` também devolve
`null` em JSON corrompido, sem avisar.

**Impacto:** com a cota cheia e offline, a nota aparece na tela, o app
não acusa erro e ela não sobrevive ao reload. É perda de dados
silenciosa — o pior tipo de bug para um app de notas.

**Como fechar:** mover o bucket de notas para IndexedDB (mantendo
`localStorage` para preferências), ou, no mínimo, fazer `_write` retornar
sucesso/erro, mostrar toast + banner de armazenamento cheio e comprimir a
imagem antes do fallback base64. Um teste de cota simulada (mock de
`setItem` que lança) trava a regressão.

### B9. Edição concorrente perde uma das versões sem avisar

**Evidência:** o merge de `note:edit` compara `editedAt` e só aceita o
que tem timestamp/rev maior — `public/js/ui/sync-events.js:65`. Não há
detecção de divergência nem histórico de revisão.

**Impacto:** dois aparelhos offline editando a mesma nota: a segunda
edição a chegar sobrescreve a primeira, sem conflito visível. O usuário
só descobre quando o texto sumiu.

**Como fechar:** guardar o `rev` base da edição e, quando o servidor
estiver à frente, preservar a versão em uma tabela de revisões e mostrar
"editada em outro dispositivo" com opção de ver/restaurar (ou diff3 no
texto). Não precisa de CRDT para o caso de uma nota.

---

## Prioridade 3 — Dívida técnica e robustez

### B4. `.pin-badge` espalhado em 3 arquivos — ABERTO (confirmado)

Cinco blocos, exatamente como antes:

- `03b-chat-bolhas.css:945` — base (cor/tamanho)
- `05-ui-ux-v6.css:79` — geometria
- `05-ui-ux-v6.css:134` — variante `.bubble.remote`
- `15-delight-motion.css:24` — `transform-origin`
- `15-delight-motion.css:25` — animação `.pin-anim`

**Cuidado:** consolidar exige preservar a ordem dos imports de
`public/styles.css` e rodar `scripts/css-parity.mjs`.

### B5. Auditar `docs/MOTION_DESIGN.md` — RESOLVIDO (auditado)

As quatro fases existem no código:

- Fase 1: tokens `--ease-*` / `--dur-*` em `14-animacoes.css:9-13`.
- Fase 2: `hideWithExit` em `public/js/utils.js:27` + `.leaving` em
  `04-responsive.css:45-55`.
- Fase 3: `.bubble.incoming-note` em `15-delight-motion.css:35` e o pop
  do `pin-badge` no mesmo arquivo.
- Fase 4: animações ambientais com 10 blocos de `reduced-motion` no CSS.

O documento pode voltar a ser fonte.

### B10. `supabase-js` vem de CDN em runtime, fora do service worker

**Evidência:** `import('https://esm.sh/@supabase/supabase-js@2.112.3')`
em `public/js/sync-supabase.js:20` e em `public/oauth-callback.html:96`.
O SW **ignora** esse host de propósito (`public/sw.js:120`), e o CSP
precisa liberar `esm.sh` (`vercel.json`).

**Impacto:** sem o CDN (bloqueio, queda, rede restrita), login e sync não
funcionam — inclusive no primeiro boot offline. É também uma dependência
de terceiro no caminho crítico de autenticação.

**Como fechar:** vendorizar o bundle ESM em `public/vendor/`, importar
por caminho relativo, incluir no precache do SW e remover `esm.sh` do
CSP. Atualizar a versão passa a ser um commit, não um deploy silencioso
de terceiro.

### B11. Observabilidade inerte

**Evidência:** `window.SENTRY_DSN = ''` em `public/index.html:201` — o
loader existe, mas nunca inicializa. Falhas de `_write` e erros de sync
só aparecem como toast transitório — não ficam registrados em lugar
nenhum.

**Impacto:** erro em produção é invisível; taxa de falha de sync e cota
de armazenamento são desconhecidas.

**Como fechar:** configurar o DSN (conta free) e capturar
`unhandledrejection`, falhas de sync que esgotam retry e falhas de
`_write`. Sem PII: nunca enviar texto de nota.

### B13. O snapshot corta conversas e cadernos em 100

**Evidência:** `loadSnapshot` busca `threads` com `.limit(100)` e `folders`
com `.limit(100)` — `public/js/sync-supabase.js:141-142`. Não existe outra
consulta que traga conversas (o resto são upserts/updates). Num aparelho
novo, quem tem mais de 100 conversas só vê as 100 de `updated_at` mais
recente; as antigas não aparecem nem na árvore nem na busca.

**Impacto:** conteúdo que existe no servidor fica inalcançável no cliente,
sem aviso. É diferente de B6 (busca): aqui a conversa some da navegação.

**Como fechar:** metadados de conversa/caderno são pequenos — paginar até
o fim (ou buscar tudo com `.range` em blocos) no snapshot; se o volume
crescer, carregar sob demanda com contador. Teste: semear 110 conversas e
garantir que a 101ª aparece.

### B14. Compartilhar conversa entre pessoas — NÃO EXISTE

**Evidência:** as policies são `auth.uid() = user_id` em `threads`,
`folders` e `notes` (`supabase.sql:78-84`); não há tabela de membros. O
menu “Convidar” da conversa apenas avisa que o recurso não existe
(`public/help.html`, seção Conversas).

**Impacto:** é a lacuna de produto mais óbvia para um app em formato de
chat: não dá para dividir um caderno com outra pessoa. Também é o que
impede uso em casal/equipe.

**Como fechar (produto):** `thread_members(thread_id, user_id, role)` +
policies por membership; convite por e-mail/link; presença no Realtime.
Exige decidir escopo (conversa ou caderno), papéis e saída/revogação.

### B15. Lembretes só disparam com o app aberto

**Evidência:** o agendador é `setInterval` de 20 s + foco da janela
(`public/js/ui/reminders.js:66-72`); o service worker tem
`notificationclick` (`sw.js:81`), mas **não tem handler `push`**.

**Impacto:** o usuário programa um lembrete, fecha o app e não é avisado.
Para um app de notas com “Lembrar-me”, é uma promessa quebrada na metade
dos casos.

**Como fechar:** Web Push (VAPID) + inscrição no SW + cron/serviço que
consulta lembretes vencidos e envia push. Exige tabela de subscriptions e
uma função agendada (Supabase Cron ou Vercel Cron).

### B16. As funções de IA não têm cota por conta

**Evidência:** `api/ai.js` valida a sessão e limita `maxOutputTokens` a
4096, mas não limita **quantas chamadas** um usuário faz; `api/transcribe.js`
tem o mesmo desenho. Com o provedor compartilhado (v1.22), qualquer conta
logada consome a cota do projeto.

**Impacto:** custo imprevisível e vetor de abuso (loop de chamadas). Não é
vazamento de chave — é consumo.

**Como fechar:** contador por `user_id`/janela (tabela + RPC atômica ou
KV), resposta 429 com retry-after e limite separado para transcrição.

### B17. Imagens e áudios são públicos por URL

**Evidência:** os buckets `note-images` e `note-audio` são criados com
`public = true` e policy de leitura aberta (`supabase.sql:102-134`). O path
inclui `uid` e timestamp, mas quem tiver a URL acessa sem sessão.

**Impacto:** privacidade — uma URL vazada (histórico, print, log) expõe a
imagem/áudio para sempre. Para LGPD, “público por URL” merece decisão
explícita.

**Agravante:** o “Apagar tudo” remove linhas de `notes`/`threads`/`folders`
(`sync-supabase.js:345-366`), mas **não chama `storage.remove`** — as
imagens e os áudios continuam no bucket público depois da exclusão.

**Como fechar:** bucket privado + `createSignedUrl` na renderização, com
cache do URL assinado; no “Apagar tudo”, remover também os objetos do
usuário (`uid/…`) antes de limpar as tabelas. URLs antigas deixam de
funcionar sozinhas.

### B12. Documentação desatualizada — CORRIGIDO NESTA AUDITORIA

`BACKLOG.md` dizia "B1 resolvido" (4 textos em 11px), listava B2 como
decisão de produto (CSS morto) e não registrava B6–B13. `UI_UX_MELHORIAS.md`
repetia os números antigos e falava em "7 temas" (são 8); `ROADMAP_ESTAVEL.md`
ainda marcava contraste AA como ✅; `README.md`, `public/help.html`,
`STORE_LISTING.md` e `MOBILE_TASKS.md` descreviam um app menor do que o
atual. Em 20/10/2026 esses documentos foram alinhados e o inventário
[ESTADO_ATUAL.md](ESTADO_ATUAL.md) passou a ser a fonte da verdade do que
existe (features, limites e lacunas).

---

## Ordem sugerida

1. **B8** — perda silenciosa de dados é o risco mais caro e o conserto
   mínimo é barato.
2. **B13** — conversa inacessível acima de 100 é perda funcional grave.
3. **B6** — bug funcional visível e base para B7.
4. **B9** — conflito de edição destrói texto de forma difícil de perceber.
5. **B15** — lembrete sem push quebra a promessa do recurso.
6. **B1 / B1b** — acessibilidade medida, com escopo pequeno e verificável.
7. **B7** — aposta de produto (retrieval), depois da busca.
8. **B10 / B11 / B16 / B17** — confiabilidade, custo e privacidade.
9. **B14** — compartilhamento (decisão de produto + schema novo).
10. **B4 / B3** — dívida e validação em device real.

---

## Como medir

```bash
# 1. Tipografia: quantas regras abaixo do piso e onde
grep -rho "font-size: *[0-9.]*px" public/styles/*.css \
  | sed 's/font-size: *//;s/px//' | awk '$1<12' | sort -n | uniq -c
grep -rn "font-size: *\(10\|11\|11\.5\)px" public/styles/*.css

# 2. Contraste: fórmula WCAG sobre os tokens de 01-temas.css
#    (alpha composto sobre o fundo; gradiente = --bubble-me-2 na meta)
#    Piso AA para texto normal: 4.5:1

# 3. O item ainda existe no código?
grep -rn "classe-ou-seletor" public/js public/partials public/styles

# 4. Suíte (inclui o teste de piso tipográfico)
npm run check && npm test
```

> O teste de tipografia isenta `chip|count|badge` por nome de seletor.
> Se for medir texto, **leia o seletor e o conteúdo**, não só o resultado
> verde do teste.

---

## Resolvido (referência)

| Item | Evidência |
|---|---|
| Login Google quebrado (PKCE vs implicit) | `c765cdf` |
| Friendly Names em produção | `c765cdf` |
| Página "Como usar" | `a0d8deb`, `8104358` |
| Touch targets ≥44px | v71 |
| Focus trap no modal | v71 |
| Toast safe-area + animação de saída | v73 |
| `transition: all` (9 → 0) | v75 |
| Fontes subsetadas sob demanda | v75 |
| CI em `staging`, `main` protegida, `npm run promote` | PR #1, #2 |
| `.bubble .meta` em bolhas próprias/remotas ≥4,5:1 | medido 20/10/2026 (5,11–9,21) |
| `.explorer-label` / `.settings-label` AA | medido 20/10/2026 (`--text`; 4,54 mín.) |
| Motion design fases 1–4 | auditado 20/10/2026 (tokens, `hideWithExit`, `.leaving`, `incoming-note`) |
| B2 `.bubble .del` | CSS morto — nunca renderizado (grep 20/10/2026) |

---

## Armadilha do backlog

`docs/UI_UX_MELHORIAS.md` afirmava quatro pendências que **já estavam
resolvidas** — `transition: all`, duplicações de CSS, `sidebar: 300px`,
inputs sem label. A causa: o CSS foi fatiado em 22 arquivos e o documento
não acompanhou. Um item de backlog sem verificação custa mais que
nenhum, porque direciona trabalho para código já consertado.

Esta auditoria achou duas variações do mesmo problema:

- **B2** parecia uma decisão de produto, mas o botão não é renderizado —
  o item era CSS morto.
- **B1** parecia resolvido porque o teste passava; a regex de isenção do
  próprio teste isentava texto com "chip"/"count" no nome.

**Regra:** se o item veio de um documento (ou de um teste verde), meça
antes de começar — e confira *o que* o teste está isentando.
