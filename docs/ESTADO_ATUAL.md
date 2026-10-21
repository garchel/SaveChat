# Estado atual do SaveChat

> **Fonte da verdade do que existe hoje.** Auditado em **20/10/2026** contra a
> v1.25.0 (`a8e010b`). A contagem de testes e as referências de
> `workspace-ai.js` foram atualizadas em 21/10/2026 após os bugfixes. Cada linha
> aponta o arquivo que prova o comportamento.
> O que depende de configuração externa (domínio, OAuth, Sentry, Play Store)
> está marcado como **não verificável no repositório** e replicado do
> [ROADMAP_ESTAVEL.md](ROADMAP_ESTAVEL.md).
>
> Legenda: ✅ entregue · 🟡 entregue com limite conhecido · ⛔ não existe.

## Identificação

| Campo | Valor |
|---|---|
| Nome | SaveChat |
| Versão | `1.25.0` (`package.json` = `APP_VERSION` no `index.html`) |
| Service worker | `notethread-v166` (`public/sw.js:3`) |
| Stack | JS puro + ES Modules, sem framework nem bundler; CSS em 22 arquivos |
| Deploy | Vercel estático (`public/`) + 2 funções (`api/ai.js`, `api/transcribe.js`) |
| Dados | Supabase: Postgres + RLS + Auth + Storage + Realtime |
| PWA | Manifest completo, service worker, instalável |
| Testes | 158 unit (`node:test`) + 21 specs Playwright (86 testes) |
| Tamanho | ~18 mil linhas de JS/HTML em `public/` + `api/` + `scripts/` + `tests/` (sem CSS) |

## Mapa de telas

| Tela | Como se chega | Arquivo |
|---|---|---|
| Cadernos / Conversa | Seletor `Cadernos` na sidebar | `public/partials/explorer.txt` |
| Tarefas | Seletor `Tarefas` ou `?tasks=1` | `public/partials/workspace.txt` |
| Diária | Seletor `Diária` | `public/partials/workspace.txt` |
| IA | Botão do mascote na sidebar / página IA | `public/partials/workspace.txt` |
| Lembretes | Ícone de relógio na sidebar ou `?reminders=1` | `public/partials/workspace.txt`; `app.js:494` |
| Nova conversa | Botão NOVO ou `?new=1` | `app.js:494` |
| Notificações | Sino na sidebar | `public/partials/menus.txt` |
| Busca | Lupa ao lado do NOVO / `Ctrl+K` | `public/partials/explorer.txt` |
| Configurações / Perfil | Rodapé da sidebar | `public/partials/menus.txt` |

## 1. Conta e acesso

| Recurso | Estado | Evidência |
|---|---|---|
| Login Google via Supabase (PKCE explícito) | ✅ | `ui/auth.js:207,231`; `sync-supabase.js:20` |
| Login por e-mail e senha | ✅ | `ui/auth.js:302` |
| Criar conta por e-mail (com confirmação) | ✅ | `ui/auth.js:297` |
| Recuperar senha por e-mail | ✅ | `ui/auth.js:190` |
| “Lembrar-me neste dispositivo” | ✅ | `partials/login.txt` |
| Perfil (nome/e-mail/foto do Google) | ✅ | `ui/auth.js`; `profiles` em `supabase.sql` |
| Isolamento por conta no mesmo navegador | ✅ | `store.js:27-40` (bucket `notethread.v2::u::<id>`) |
| Logout derruba canal Realtime | ✅ | `sync-supabase.js:98-112` |
| Friendly Names (nomes de componentes no hover) | ✅ só em dev | `js/friendly-names.js` (retorna fora de localhost) |

## 2. Conversas e cadernos

