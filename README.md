# SaveChat 💬

Suas ideias, como conversas. Bloco de notas em formato de chat — se você sabe mandar mensagem, já sabe usar. Offline-first, sync em tempo real entre seus dispositivos.

## Como funciona

- **Conversas** organizadas em **cadernos** (pastas) na sidebar
- **Mensagens** com markdown, checklists interativos, imagens, tags e lembretes
- Menções entre notas (`@[Nome](t:id)`) + backlinks
- Busca global: `#tag` · `in:conversa` · `depois:data`
- 7 temas acolhedores (com modo escuro)

## Stack

- **Frontend:** JS puro (ES Modules, sem build step), PWA instalável
- **Backend:** zero servidor próprio — Vercel (estático) + Supabase (Postgres + RLS + Auth Google + Storage + Realtime)
- **Offline-first:** localStorage + fila de sincronização

## Desenvolvimento

```bash
npm install        # apenas playwright p/ testes
npm run dev        # servidor local (:3000 — ou a próxima porta livre)
npm run check      # node --check em todo JS público
npm run test       # node:test unit (8 specs, inclui versão do SW)
npm run e2e        # Playwright: fluxo crítico + menções
npm run build      # minifica para dist/ (preview de prod)
npm run preview    # build + serve dist/ em :3002 — teste local de staging
```

### Branches

`main` é produção. `staging` é a homologação: as branches de trabalho
(`feature/…`, `fix/…`, `chore/…`) nascem de `staging`, são mergeadas
nela, e só sobem para `main` por **pull request** depois do seu teste
com `npm run preview`. Detalhes em [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentação

| Doc | Conteúdo |
|---|---|
| [docs/ROADMAP_ESTAVEL.md](docs/ROADMAP_ESTAVEL.md) | Checklist único de lançamento web+mobile |
| [docs/GLOSSARIO.md](docs/GLOSSARIO.md) | Terminologia oficial (Conversa/Mensagem/Caderno) |
| [docs/STORE_LISTING.md](docs/STORE_LISTING.md) | Textos e assets da Play Store |
| [docs/UI_UX_MELHORIAS.md](docs/UI_UX_MELHORIAS.md) | Diagnóstico UI/UX |
| [docs/MOTION_DESIGN.md](docs/MOTION_DESIGN.md) | Identidade de movimento |
| [docs/LIGHTHOUSE_BASELINE.md](docs/LIGHTHOUSE_BASELINE.md) | Baseline de performance |

## Privacidade

[Política de Privacidade](public/privacy.html) · [Termos de Uso](public/terms.html)
