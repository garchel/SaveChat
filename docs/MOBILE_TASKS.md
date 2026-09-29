# Auditoria Mobile — SaveChat (detalhe técnico)

> **Companion do roadmap.** O checklist priorizado está em **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md) Fase 3**. Este arquivo mantém a evidência viewport `375×812` (iPhone X via Playwright).
> Re-auditado em 24/08/2026 contra `styles.css`, `js/ui/*.js` e `index.html` atuais.

## ✅ O que JÁ FUNCIONA bem

| Item | Status | Nota |
|---|---|---|
| Auth screen | ✅ | Card centralizado, touch ok; agora com labels ARIA (`0fd7230`) |
| Sidebar full-screen | ✅ | `translateX(-100%)` + backdrop `.app::before` |
| btn Voltar (‹) | ✅ | mobile-only, com `aria-label="Voltar para a lista de cadernos"` |
| Chat / bolhas / composer | ✅ | Layout 100%; composer cozy flutuante com safe-area |
| Animações ≤0.25s + reduced-motion | ✅ | `bubbleIn .2s`; kill-switch global em `prefers-reduced-motion` |
| Status dot 🟢🟠🔴 | ✅ | `setStatus` recria SVG |
| Long-press bolha (menu msg) | ✅ | 500ms, abre Editar/Excluir/Pinar/Copiar |
| Long-press tnode/pasta (ctx-menu) | ✅ | Favoritar/Renomear/Mover/Excluir |
| Swipe sidebar ↔ chat | ✅ | Bidirecional |
| Haptic | ✅ | `navigator.vibrate` em utils.js |
| Teclado cobre composer | ✅ | `scrollIntoView` + `visualViewport` resize em `composer.js` |
| Pull-to-refresh | ✅ | `_initPullToRefresh()` em `composer.js` + `.pull-indicator` no CSS |
| Pinch-to-zoom lightbox | ✅ | 2 dedos, escala limitada, reset ao fechar (`messages.js`) |
| Safe-area notch | ✅ | `.modal`, `.sidebar`, `.chat-header`, composer (9 ocorrências de `env(safe-area-inset-*)`) |
| Placeholder truncado mobile | ✅ | `@media ≤760px`: nowrap + ellipsis |
| Emoji grid responsivo | ✅ | 8 cols desktop → 6 cols ≤760px |
| Popovers responsivos | ✅ | `settings-popover`/`pin-popover`/`rem-popover`/`note-preview` usam `width: min(Xpx, calc(100vw - 16px))` |
| Zoom mobile habilitado | ✅ | `user-scalable=no` removido (WCAG 1.4.4, commit `0fd7230`) |

## ⚠️ Problemas restantes

### 🟠 ALTO

| # | Problema | Evidência atual | Roadmap |
|---|----------|-----------------|---------|
| 1 | Touch targets <44px: `.btn-icon-sm` 32px (lembretes/notificações), `.toggle-pass` 32px, `.sync-status` 24px, `.np-close` 26px, `.attach-rm` 20px, `.cozy-composer-bar .fmt-btn` 34px (override do base 44px!) | `styles.css` | M3.4 — ✅ RESOLVIDO (v71): hit-area 44×44 via `::after` sem mudar o visual |
| 2 | Modal sem focus trap nem retorno de foco | `js/ui/navigation.js` não trata Tab dentro do modal | W1.x a11y — ✅ RESOLVIDO (v71): trap + Esc + foco devolvido |

### 🟡 MÉDIO

| # | Task | Evidência | Estado |
|---|------|-----------|--------|
| 3 | Search results `max-height: 40vh` — testar em iPhone SE | `16-explorer-busca-paginas.css` | ⏳ **aberto**: precisa de device real, não dá para auditar em CI |
| 4 | ~~Toast sem `safe-area-inset-top` e sem animação de saída~~ | `14-animacoes.css` | ✅ **RESOLVIDO** (v73): medido agora — `.app-toast { top: calc(14px + env(safe-area-inset-top)) }` e a classe `.leaving` faz a saída animada (150ms ease-in, remoção em 180ms, guard `_leaving`). O doc antigo afirmava ausência; o código já tem |
| 5 | `.bubble .del` hover-only (touch usa menu ▾ como única alternativa) | `03b-chat-bolhas.css` | ⏳ **aberto — decisão de produto**: `.bubble .del` tem `position:absolute` e só fica `opacity: 1` em `.bubble:hover`. Em touch não há hover, então o botão fica invisível e o menu ▾ é a única via. Ou se torna visível discreto, ou se remove |

> Re-auditado em 29/09/2026 contra o código. Os dois itens do bloco 🟠 ALTO
> continuam resolvidos desde a v71 e foram confirmados no código atual.

> ✅ Resolvidos desde o snapshot original: settings popover overflow (M3.5), pin popover 520px→`min(620px, calc(100vw-16px))`, haptic (6), teclado (7), emoji grid (9), pinch (11), pull-to-refresh (12), safe-area (17), theme-color dinâmico (W2.2).

## Plano original (mantido p/ histórico) → ver ROADMAP Fase 3

- **Fase 1 críticos:** long-press bolha/tnode + swipe — ✅ implementado
- **Fase 2 alto:** touch 44px ⏳ + popovers responsivos ✅ + `scrollIntoView` ✅ + `vibrate` ✅
- **Fase 3 polimento:** placeholder ✅, emoji cols ✅, pinch ✅, safe-area ✅, theme-color ✅

> Para priorização e critérios de aceite atualizados, siga **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md)**.
