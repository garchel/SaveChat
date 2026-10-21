# UI/UX — diagnóstico e melhorias

> **Re-auditado em 20/10/2026 contra a v1.25.0.**
> Este arquivo foi reescrito porque o documento anterior descrevia um
> monólito de CSS que não existe mais: o estilo foi fatiado em
> `public/styles/00-*.css` … `19-*.css` (importados em ordem por
> `public/styles.css`), o HTML foi fatiado em `public/partials/`, e o
> JS foi decomposto em mixins. Os números abaixo são medidos, não
> herdados. Como a cascata depende da ordem dos imports, **nenhum item
> aqui autoriza reordenar** os arquivos sem `scripts/css-parity.mjs`.

## O que mudou desde a última versão

| O doc antigo afirmava | Realidade medida em 20/10/2026 |
|---|---|
| `transition: all` em 9 lugares | **0** (grep em `public/styles/`) |
| `.settings-section` ×2, `.bubble .meta` ×3 | **1 cada** — sem duplicação |
| `.explorer-actions` ×2 | **1** |
| `sidebar: 300px` fixo | não existe mais (`--sidebar-w`) |
| Inputs de settings sem `<label for>` | `.settings-label` é classe, não caption — intencional |
| `.explorer-label` usava `--text-dim` e reprovava AA | agora usa `--text` (`03a-sidebar-explorer.css:80`) — passa |
| `.bubble .meta` reprovava AA por `inherit` + `opacity` | agora usa `--bubble-meta`; bolhas próprias/remotas em 5,11–9,21:1 |
| "7 temas" | são **8** (terracota, dark, lavender, mint, ocean, midnight, sakura, napolitano) |
| Motion design "não auditado" | fases 1–4 verificadas no código em 20/10/2026 |

## Problemas reais (medidos hoje)

### 1. Tipografia abaixo do piso de 12px — parcial

A migração de 41 regras aconteceu, mas **13 declarações ainda estão
abaixo de 12px**. Nove são glifos numéricos/badges (`.nav-badge`,
`.notif-count`, `.tnode .count`, `.ctm-badge`, `.pin-badge`,
`.note-count`, `.remind-badge`, `.va-av-ini`) mais o `.del` morto —
exceção legítima. Quatro são **texto corrido**:

| `font-size` | Seletor | Onde | Conteúdo |
|---|---|---|---|
| `11px` | `.update-chip` | `01-temas.css:455` | "Atualizar app" |
| `11px` | `.sr-count` | `03a-sidebar-explorer.css:249` | "12 resultados · filtros: …" |
| `11px` | `.tag-chip` | `03a-sidebar-explorer.css:260` | nome da tag |
| `11px` | `.daily-counter small` | `17-workspace-paginas.css:118` | "de 5" |

**Por que o teste de regressão não viu:** `tests/sync.test.js:111`
ignora qualquer seletor que case com
`/badge|count|chip|dot|png|ini\b|av-|glyph|indicator|\.del\b/i`. A
intenção era isentar glifo numérico; a regex também isenta texto com
"chip" ou "count" no nome. O teste verde não prova o piso.

### 2. Contraste — três focos ainda abaixo de AA

Medido com a fórmula WCAG 2.1 sobre os tokens de `01-temas.css`
(alpha composto; na meta, o fundo é o fim do gradiente `--bubble-me-2`).
Piso AA para texto normal: **4,5:1**.

| Onde | Temas que falham | Ratio |
|---|---|---|
| `.bubble-idea` (texto e meta brancos sobre `--bubble-gray`) | sakura, napolitano, terracota, mint, ocean, lavender | **2,36–3,89** |
| `.bubble .meta` sobre `--bubble-me-2` | midnight | **4,11** |
| `--text-dim` sobre `--surf-explorer` (`.brand-sub`, `.me-mail`, `.tree-title`) | sakura | **4,02** |

- A `.tag-chip` herda a cor da bolha — falha junto com a ideia nos
  mesmos seis temas.
- `.bubble-idea` é renderizada de verdade: texto que começa com
  `ideia:` ganha a classe (`public/js/ui/messages-bubble.js:24`).
- `dark` passa no idea (14,3:1) e na meta (7,81:1). `midnight` passa no
  idea (14,3:1), mas não na meta.

### 3. `.pin-badge` tem 5 blocos espalhados por 3 arquivos

Não é bug, mas é custo de manutenção: base em
`03b-chat-bolhas.css:945`, geometria e variante `.remote` em
`05-ui-ux-v6.css:79/134`, animação e `transform-origin` em
`15-delight-motion.css:24-25`. Quem mexer no badge precisa saber dos
três lugares. Consolidar **preservando a ordem dos imports** (o teste
de paridade existe para isso).

### 4. `.bubble .del` é CSS morto

O botão vermelho de excluir não é renderizado em nenhum módulo nem
partial; a exclusão é feita pelo menu ▾. Sobraram as regras
`03b-chat-bolhas.css:952-954`. Remover.

### 5. Limites conhecidos de arquitetura (não são bugs)

- **Ordem de cascata é contrato.** `public/styles.css` importa em ordem;
  várias regras vencem por declaração, não por especificidade.
- **`partials/` é inlineado no build.** `scripts/build.mjs` substitui
  `<!--#include ...-->`; editar `public/index.html` direto perde o
  partial na próxima build.
- **Resultados de busca em telas pequenas:** `40vh`
  (`03a-sidebar-explorer.css:233`) e `45vh` no painel novo
  (`16-explorer-busca-paginas.css:33`), sem validação em iPhone SE
  real. Não é auditável em CI.
- **Busca é client-side sobre o snapshot de 200 notas** — limitação
  funcional registrada como B6 no `BACKLOG.md`, não é CSS.

## Acessibilidade — estado

- [x] Zoom permitido no viewport (sem `user-scalable=no`)
- [x] Ícones-only com `aria-label`
- [x] Touch targets ≥44px via hit-area `::after` (v71)
- [x] Focus trap no modal + retorno de foco (v71)
- [x] `aria-live` correto no log de mensagens
- [x] Contraste AA nas bolhas normais, `.explorer-label` e settings
- [ ] Contraste AA em `.bubble-idea`, meta do `midnight` e dim do sakura
- [ ] Piso de 12px nos 4 textos listados (`.update-chip`, `.sr-count`,
      `.tag-chip`, `.daily-counter small`)

## Fontes subutilizadas

`Comfortaa`, `Quicksand`, `Fredoka` e `Nunito` continuam disponíveis em
Configurações → Fonte, carregadas sob demanda. Não é dívida — é oferta.

## Como contribuir com este arquivo

1. Meça antes de escrever (grep/contagem no código real).
2. Se um item for resolvido, mova para "O que mudou" com o número e o
   commit — não deixe ✅ no rodapé e ❌ no topo.
3. Não confie só no teste verde: em tipografia, ele isenta `chip|count`
   por nome. Leia o seletor e o conteúdo.
4. `CONTRIBUTING.md` documenta a convenção de versão e o gate de CI.
