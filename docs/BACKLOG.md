# Backlog — SaveChat

Trabalho aberto, medido contra o código em **29/09/2026**.

> Regra: um item só entra aqui com **evidência no código**. Documento que
> afirma pendência sem conferir é pior que nenhum — já aconteceu (ver
> "Armadilha do backlog" no fim).

## Como usar

1. Escolha um item e abra a branch: `git switch staging && git switch -c fix/<item>`
2. `npm run promote` → `npm run preview` → PR para `main`.
3. Ao resolver, mova o item para "Resolvido" com o commit e apague a
   linha do aberto.

---

## Prioridade 1 — Acessibilidade

### B1. Tipografia abaixo de 12px

**Único item confirmado do diagnóstico de UI/UX.** O piso recomendado é
12px; hoje o projeto tem 55 regras abaixo disso.

| `font-size` | regras |
|---|---|
| `10px` | 3 |
| `10.5px` | 4 |
| `11px` | 30 |
| `11.5px` | 18 |

**Por que em etapas:** o layout foi calibrado com esses valores. Subir
tudo de uma vez quebra a composição. Ordem sugerida:

1. `10px` e `10.5px` (7 regras) → medir visualmente nos 6 temas
2. `11.5px` → `12px` (18 regras)
3. `11px` → `12px` (30 regras) — revisar `.settings-label`, `.meta` e
   badges, que são os mais densos

**Verificar:** contraste ≥4.5:1 por tema; nenhum corte em 375px.

---

## Prioridade 2 — Bugs conhecidos

### B2. `.bubble .del` invisível em touch

`03b-chat-bolhas.css` — o botão de excluir fica `opacity: 1` apenas em
`.bubble:hover`. Não existe hover em touch, então o botão fica
invisível e o menu ▾ é a única via de exclusão.

**Precisa de decisão de produto** (não é só CSS):

- (a) tornar o botão visível discretamente sempre, ou
- (b) remover e deixar a exclusão só pelo menu ▾.

**Verificar:** em 375×812 com `hasTouch`, a exclusão é descobrível.

### B3. Search results em telas pequenas

`16-explorer-busca-paginas.css` — `max-height: 40vh` sem validação em
iPhone SE. **Só fecha em device real**; não é auditável em CI.

---

## Prioridade 3 — Dívida técnica

### B4. `.pin-badge` espalhado em 3 arquivos

5 blocos: base em `03b-chat-bolhas.css`, geometria em `05-ui-ux-v6.css`,
animação em `15-delight-motion.css`. Não é bug — quem mexer precisa
saber dos três lugares.

**Cuidado:** consolidar exige preservar a ordem dos imports de
`public/styles.css` e rodar `scripts/css-parity.mjs`.

### B5. Auditar `docs/MOTION_DESIGN.md`

Fora da auditoria de hoje. O arquivo tem 81 linhas e quatro fases; não
verifiquei se as fases 2–4 existem no código. **Não usar como fonte sem
auditar.**

---

## Backlog não é roadmap

Itens aqui **não** estão priorizados por esforço nem por dependência —
só por impacto. Antes de começar um, confira com o `git log` se não foi
resolvido por outra via.

---

## Resolvido (referência)

| Item | Commit |
|---|---|
| Login Google quebrado (PKCE vs implicit) | `c765cdf` |
| Friendly Names em produção | `c765cdf` |
| Página "Como usar" | `a0d8deb`, `8104358` |
| Touch targets ≥44px | v71 |
| Focus trap no modal | v71 |
| Toast safe-area + animação de saída | v73 |
| `transition: all` (9 → 0) | v75 |
| Contraste WCAG AA nos 6 temas | `0fd7230` |
| Fontes subsetadas sob demanda | v75 |
| CI em `staging`, `main` protegida, `npm run promote` | PR #1, #2 |

---

## Armadilha do backlog

`docs/UI_UX_MELHORIAS.md` afirmava quatro pendências que **já estavam
resolvidas** — `transition: all`, duplicações de CSS, `sidebar: 300px`,
inputs sem label. A causa: o CSS foi fatiado em 21 arquivos e o documento
não acompanhou. Um item de backlog sem verificação custa mais que
nenhum, porque direciona trabalho para código já consertado.

**Regra:** se o item veio de um documento, meça antes de começar.