| Recurso | Estado | Evidência |
|---|---|---|
| Criar conversa ou caderno pelo mesmo botão “NOVO” | ✅ | `ui/tree.js`; `partials/explorer.txt` |
| Renomear, excluir, mover por arrastar | ✅ | `ui/tree.js`; `partials/menus.txt` |
| Favoritos (bloco próprio) | ✅ | `ui/tree.js`; `#fav-section` |
| Ordenação: recentes, nome, manual | ✅ | `ui/tree.js:253-258` |
| Emoji/cor do caderno | ✅ | `ui/tree.js:89`; `sync-supabase.js:315` |
| Cadernos aninhados | ⛔ | `parentId` existe no modelo, mas a UI cria sempre `null` |
| Contagem de notas por conversa | ✅ | `ui/tree.js` |
| Paginação de conversas | ⛔ | snapshot corta em 100 (ver §7) |

## 3. Mensagens (notas)

| Recurso | Estado | Evidência |
|---|---|---|
| Markdown (negrito, itálico, código, listas, títulos, links) | ✅ | `js/markdown.js`; `ui/composer-markdown.js` |
| Checklists interativos `[ ]` / `[x]` | ✅ | `ui/messages*.js`; `ui/composer-lists.js` |
| Ocultar itens concluídos | ✅ | `menus.txt`; `ui/settings.js` |
| Tags por nota + filtro `#tag` | ✅ | `ui/messages-edit.js`; `ui/navigation.js` |
| Reações por emoji (mapa por usuário) | ✅ | `ui/messages-reactions.js`; `note:reactions` |
| Editar com controle de revisão (`rev`/`editedAt`) | ✅ | `ui/sync-events.js:65` |
| Excluir com desfazer de 10 s | ✅ | `ui/messages-edit.js:118` |
| Copiar mensagem | ✅ | `partials/menus.txt` |
| Fixar mensagem + popover com ir/editar/desfixar | ✅ | `partials/menus.txt`; `ui/messages-edit.js` |
| Menções `@[Nome](t:id)` + backlinks | ✅ | `ui/mentions.js`; `ui/navigation.js` |
| Imagens (upload, compressão 1280px/0.7, lightbox com pinch) | ✅ | `ui/composer.js:140-186`; `supabase.sql:102` |
| Áudio: gravar, waveform real, play/pause, duração | ✅ | `js/audio.js`; `ui/composer-audio.js` |
| Transcrição de áudio | ✅ | `api/transcribe.js` (Groq Whisper); `js/transcribe.js` |
| Transcrição no contexto da IA | ✅ | `ui/workspace-ai.js:64` |
| Seletor de emojis com busca e categorias | ✅ | `ui/picker.js`; `js/emojis.js` |
| Limite de imagem | 5 MB antes da compressão | `ui/composer.js:163` |
| Busca local por texto/acento | 🟡 sem `NFD` (ver §4) | `ui/navigation.js:120` |

## 4. Busca

| Recurso | Estado | Evidência |
|---|---|---|
| Texto livre com destaque | ✅ | `ui/navigation.js:120-200` |
| `#tag` | ✅ | `ui/navigation.js:105` |
| `in:conversa` | ✅ | idem |
| `depois:data` / `antes:data` | ✅ | idem |
| `rx:🔥` (+ sinônimos em português) | ✅ | `ui/navigation.js:100-104` |
| Contagem + chips de filtros | ✅ | `ui/navigation.js:202` |
| Página de resultados completa | ✅ | `#search-page` |
| Busca no servidor | ⛔ | só `Store.data.notes` (cache local) |
| Cobertura do histórico | 🟡 só as 200 notas mais recentes do snapshot + páginas roladas | `sync-supabase.js:143` |
| Insensível a acento | ⛔ | `toLowerCase().includes()` |
| Testes de busca | ⛔ | nenhum spec cobre `runSearch` |

## 5. Tarefas, Diária e lembretes

