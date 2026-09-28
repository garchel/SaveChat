# Roadmap — SaveChat v1 Estável (Web + Mobile)

> **Checklist único de lançamento.** Consolida `PROGRESSO.md` + `MOBILE_TASKS.md` e adiciona tasks faltantes para uma versão estável.
> Última atualização: 24/08/2026 · Fonte técnica: `README.md`, `public/app.js`, `public/js/**`, `vercel.json`, `.github/workflows/ci.yml`, `supabase.sql`

> **⚠️ Nota de arquitetura (24/08):** o backend Node próprio (`server/*`) foi **removido** (`17cdd5d`). Deploy é estático na **Vercel** (`vercel.json`: headers CSP/X-Frame, cache-control do SW) + **Supabase** para auth (Google OAuth), Postgres com RLS e Storage. As Fases 0–1 abaixo foram absorvidas por essa pilha — mantidas como histórico.

---

## 0. Definição de Pronto (DoR) para v1

**Web estável =** host HTTPS único ✅ (Vercel) + BD persistente ✅ (Supabase) + auth real ✅ (Google OAuth via Supabase) + PWA instalável ✅ + Lighthouse PWA ≥90 ⏳ medir + sem `confirm()` nativo ✅ + sem perda de dados ao reiniciar ✅.

**Mobile estável =** touch ≥44px ✅ (v71, hit-area `::after` validada 375×812) + popovers cabem em 375px ✅ + swipe/back funcionam ✅ + APK/TWA instalável com ícones finais ✅ assets prontos + **re-teste em device real** ⏳.

---

## 🚀 PLANO DE LANÇAMENTO (auditoria 24/08/2026)

> Análise dedicada de "o que falta para lançar web+mobile". Os bloqueadores abaixo foram identificados contra o código real. Sem eles, o app funciona como demo mas não como produto público.

### 🔴 Bloqueadores Web

| # | Item | Por quê bloqueia | Esforço | Status |
|---|------|------------------|---------|--------|
| LB-W1 | **Domínio de produção indefinido** — nenhuma URL prod no repo; Supabase Auth precisa do domínio em Site URL + Redirect URLs antes do 1º login (`redirect_uri_mismatch`) | Login Google falha em prod | Config no dashboard (~30 min) | [ ] |
| LB-W2 | **OAuth consent screen em modo Testing** | Fora dos ~100 test users → `Access blocked`. É o limite entre demo e produto | Publicar External; scopes email/profile/openid não exigem verificação extensa (review 3-7 dias se pedirem) | [ ] |
| LB-W3 | **"Apagar tudo" só limpa local** — `settings.js` zera `Store.data` sem chamar `.delete()` nas tabelas → dados ressincronizam ao recarregar. Risco LGPD: usuário não consegue exercer exclusão | Bug + conformidade legal | ~1h (loop delete em threads/folders/notes) | [x] ✅ `Sync.deleteAllRemote()` apaga notes/threads/folders no Supabase antes do cleanup local (v76) |
| LB-W4 | **Privacy Policy desatualizada** — menciona `data.json`, Render/Railway e "futuro Postgres"; contato sem domínio próprio. Play reprova política imprecisa | Conformidade legal | ~1h reescrever | [x] ✅ reescritas para ChatSolo + arquitetura Vercel/Supabase/Google, seção LGPD (v76) |

### 🔴 Bloqueadores Mobile (TWA)

| # | Item | Por quê bloqueia | Esforço | Status |
|---|------|------------------|---------|--------|
| LB-M1 | **Touch targets <44px** (6 controles: `.btn-icon-sm` 32, `.toggle-pass` 32, `.sync-status` 24, `.np-close` 26, `.attach-rm` 20, override `.cozy-composer-bar .fmt-btn` 34) | Revisão de acessibilidade da Play | ~2h via pseudo-elemento (= M3.4) | [x] ✅ hit-area 44px via `::after` (v71) |
| LB-M2 | **Manifest sem `screenshots`/rich info** | PWABuilder usa para score máximo e gera assets da loja | ~1h + capturas | [x] ✅ 2 screenshots + lang/categories (v72) |
| LB-M3 | **Re-teste device real nunca feito** (só Playwright desde 21/08) | Docs exigem validação física antes da loja | Meio dia | [ ] |

### 🟡 Importantes (lançar sem = dor operacional)

