# SaveChat — Progresso (snapshot histórico)

> **⚠️ Este arquivo é histórico.** O checklist de lançamento está em **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md)** e o inventário do que existe hoje (com evidência por feature) está em **[ESTADO_ATUAL.md](ESTADO_ATUAL.md)** — use estes dois como fonte da verdade.
> Atualizado em 24/08/2026 para refletir a arquitetura atual (Vercel + Supabase; backend Node próprio removido).

## 1. Origem

App reconstruído localmente via Ctrl+C/V de plataforma que não permitia exportar. `public/index.html` e ícones PWA foram recriados.

## 2. O que JÁ FUNCIONA ✅

**Frontend (PWA, JS puro, ES Modules)** — `public/` com `index.html`, `app.js` (entry ~195 linhas) + 18 módulos em `js/` e `js/ui/`, `styles.css`, `sw.js` (`notethread-v70`, CSS/JS network-first), `manifest.webmanifest` (ícones 192/512/1024 maskable + SVG), Google OAuth via Supabase, threads chat, paginação real (Supabase `.range()` + infinite scroll), Markdown + checklists interativos, 7 temas + Auto com `theme-color` dinâmico, sons customizáveis + haptic, busca global com filtros (`in:` `#tag` `depois:` `antes:`), pastas/árvore IDE com drag & drop, favoritos, pin + jump-to-note, backlinks/menções `@[Nome](t:id)`, lembretes com Notification API (clique na notificação abre a thread), imagens no Supabase Storage com fallback base64, lightbox com pinch-to-zoom, pull-to-refresh, offline queue.

**Backend (zero servidor próprio)** — Vercel estático (`vercel.json`: CSP/X-Frame headers, cache-control do SW) + Supabase: Postgres com RLS por `auth.uid()`, Auth Google OAuth, Storage bucket `note-images`, Realtime.

**Qualidade** — CI GitHub Actions (`check` + `test` + e2e Playwright), node:test unit (8 specs incl. assertion da versão do SW), e2e do fluxo real (criar nota com checklist → persiste; menção → navegação), `privacy.html` + `terms.html`, `CHANGELOG.md` com "what's new" no toast de update.

## 3. Correções feitas na reconstrução

| # | Problema | Solução |
|---|----------|---------|
| 1 | `index.html` faltando | Movido para `public/index.html` |
| 2 | Sync isolava por device | Chave por conta (agora `user_id` RLS no Supabase) |
| 3 | Ícones PWA ausentes | Gerados; hoje 1024px maskable final |
| 4 | Sem `.gitignore` | Adicionado |

## 4. O que falta → ver ROADMAP

Planejamento completo (loja/TWA, OAuth externo, Capacitor v2, melhorias de produto e motion design) está em **[ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md)**.

Resumo: TWA/PWABuilder pendente; touch targets ≥44px ✅ resolvido (v71); Lighthouse baseline registrado (`docs/LIGHTHOUSE_BASELINE.md` — A11y 100, BP 100, Perf 82 local); motion design Fases 1–4 implementado (v74). App renomeado para **SaveChat** (v78).

## 5. Arquivos importantes

- `public/app.js` — entry que importa os módulos UI
- `public/js/store.js` — Store offline-first · `js/sync-supabase.js` — sync
- `public/js/ui/*.js` — auth, composer, messages, navigation, settings, tree…
- `public/sw.js` — precache v70 (bump pareado com `tests/sync.test.js`)
- `vercel.json` — headers de segurança e cache
- `supabase.sql` — schema + RLS

## 6. Decisões pendentes (dono)

- [ ] Contas de dev (Play US$25 / Apple US$99)
- [ ] Monetização (ads/IAP → decide TWA MVP vs Capacitor v2)
- [ ] Publicar OAuth consent screen como External (Fase 5)