| Recurso | Estado | Evidência |
|---|---|---|
| Tarefas próprias (CRUD) | ✅ | `ui/tasks.js` (`ui.tasksOwn`) |
| Tarefas das conversas (checklists agregados) | ✅ | `ui/tasks.js`; lê notas, edita a origem |
| Concluir tarefa da conversa na página | ✅ | grava `note:edit` na nota original |
| Diária: rotina fixa que reinicia à meia-noite | ✅ | `ui/workspace-daily.js` |
| Diária: progresso e streak 🔥 | ✅ | `ui/workspace-daily.js:181-196` |
| Diária: horário + aviso | ✅ | `dailyRoutine`; `ui/workspace-daily.js` |
| Lembrete por nota (data/hora) | ✅ | `ui/reminders.js:100` |
| Agendador | ✅ a cada 20 s + ao focar a janela | `ui/reminders.js:66-72` |
| Notificação do sistema / SW | ✅ com permissão | `ui/reminders.js:81-93`; `sw.js:81` |
| Clique na notificação abre a conversa | ✅ | `sw.js:81` |
| Centro de notificações com não-lidas | ✅ | `ui/reminders.js`; `partials/menus.txt` |
| Push com o app fechado | ⛔ | não há handler `push` no SW |
| Sincronização de tarefas próprias | ⛔ | `ui.tasksOwn` fica no dispositivo |
| Sincronização da rotina da Diária | ⛔ | localStorage por conta, não Supabase |

## 6. IA

| Recurso | Estado | Evidência |
|---|---|---|
| Provedor compartilhado (Gemini via Vercel) | ✅ exige login | `api/ai.js`; `ui/workspace-ai.js` |
| BYOK (chave pessoal do Gemini) | ✅ opcional | `ui/workspace-ai.js`; `ui.aiKey` |
| Seletor de modelo | ✅ `gemini-*` validado no servidor | `api/ai.js` |
| Contexto das notas | 🟡 15 conversas × 10 notas, 300 chars (600 na transcrição), teto de 24.000 chars | `ui/workspace-ai.js:50-68` |
| Criar nota por function calling | ✅ `criar_nota` | `ui/workspace-ai.js:115-209,294` |
| Histórico do chat | ✅ persistente no bucket local da conta (não vai ao servidor) | `ui.aiChat`; `store.js` `SCOPE_KEYS` |
| Histórico enviado ao modelo | últimas 20 mensagens | `ui/workspace-ai.js:110` |
| Thread da IA fora do sync/servidor | ✅ `localOnly` | `js/ai-thread.js`; `sync-supabase.js:260-261` |
| Áudio na página da IA (grava → transcreve → revisa) | ✅ | `ui/workspace-ai.js`; `api/transcribe.js` |
| Busca semântica / RAG / citações | ⛔ | contexto é recorte, não retrieval |
| Cota por usuário | ⛔ | valida sessão, mas não limita chamadas por conta |

## 7. Sincronização e offline

| Recurso | Estado | Evidência |
|---|---|---|
| Postgres + RLS por `auth.uid()` | ✅ | `supabase.sql:75-84` |
| Realtime por conta (canal filtrado) | ✅ | `sync-supabase.js:160-190` |
| Snapshot inicial | 100 conversas, 100 cadernos, 200 notas | `sync-supabase.js:141-143` |
| Paginação de notas ao rolar | ✅ 25 por página | `sync-supabase.js:276`; `utils.js:2` |
| Fila offline com IndexedDB + fallback | ✅ | `js/offline-queue.js` |
| Backoff exponencial | ✅ até 60 s | `js/offline-queue.js` |
| Fila por conta (não vaza entre contas) | ✅ | `offline-queue.js:30-40`; `sync-supabase.js:210-235` |
| Status online/offline/connecting | ✅ | `sync-supabase.js:33-72` |
| Retry ao voltar a rede | ✅ | `sync-supabase.js` listener `online` |
| Reconectar agora / limpar cache do app | ✅ | `partials/menus.txt`; `ui/settings.js` |
| Conflito de edição | 🟡 last-write-wins (`rev`/`editedAt`) | `ui/sync-events.js:65` |
| Falha de gravação local | 🟡 `localStorage` engole erro de cota | `store.js:40` |
| Conversas/cadernos além de 100 | ⛔ não são baixados no snapshot | `sync-supabase.js:141-142` |