| # | Item | Impacto |
|---|------|---------|
| IMP-1 | **Import de backup ausente** (export JSON existe, import não) — usuário perde dados sem recovery path | Suporte/churn | ✅ Import em Configurações→Dados: merge por id, validação de shape, toasts de erro/sucesso (v72) |
| IMP-2 | **Sem baseline Lighthouse** — W2.6 pede PWA ≥90, nunca medido em prod. Medir ANTES de submeter à loja | Risco de reprovação | ✅ baseline registrado em `docs/LIGHTHOUSE_BASELINE.md` (A11y 100, BP 100, Perf 82 local) |
| IMP-3 | **Versionamento dessincronizado** — package.json `1.0.0` vs CHANGELOG `[1.2.0]`, zero git tags | Higiene de release | ✅ sincronizado a cada release — v1.4.0 (01/09/2026) |
| IMP-4 | **Focus trap ausente no modal** — Tab escapa pro fundo; teclado-only trava | Acessibilidade | ✅ trap + Esc + foco devolvido ao gatilho (v71) |
| IMP-5 | **Sem observabilidade** — `/health` morreu com o server; zero error tracking. Crash silencioso = usuários perdidos sem saber | Operação | ✅ `js/error-tracking.js` + loader Sentry em index.html (inert até preencher `SENTRY_DSN`) — **resta criar conta free e colar o DSN** |
| IMP-6 | CHANGELOG não era servido pelo site — toast "what's new" dava 404 em prod (Vercel serve só `public/`) | Funcionalidade quebrada | ✅ movido para `public/CHANGELOG.md` + precache no SW (v1.4.0) |
| IMP-7 | Função `rls_auto_enable()` executável por `anon`/`authenticated` via RPC (advisors Supabase) | Segurança | ✅ `revoke execute ... from anon, authenticated, public` aplicado no banco prod + `supabase.sql` (v1.4.0) — advisors limpos |
| LB-M2 | **Manifest sem `screenshots`/rich info** | PWABuilder usa para score máximo e gera assets da loja | ✅ 2 screenshots narrow + lang/categories (v72) |

### Cronograma sugerido

```
Semana 1 (bloqueadores — W1/W2 rodam em paralelo pela espera do Google):
  ☐ W1+W2  domínio + OAuth External
  ☐ W3     fix "Apagar tudo" remoto (+ LGPD)
  ☐ W4     reescrever Privacy/Terms
  ☐ M1     touch targets (= M3.4)
  ☐ I3     tag v1.2.0 + sync package.json

Semana 2 (validação):
  ☐ M3     device real Android (pequeno + grande)
  ☐ I2     Lighthouse baseline ≥90
  ☐ M2     screenshots manifest + TWA no PWABuilder
  ☐ I5     Sentry free tier (~meio dia)

Loja:
  ☐ Assets (screenshots phone/tablet, feature graphic 1024×500)
  ☐ Beta track interno (20 testers) → 0 crash em 3 dias
  ☐ Produção
```

> **Veredito da auditoria:** tecnicamente maduro — o que falta é configuração de conta/domínio, conformidade legal e validação física, não features.

### Atualização 28/09/2026 — lado código fechado

Tudo que dependia do repositório está resolvido e validado (`check` + 18 unit + 8 e2e + build, todos verdes):

- ✅ **Precache do SW alinhado ao manifest** (v118): ícones `icons/icon-512.png` e `icons/icon-maskable-512.png`, `favicon-32.png`, `js/confetti.js` e os 10 logos de tema agora entram no precache — com **teste de paridade manifest↔SW** para o desalinhamento não regressar
- ✅ **`oauth-callback.html`, `confetti.js`, `petals.js`, `ui/tasks.js` e logos sakura/napolitano commitados** (estavam só no working tree; o deploy da Vercel não os teria)
- ✅ **2 bugs de menção corrigidos** (regressão do editor contenteditable): `esc()` reimportado em `mentions.js` e chip serializado de volta para `@[Nome](t:id)` em `_editorText()` — backlinks voltam a sobreviver ao envio; e2e de menções adaptado ao editor novo
- ✅ Higiene: `icons-demo.html` movido para `docs/` (não sai em prod); `theme_color` do manifest alinhado ao tema real (`#E28D42`)
- ⬜ **Resta (fora do repo):** LB-W1 domínio · LB-W2 OAuth em produção · IMP-5 DSN do Sentry · LB-M3 teste em device real · Lighthouse ≥90 medido em prod · Fase 4 (TWA/Play, ver `GUIA_LANCAMENTO_MOBILE.md`)

---

## FASE 0 — Infra mínima — ✅ CONCLUÍDA

