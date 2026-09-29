# Logos — Guia de Uso

> Onde usar cada arquivo de logo do SaveChat. Gerados em 24/08/2026 a partir de `assets/logo.svg` (fonte vetorial original).
> App renomeado para **SaveChat** (v78) — wordmarks e screenshots da loja regerados 25/08/2026 com o nome final.

## Estrutura de pastas

```
assets/                  → fontes de verdade (não são servidas pelo site)
├── logo.svg             → SVG ORIGINAL (cozy, com rx=60 e sombras) — edite aqui
├── logo.png             → export antigo em alta resolução
├── themes/              → 8 variantes (7 temas + mono)
└── store/               → artefatos prontos para a Google Play

public/assets/themes/    → cópias servidas pelo site (temas dinâmicos no app)
public/icon-*.png        → ícones PWA full-bleed referenciados no manifest/head
```

## Qual arquivo usar onde

| Contexto | Arquivo | Nota |
|---|---|---|
| **Google Play — ícone do app** | `assets/store/icon-play-512.png` | 512×512, full-bleed sem cantos: a loja arredonda sozinha |
| **Google Play — feature graphic** | `assets/store/feature-graphic-1024x500.png` | Banner obrigatório; ⚠️ contém wordmark "SaveChat" |
| **App Store / PWABuilder** | `public/icon-1024.png` | 1024×1024 master |
| **PWA / manifest** | `assets/logo.png` + `assets/logo.svg` (referenciados) ou `public/icon-192/512.png` | Manter consistência entre manifest e `<head>` |
| **iOS tela inicial** | `public/apple-touch-icon.png` | Referenciar no `<head>` |
| **Site / README / docs** | `assets/themes/logo-cozy.svg` | Vetor oficial da identidade |
| **Impressão / P&B** | `assets/themes/logo-mono.svg` | Sem gradientes, quadrado branco com borda preta |
| **Favicon da aba** | atualmente `assets/logo.svg` via `<link rel="icon">` | Poderia apontar pro cozy temático |

## Variantes por tema

Geradas a partir dos tokens reais de cada tema (`accent-soft → bubble-me`, texto em `text-dim`, lápis em dois tons do accent):

| Arquivo (em `assets/themes/` e `public/assets/themes/`) | Tema | Gradiente |
|---|---|---|
| `logo-cozy.svg` | Laranja (padrão) | `#FFF0E0 → #E28D42` |
| `logo-lavender.svg` | Lavanda | `#eae4ff → #7c5cff` |
| `logo-dark.svg` | Escuro | `#262626 → #0f0f0f` |
| `logo-mint.svg` | Hortelã | `#dcf3ea → #1faa86` |
| `logo-terracota.svg` | Terracota | `#ffdccf → #ff7a59` |
| `logo-ocean.svg` | Oceano | `#d9edfa → #2b8fd6` |
| `logo-midnight.svg` | Meia-noite | `#1a2745 → #0e1525` |
| `logo-mono.svg` | Preto e branco | sem gradientes — fundo branco + borda preta |

## Logo dinâmico por tema no app

O ícone exibido ao usuário (favicon/PWA instalado) pode acompanhar o tema ativo. Implementação sugerida em `applyTheme()` (`js/ui/settings.js`):

```js
// dentro de applyTheme(), após setar data-theme:
const fav = document.querySelector('link[rel="icon"]');
if (fav) fav.href = `assets/themes/logo-${resolved}.svg`;
// iOS não troca apple-touch-icon dinamicamente (safari cacheia) — manter fixo
```

**Status:** ✅ implementado — `applyTheme()` (`js/ui/settings.js`) troca o `<link rel="icon">` para `assets/themes/logo-<tema>.svg`; variantes servidas de `public/assets/themes/`. Validado em Playwright: clicar nos chips ocean/midnight troca tema **e** favicon (`assets/themes/logo-ocean.svg` etc.), todos os SVGs respondem HTTP 200.

**Limitações honestas:**
- Favicon SVG não funciona no Safari (usar PNG fallback se crítico).
- Ícone do PWA *instalado* é congelado no momento da instalação — trocar favicon não altera o app já instalado.
- `logo-dark.svg` como favicon some em abas com fundo claro do navegador — considerar sempre servir o cozy no navegador e reservar as variantes para contexts controlados (splash, sobre, marketing).

## Regeneração

Os logos foram gerados por script temporário (removido após uso). Para regenerar após editar `assets/logo.svg`: substituir as cores do template pelos tokens do tema alvo — mapeamento documentado na tabela acima. Os PNGs de loja são renderizações Playwright dos SVGs full-bleed (sem `rx` no rect e sem `filter="url(#shadow)"`).