## 8. PWA, instalação e atualização

| Recurso | Estado | Evidência |
|---|---|---|
| Manifest com `id`, `lang`, `categories`, shortcuts | ✅ | `public/manifest.webmanifest` |
| Ícones 192/512 + maskable + SVG | ✅ | `public/manifest.webmanifest` |
| Screenshots para loja | ✅ 2 narrow | idem |
| Service worker com precache e bump pareado | ✅ v166 | `public/sw.js`; `tests/sync.test.js:132` |
| Funciona offline (cache + fila) | 🟡 conteúdo limitado ao snapshot local | ver §7 |
| Botão “Instalar app” | ✅ quando o navegador oferece | `ui/settings.js` |
| Atualização manual com chip de versão | ✅ lê o CHANGELOG servido | `js/updater.js` |
| Splash de abertura | ✅ | `18-boot-splash.css`; `index.html` |
| TWA/APK publicado | ⛔ | sem `.well-known/assetlinks.json`; Passo 6+ do guia |
| App nativo (Capacitor/iOS) | ⛔ | decisão pendente |

## 9. Aparência e personalização

| Recurso | Estado | Evidência |
|---|---|---|
| Temas | ✅ **8**: Terracota, Escuro, Lavanda, Hortelã, Oceano, Meia-noite, Sakura, Napolitano | `01-temas.css`; `partials/menus.txt` |
| Fonte da interface | ✅ 5 opções + padrão | `menus.txt`; `ui/settings.js` |
| Densidade confortável/compacta | ✅ | `menus.txt` |
| Padrões de fundo | ✅ 11 (liso + 10) com tamanho ajustável | `menus.txt`; `js/bg-patterns.js` |
| Cor do caderno no cabeçalho | ✅ | `menus.txt` (`hdr-match-color`) |
| Pétalas flutuantes | ✅ opcional | `js/petals.js` |
| Sons por ação (7) + volume | ✅ | `js/sound.js`; `menus.txt` |
| Mascote da IA | ✅ nome, 4 cores, 6 silhuetas, 7 olhos, 4 bocas, 12 acessórios, bochechas, sortear | `js/mascot.js`; `ui/mascot-panel.js` |
| Confete em checklist completa | ✅ | `js/confetti.js` |
| `prefers-reduced-motion` | ✅ 10 blocos | `public/styles/*.css` |
| Contraste AA | 🟡 3 focos abertos | `BACKLOG.md` B1b |
| Piso tipográfico 12px | 🟡 4 textos em 11px | `BACKLOG.md` B1 |

## 10. Mobile e interação

| Recurso | Estado | Evidência |
|---|---|---|
| Long-press em bolha e em conversa | ✅ | `ui/messages*.js`; `ui/tree.js` |
| Swipe entre Cadernos/Tarefas/Diária | ✅ | `ui/workspace.js`; `ui/navigation.js` |
| Hierarquia de “Voltar” em 3 níveis | ✅ | `ui/navigation.js` |
| Teclado não cobre o composer | ✅ | `js/keyboard-viewport.js`; `ui/composer.js` |
| Safe-area/notch | ✅ | `04-responsive.css`; composer |
| Pull-to-refresh | ✅ | `ui/composer.js` |
| Pinch-to-zoom no lightbox | ✅ | `ui/messages*.js` |
| Touch targets ≥44px | ✅ via hit-area | `03b-chat-bolhas.css` |
| Popovers ≤ viewport | ✅ | `styles` com `min(...)` |
| Swipe horizontal com a conversa aberta | ✅ pertence à conversa (não troca página) | `ui/navigation.js` |
| Atalhos: `Ctrl/Cmd+K` busca, `Esc` fecha, `Enter` envia, `Shift+Enter` quebra | ✅ | `ui/navigation.js:235`; `ui/composer.js:99` |
| Resultados de busca em iPhone SE | ⏳ sem validação em device real | `BACKLOG.md` B3 |

