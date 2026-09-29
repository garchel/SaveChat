# UI/UX — diagnóstico e melhorias

> **Re-auditado em 29/09/2026 contra o código atual.**
> Este arquivo foi reescrito porque o documento anterior descrevia um
> monólito de CSS que não existe mais: o estilo foi fatiado em
> `public/styles/00-*.css` … `18-*.css` (21 arquivos, importados em ordem
> por `public/styles.css`), o HTML foi fatiado em `public/partials/`, e o
> JS foi decomposto em mixins. Os números abaixo são medidos, não
> herdados. Como a cascata depende da ordem dos imports, **nenhum item
> aqui autoriza reordenar** os arquivos sem `scripts/css-parity.mjs`.

## O que mudou desde a última versão

Três itens que o documento anterior listava como pendentes **já estão
resolvidos** (a versão antiga só marcava ✅ no rodapé, deixando o
diagnóstico do topo contraditório):

| O doc antigo afirmava | Realidade medida |
|---|---|
| `transition: all` em 9 lugares | **0** (grep em `public/styles/`) |
| `.settings-section` ×2, `.bubble .meta` ×3 | **1 cada** — sem duplicação |
| `.explorer-actions` ×2 | **1** |
| `sidebar: 300px` fixo | não existe mais |
| Inputs de settings sem `<label for>` | `settings-label` virou classe CSS, não caption |

Os "scattering" que sobraram (`.pin-badge` em 3 arquivos, `.msg-toggle`
em vários) **não são duplicação**: são escopos distintos
(`.bubble.remote .msg-toggle::before` ≠ `.bubble .msg-toggle:hover`).
Last-wins esconder bug só existe quando o **mesmo seletor** declara a
**mesma propriedade** duas vezes.

## Problemas reais (medidos hoje)

### 1. Tipografia abaixo do piso de 12px — CONFIRMADO

A única pendência concreta que sobreviveu à auditoria. Semântica: afeta
leitura de texto secundário e é a violação de acessibilidade com maior
superfície no projeto.

| `font-size` | regras | onde (amostra) |
|---|---|---|
| `11px` | **30** | `.settings-label`, `.meta`, badges |
| `11.5px` | **18** | contagens, legendas |
| `10.5px` | 4 | datas compactas |
| `10px` | 3 | badges pequenos |

Alvo: 12px como piso. Impacto visual existe (o layout foi calibrado com
esses valores), então migrar em etapas — primeiro os `10px`/`10.5px` (7
regras), medir, depois os `11px`/`11.5px`.

### 2. `.pin-badge` tem 5 blocos espalhados por 3 arquivos

Não é bug, mas é custo de manutenção: quem mexer no badge precisa saber
que `top/left` está em `05-ui-ux-v6.css` e a cor base em `03b`. Considere
consolidar num arquivo só, **preservando a ordem dos imports** (o teste
de paridade existe para isso).

### 3. Limites conhecidos de arquitetura (não são bugs)

- **Ordem de cascata é contrato.** `public/styles.css` importa em ordem;
  várias regras vencem por declaração, não por especificidade.
- **`partials/` é inlineado no build.** `scripts/build.mjs` substitui
  `<!--#include ...-->`; editar `public/index.html` direto perde o
  partial na próxima build.

## Acessibilidade — estado

Ver `references/a11y-state.md` na skill `notethread-dev` para o snapshot
completo. Resumo do que já é garantido por teste:

- [x] Zoom permitido no viewport (sem `user-scalable=no`)
- [x] Ícones-only com `aria-label`
- [x] Contraste ≥4.5:1 nos 7 temas (commit `0fd7230`)
- [x] Touch targets ≥44px via hit-area `::after` (v71)
- [x] Focus trap no modal + retorno de foco (v71)
- [x] `aria-live` correto no log de mensagens

## Fontes subutilizadas

`Comfortaa`, `Quicksand`, `Fredoka` e `Nunito` continuam disponíveis em
Configurações → Fonte, carregadas sob demanda. Não é dívida — é oferta.

## Como contribuir com este arquivo

1. Meça antes de escrever (grep/contagem no código real).
2. Se um item for resolvido, mova para "O que mudou" com o número e o
   commit — não deixe ✅ no rodapé e ❌ no topo.
3. `CONTRIBUTING.md` documenta a convenção de versão e o gate de CI.