| # | Task | Status |
|---|------|--------|
| W0.1 | Git: commit + push | ✅ `main → github.com/garchel/SaveChat` |
| W0.2 | Host único HTTPS | ✅ Vercel (estático; o plano original Render+WS foi substituído pelo Supabase Realtime) |
| W0.3 | Config sync prod | ✅ Supabase direto (`window.SUPABASE_URL` no `index.html`, anon key pública + RLS) |
| W0.4 | Domínio + HTTPS | ✅ HTTPS automático Vercel |

## FASE 1 — Web estável / Dados — ✅ CONCLUÍDA (pilha Supabase)

| # | Task | Status |
|---|------|--------|
| W1.1 | Persistência real | ✅ Supabase Postgres (`sync-supabase.js`), offline-first localStorage + fila |
| W1.2 | Auth real | ✅ Google OAuth via Supabase (`signInWithOAuth`); isolamento por RLS (`auth.uid() = user_id` no `supabase.sql`) |
| W1.3 | Segurança headers | ✅ `vercel.json`: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff |
| W1.4 | Sanitização XSS | ✅ `esc()` + render markdown próprio; auditar a cada novo `innerHTML` |
| W1.5 | Secrets via env | ✅ só anon key pública no cliente (por design); service key fora do repo |
| W1.6 | Observabilidade | ⏳ `/health` não existe mais (sem servidor); considerar Vercel Analytics/Sentry |

## FASE 2 — Web PWA + Qualidade

| # | Task | Arquivo | Aceite | Status |
|---|------|---------|--------|--------|
| W2.1 | Ícones finais | `icon-192/512/1024.png` maskable + `icon.svg` | PWABuilder score 100 | ✅ 1024px existe (58KB), purpose `any maskable` |
| W2.2 | `theme_color` dinâmico por tema | `js/ui/settings.js` atualiza `<meta name="theme-color">`; manifest fixo `#7c5cff` | Status bar muda com tema | ✅ meta dinâmico (manifest continua fixo — aceitável) |
| W2.3 | SW bump + offline | `sw.js` v70, CSS/JS network-first, `updateViaCache:none` | Funciona avião | ✅ (bump pareado com teste a cada deploy) |
| W2.4 | CI/CD | `.github/workflows/ci.yml` | PR bloqueia se teste falha | ✅ check + test + e2e |
| W2.5 | Testes | `tests/sync.test.js` (node:test) + Playwright e2e | Verde local e CI | ✅ 8 unit + 2 e2e specs |
| W2.6 | Performance | `vercel.json` cache-control p/ sw.js; compress nativo Vercel | Lighthouse ≥90 | 🟡 parcial — medir Lighthouse |
| W2.7 | Legal: privacy + terms | `public/privacy.html`, `public/terms.html` | URLs válidas | ✅ existem |
| W2.8 | Versionamento semver + CHANGELOG | `package.json` 1.0.0 + `CHANGELOG.md` | Tag v1.0.0 | 🟡 arquivos existem; tag pendente |

## FASE 3 — Mobile estável — detalhes em `MOBILE_TASKS.md`

### 3A. Críticos — ✅ TODOS implementados
Long-press bolha ✅ · long-press tnode/pasta ✅ · navegação sidebar↔chat bidirecional ✅
> Falta apenas: re-teste em device real antes da loja.

### 3B. Alto impacto

| # | Task | Aceite | Status |
|---|------|--------|--------|
| M3.4 | Touch targets ≥44px | WCAG | ✅ hit-area 44×44 via `::after` nos 6 controles (v71); validado Playwright 375×812 — 16/16 checks |
| M3.5 | Popovers responsivos | caber em 375px | ✅ `min(Xpx, calc(100vw - 16px))` em todos |
| M3.6 | Teclado cobre composer | textarea visível | ✅ scrollIntoView + visualViewport |
| M3.7 | Haptic | vibra Android | ✅ |

### 3C. Polimento

| # | Task | Status |
|---|------|--------|
| M3.8 | Placeholder truncado mobile | ✅ media query com ellipsis |
| M3.9 | Emoji grid mobile | ✅ 8→6 cols ≤760px (o roadmap pedia 4; 6 provou ser suficiente) |
| M3.10 | Lightbox pinch-to-zoom | ✅ |
| M3.11 | Safe-area notch | ✅ modal/sidebar/header/composer |
| M3.12 | Pull-to-refresh | ✅ `_initPullToRefresh()` |
| M3.13 | Search max-height 40vh em SE | ⏳ validar device real |

## FASE 4 — Loja (APK/TWA)