## 11. Dados, backup e privacidade

| Recurso | Estado | Evidência |
|---|---|---|
| Exportar JSON | ✅ | `ui/settings.js` (`export`) |
| Exportar Markdown (uma conversa por bloco) | ✅ | `ui/settings.js:323` |
| Importar backup JSON (merge por id) | ✅ | `ui/settings.js` (`import`) |
| Importar Markdown | ⛔ | — |
| “Apagar tudo” local + remoto | ✅ notes/threads/folders | `sync-supabase.js:345-366` |
| Remoção de imagens/áudios no “Apagar tudo” | ⛔ não chama `storage.remove` | `ui/settings.js:377`; `sync-supabase.js:345` |
| CSP com origens explícitas | ✅ | `vercel.json` |
| Chaves de IA só no servidor (provedor compartilhado) | ✅ `GEMINI_API_KEY`, `GROQ_API_KEY` | `api/ai.js`; `api/transcribe.js` |
| Chave pessoal só no dispositivo | ✅ `ui.aiKey`, não sincroniza | `store.js` `SCOPE_KEYS` |
| Thread da IA local-only | ✅ | `js/ai-thread.js`; `sync-supabase.js:260-261` |
| Criptografia ponta a ponta | ⛔ | HTTPS em trânsito; RLS no servidor |
| Buckets de imagem/áudio | 🟡 públicos para leitura por URL (path com uid + timestamp); não são apagados no “Apagar tudo” | `supabase.sql:102-134`; `sync-supabase.js:345` |
| Analytics/telemetria de uso | ⛔ | — |
| Observabilidade de erro | 🟡 buffer local; Sentry sem DSN | `js/error-tracking.js`; `index.html:201` |

## 12. Operação e qualidade

| Recurso | Estado | Evidência |
|---|---|---|
| CI: check + unit + e2e | ✅ | `.github/workflows/ci.yml` |
| Lighthouse CI (A11y/BP ≥0.9; SEO/perf como warn) | ✅ | `.github/workflows/lighthouse.yml`; `lighthouserc.json` |
| Instalabilidade PWA | 🟡 validada por manifest + SW + testes, não pelo LHCI | `manifest.webmanifest`; `sw.js`; `tests/sync.test.js` |
| Build minificado sem bundler | ✅ `npm run build` → `dist/` | `scripts/build.mjs` |
| Preview de produção local | ✅ `npm run preview` | `scripts/preview.mjs` |
| Promoção staging→main com checks | ✅ `npm run promote` | `scripts/promote.mjs` |
| Release (versão + CHANGELOG + SW) | ✅ `npm run release` | `scripts/release.mjs` |
| Worktrees numeradas para agentes | ✅ `scripts/wt.mjs` | `tests/wt-sequential.test.js` |
| Cobertura de código | ⛔ sem métrica/portão | — |
| Teste de busca e de cota local | ⛔ | — |

## 13. Limites conhecidos (números)

| Limite | Valor | Onde |
|---|---|---|
| Conversas no snapshot | 100 | `sync-supabase.js:141` |
| Cadernos no snapshot | 100 | `sync-supabase.js:142` |
| Notas no snapshot | 200 | `sync-supabase.js:143` |
| Página de notas | 25 | `utils.js:2` |
| Contexto da IA | 15 conversas × 10 notas; 24k chars | `workspace-ai.js:50-68` |
| Histórico enviado à IA | 20 mensagens | `workspace-ai.js:110` |
| Imagem | 5 MB antes da compressão | `composer.js:163` |
| Áudio no bucket | 25 MB | `supabase.sql:122` |
| Retry máximo da fila | 60 s | `offline-queue.js` |
| Validação do agendador de lembretes | 20 s | `reminders.js:72` |

