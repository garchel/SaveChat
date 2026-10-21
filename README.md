# SaveChat 💬

Suas ideias, como conversas. Bloco de notas em formato de chat — se você sabe mandar mensagem, já sabe usar. Offline-first, sync em tempo real entre seus dispositivos.

## Como funciona

- **Conversas** organizadas em **cadernos** (pastas) na sidebar, com favoritos, ordenação e arrastar-e-soltar
- **Mensagens** com markdown, checklists interativos, imagens, áudio com transcrição, tags, reações, menções e lembretes
- **Assistente de IA** que lê suas notas, responde e cria mensagens por comando (Gemini; provedor compartilhado ou chave própria)
- **Tarefas** (próprias + checklists de todas as conversas) e **Diária** com rotina, progresso e streak
- **Busca global** com filtros: `#tag` · `in:conversa` · `depois:data` · `antes:data` · `rx:🔥`
- **8 temas** acolhedores, 5 fontes, 11 fundos, sons por ação e mascote personalizável
- **PWA instalável** com atualização manual, atalhos no ícone e funcionamento offline

O inventário completo do que existe (com evidência por arquivo) está em **[docs/ESTADO_ATUAL.md](docs/ESTADO_ATUAL.md)**.

## Stack

- **Frontend:** JS puro (ES Modules, sem build step), PWA instalável
- **Backend:** zero servidor próprio — Vercel (estático + 2 funções) + Supabase (Postgres + RLS + Auth Google/e-mail + Storage + Realtime)
- **IA:** Gemini via `/api/ai` (chave no servidor) ou BYOK
- **Transcrição:** Groq Whisper via `/api/transcribe`
- **Offline-first:** localStorage por conta + fila de sincronização em IndexedDB

## Desenvolvimento

```bash
npm install        # playwright, sharp e serve (testes/assets)
npm run dev        # servidor local (:3001 — ou a próxima porta livre)
npm run check      # node --check em todo JS público e nas funções
npm test           # 158 testes unit (node:test)
npm run e2e        # 21 specs Playwright (fluxo crítico, mobile, áudio, tarefas…)
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
| [docs/ESTADO_ATUAL.md](docs/ESTADO_ATUAL.md) | **Inventário verificado de features, limites e lacunas** |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Trabalho aberto medido contra o código |
| [docs/ROADMAP_ESTAVEL.md](docs/ROADMAP_ESTAVEL.md) | Checklist de lançamento web+mobile |
| [docs/GLOSSARIO.md](docs/GLOSSARIO.md) | Terminologia oficial (Conversa/Mensagem/Caderno) |
| [docs/STORE_LISTING.md](docs/STORE_LISTING.md) | Textos e assets da Play Store |
| [docs/UI_UX_MELHORIAS.md](docs/UI_UX_MELHORIAS.md) | Diagnóstico UI/UX medido |
| [docs/MOTION_DESIGN.md](docs/MOTION_DESIGN.md) | Identidade de movimento |
| [docs/LIGHTHOUSE_BASELINE.md](docs/LIGHTHOUSE_BASELINE.md) | Baseline de performance |
| [public/help.html](public/help.html) | Guia do usuário dentro do app |

## Privacidade

[Política de Privacidade](public/privacy.html) · [Termos de Uso](public/terms.html)