| # | Task | Aceite | Status |
|---|------|--------|--------|
| L4.1 | TWA via PWABuilder | APK instala standalone | ⏳ pré-requisitos ok (manifest completo, SW, ícones) |
| L4.2 | Assets loja | Play Console sem warnings | ⏳ |
| L4.3 | Contas dev | — | decisão do dono |
| L4.4 | Monetização | TWA MVP vs Capacitor v2 | decisão do dono |
| L4.5 | Beta track | 0 crash em 3 dias | ⏳ |

## FASE 5 — v2 (OAuth público externo)

> Sem mudança desde 21/08 — tasks V5.1–V5.5 (publicar OAuth consent screen, scopes, domínios, URLs Supabase) continuam válidas para quando sair do Testing. V5.6 Capacitor depende de L4.4.

---

## FASE 6 — Melhorias de produto & arquitetura

> Levantamento 21/08, re-auditado 24/08. Ordem = impacto ÷ esforço.

### Produto (diferencial visível)

| # | Task | Detalhe | Status |
|---|------|---------|--------|
| P6.1 | ✅ Busca com filtros | `in:` `#tag` `depois:` `antes:` + chips | ✅ |
| P6.2 | ✅ Backlinks/menções | `@[Nome](t:id)` + dropdown "Mencionado em" no nome da nota (popover dedicado) | ✅ evoluiu: agora fica no menu do título |
| P6.3 | ✅ Lembretes/notifications | datetime + scheduler + Notification API + badge + clique na notificação abre a thread (SW `notificationclick`) | ✅ push com app fechado segue v2 |

### Arquitetura

| # | Task | Status |
|---|------|--------|
| A6.4 | ✅ Quebrar app.js em 18 ES Modules | ✅ |
| A6.5 | ✅ Remover legado server/* | ✅ |
| A6.6 | ✅ Testes do fluxo real (Playwright e2e no CI) | ✅ |

### Robustez

| # | Task | Status |
|---|------|--------|
| R6.7 | ✅ Imagens em Supabase Storage + fallback base64 | ✅ |
| R6.8 | ✅ Paginação real (.range + infinite scroll) | ✅ |
| R6.9 | ✅ PWA update UX ("what's new" no toast via CHANGELOG) | ✅ |

### Novo (24/08) — acessibilidade e motion

| # | Task | Detalhe | Status |
|---|------|---------|--------|
| Q6.10 | ✅ Acessibilidade HIGH | Contraste ≥4.5:1 nos 7 temas, zoom habilitado, aria-labels icon-only, labels login — commit `0fd7230` | ✅ |
| Q6.11 | ✅ Motion design | Identidade "playful contido" implementada (Fases 1–4, v73/v74) — ver `docs/MOTION_DESIGN.md` | ✅ |
| Q6.12 | ✅ UI polish restante | Botões unificados (`.btn` v73), touch targets ≥44px (v71), focus trap (v71), skeleton + CTA empty state (v73) | ✅ |

---

## Ordem recomendada (atualizada)

> **Substituído pelo PLANO DE LANÇAMENTO acima** (24/08) — que detalha bloqueadores, importantes e cronograma. Resumo da ordem antiga, ainda válida como fundamento:

1. ~~Fase 0~~ / ~~Fase 1~~ — ✅ feitas pela pilha Vercel+Supabase.
2. Bloqueadores LB-W1..W4 + LB-M1 (touch targets = M3.4).
3. Importantes IMP-1..5 em paralelo.
4. Re-teste device real + Lighthouse baseline.
5. Fase 4 loja (TWA) → Beta track.
6. Fase 5 v2 externo quando for publicar fora dos test users.
7. Fase 6 melhorias (Q6.11/Q6.12) em paralelo.

## Como validar

```bash
npm run dev                        # :3001 (ou porta livre que serve escolher)
npm run check                      # node --check em todo JS público
npm run test                       # node:test (inclui assertion da versão do SW)
npm run e2e                        # Playwright: fluxo nota + menção
# Lighthouse (PWA + Performance) na URL de produção
# Playwright viewport 375×812: long-press bolha + long-press thread + swipe
```

## Referências cruzadas

- Auditoria completa mobile: `docs/MOBILE_TASKS.md`
- Histórico do que já funciona: `docs/PROGRESSO.md`
- Design tokens: `docs/DESIGN_TOKENS.md`
- UI/UX diagnóstico: `docs/UI_UX_MELHORIAS.md`
- Motion design: `docs/MOTION_DESIGN.md`
- Entry-point: `README.md`