## 14. Dependências de configuração (não verificáveis no repositório)

| Dependência | Para quê | Onde é lida |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | auth, dados, storage, realtime | `public/index.html` (públicas por design) |
| Provider Google + provider e-mail no Supabase | login Google / e-mail e senha | Console do Supabase (externo) |
| Site URL + Redirect URLs | OAuth em produção | Console do Supabase (externo) |
| `GEMINI_API_KEY` | assistente no provedor compartilhado | `api/ai.js` (Vercel) |
| `GROQ_API_KEY` | transcrição de áudio | `api/transcribe.js` (Vercel) |
| `window.SENTRY_DSN` | erros em produção | `public/index.html:201` — **vazio hoje** |
| `window.ERROR_ENDPOINT` | endpoint próprio de erro (opcional) | `public/js/error-tracking.js` |
| Domínio + HTTPS | OAuth, loja, links | Vercel (externo) |
| Play Console + SHA-256 + `assetlinks.json` | TWA sem barra de endereço | Play Console (externo) |

> Código pronto não significa ambiente configurado: os itens acima são a
> fronteira entre “existe no app” e “funciona em produção”.

## 15. O que não existe (e às vezes o doc promete)

- **Compartilhar conversa entre pessoas.** O menu “Convidar” avisa que não
  existe; o RLS é `user_id`-only, sem tabela de membros.
- **Push com o app fechado.** O SW não tem handler `push`; o lembrete só
  dispara com o app aberto (ou ao reabrir).
- **Busca no servidor / semântica.** A busca é local, sobre o cache.
- **Retrieval para a IA.** O contexto é um recorte fixo, não top-k.
- **Resolução de conflito de edição.** Last-write-wins silencioso.
- **Backup completo offline.** Só o snapshot entra no cache.
- **Criptografia E2E.** RLS protege no servidor; o conteúdo é legível pelo
  projeto Supabase.
- **Publicação em loja.** Sem TWA/assetlinks; passos externos pendentes.
- **Tarefas próprias e rotina da Diária no servidor.** Ficam no
  dispositivo (a rotina, por conta; as tarefas, no aparelho).

## 16. Divergências documentação × código

| Documento | O que afirmava | Realidade |
|---|---|---|
| `README.md` | 7 temas; sem IA/Diária/Tarefas/áudio/mascote | 8 temas e todas essas features existem |
| `public/help.html` | “Messages”; temas Pêssego/Lavanda/…; chave de IA obrigatória; busca só com 2 operadores; “Ambiente” = chave Gemini | ver correções aplicadas em 20/10/2026 |
| `docs/PROGRESSO.md` | snapshot de 24/08: 18 módulos, 7 temas, SW v70 | histórico; não usar como estado |
| `docs/ROADMAP_ESTAVEL.md` | Q6.10 contraste ✅; testes “8 unit + 2 e2e” | parcial (B1b); 158 + 21 |
| `docs/MOBILE_TASKS.md` | `.bubble .del` pendente de decisão | CSS morto, sem botão renderizado |
| `docs/STORE_LISTING.md` | “7 temas” | 8 |
| `docs/BACKLOG.md` | B1/B2 resolvidos | B1 parcial; B2 obsoleto |

## Como manter este documento

1. Toda feature nova entra aqui **com o arquivo que a prova** — não com
   “implementado” solto.
2. Números de limite (snapshot, contexto, página) são copiados do código;
   se mudarem, este documento muda no mesmo commit.
3. O que depende de conta/console (domínio, OAuth, Sentry, Play) fica
   marcado como externo e aponta para o roadmap.
4. Antes de afirmar ausência, `grep` no código e nos partials.
