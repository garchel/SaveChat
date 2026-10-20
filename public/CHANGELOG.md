# Changelog ÔÇö SaveChat

Todas as mudan├ºas not├íveis ser├úo documentadas aqui (semver).

## [1.24.0] — 2026-10-20
### Alterado
- **A transcrição de voz agora usa o Groq Whisper, com a chave só no servidor.** O cliente chama `/api/transcribe`, que valida a sessão do Supabase, baixa o áudio do bucket (ou recebe a gravação local em base64) e repassa ao `whisper-large-v3-turbo` com `language=pt`. O texto continua guardado em `audio.transcript` e sincronizado pelo evento `note:transcript`. Requer `GROQ_API_KEY` na Vercel.

## [1.23.1] — 2026-10-20
### Corrigido
- **No celular, o teclado virtual cobria o campo de escrita.** O app ocupava sempre a tela inteira (`100dvh`) e o `body` não rola, então, ao focar o composer, o teclado abria por cima da conversa e do campo. O viewport agora pede `interactive-widget=resizes-content` (o Chrome Android encolhe o layout) e, nos navegadores que só encolhem a viewport visual (iOS Safari), o app passa a usar a altura visível — inclusive quando a viewport é deslocada. A conversa continua ancorada na última mensagem ao encolher.
- **O composer flutuava 56px acima do rodapé no celular.** O `padding-bottom` de 62px era da barra inferior removida em 1.21.0; sobrou o `6px + safe-area`, que protege a faixa de gestos sem deixar a faixa morta.
- **As mensagens de voz não tocavam em produção.** O CSP do site liberava mídia só da própria origem (`default-src 'self'`), então o navegador recusava o `<audio src="https://…supabase.co/…">` antes de baixar o arquivo — o botão continuava em play e o áudio nunca começava. O `media-src` agora libera o bucket (`https://*.supabase.co`) e `blob:` (áudios locais); o `img-src` ganhou o mesmo bucket para as imagens anexadas.
- **O botão de play agora vira pause assim que a reprodução começa** (com feedback imediato, revertido se o navegador recusar), pausar e tocar de novo retoma de onde parou, e tocar em outro áudio pausa o anterior.
- **O avatar de quem enviou a mensagem de voz não aparecia.** A foto do Google (`lh3.googleusercontent.com`) também era bloqueada pelo CSP; o host foi liberado. Se a foto falhar por qualquer motivo (URL expirada, offline), o player agora cai para a inicial do nome em vez de deixar um círculo quebrado.

## [1.23.0] — 2026-10-19
### Adicionado
- **Transcrição das mensagens de voz na conversa.** Cada bolha de áudio ganhou uma seta discreta no rodapé: ao tocar, o app transcreve a fala e mostra o texto entre aspas ali mesmo. A transcrição fica guardada na própria nota (acompanha os outros aparelhos) e usa o provedor de IA do assistente; sem sessão, vale a chave pessoal configurada em **Configurar IA**.

## [1.22.0] — 2026-10-19
### Adicionado
- **O assistente de IA agora funciona sem cada pessoa colar uma chave.** Antes o campo de chave era obrigatório e a IA só respondia com a chave pessoal do Google AI Studio. Agora o app tem um provedor compartilhado: o cliente envia o pedido e a sessão do Supabase para `/api/ai`, uma função na Vercel que valida o login e chama o Gemini com a chave do projeto (`GEMINI_API_KEY`), que nunca chega ao navegador. Quem configurou a própria chave continua usando o caminho direto (BYOK).
- O proxy limita o que o cliente pode pedir — modelo só da família `gemini-*`, saída de até 4096 tokens e corpo de até 4 MB — e, em pico de demanda (429/503), tenta de novo e cai para um modelo estável da mesma família antes de responder erro, tudo dentro do limite de 60s da função.
### Alterado
- O modelo padrão passou a ser o `gemini-3.6-flash`: o `gemini-2.5-flash` não atende mais chaves novas, e o `3.8` e o `3.7` estão com picos de demanda.
- O campo de chave em **Configurar IA** virou opcional, com o texto explicando que a IA já vem configurada e que a chave pessoal só é usada por quem quiser a própria cota.

## [1.21.2] — 2026-10-19
### Corrigido
- **A tela de abertura do sistema (Android/Chrome) pintava numa cor fria (lavanda `#f4f1fb`) antes da `#boot-splash`, que abre em tom quente.** Essa janela do sistema é desenhada a partir de `background_color` do manifest, `name` e ícone, antes de qualquer byte do `index.html`. A `background_color` estava no lavanda, que é a cor de um tema que não é o padrão (o padrão é o terracota, `#fff3ef`), então a passagem sistema → app trocava de fundo. O primeiro quadro da `#boot-splash` — instante em que `data-theme` ainda não foi aplicado pelo JS — é o `--bg` base (`#F8F5EE`); a `background_color` passou a ser exatamente esse tom. Agora a janela do sistema (fundo + ícone, que já é a mesma arte do splash, + `name` "SaveChat") encosta no `#boot-splash` sem salto de cor. Um teste em `tests/sync.test.js` amarra a `background_color` ao `--bg` de `:root` para os dois não voltarem a divergir.

## [1.21.1] — 2026-10-19
### Corrigido
- **No celular, o app abria com uma tela indesejada escrita "SaveChat — Notas em threads".** Essa tela não é HTML: o Android/Chrome a desenham a partir do campo `name` do manifest, antes de qualquer byte do `index.html` ser renderizado — por isso ela aparecia antes do `#boot-splash`, que é a abertura de verdade (logo, nome e a tagline "Suas ideias em conversas que nunca acabam"). O `name` do manifest passou a ser apenas "SaveChat", então a tela gerada pelo sistema fica só com o ícone e o nome, e a única abertura com mensagem é a do `#boot-splash`. O `background_color` (#f4f1fb) já é a cor do tema padrão (lavanda), então a passagem da tela do sistema para a do app é contínua, sem troca de fundo.

## [1.21.0] — 2026-10-19
### Removido
- **A barra inferior de navegação (Cadernos | Tarefas | Diária no rodapé, acima do campo de escrita) foi removida.** Ela ficava fixa sobre o rodapé e ocupava espaço permanente do celular para repetir o que o seletor de páginas da sidebar e o arrasto horizontal já fazem. Sem ela, a troca de páginas é o seletor da sidebar (na lista de conversas) e o arrasto horizontal (com o canvas à frente). O CSS da `.tabbar`, o `_syncTabbar()` que a mantinha em sincronia e o binding dos `.tabbar-btn` saíram junto; o `padding-bottom` do composer com `env(safe-area-inset-bottom)` fica, porque ele protege a área de gestos do iPhone e não tinha relação com a barra.
### Adicionado
- **Arrastar para o lado alterna entre Cadernos, Tarefas e Diária** no celular. A funcionalidade foi pedida e o `workspaceSwipe` existia, mas não funcionava — por três motivos ao mesmo tempo. (1) O arrasto percorria `TABS` = [conversations, ai, reminders, daily]: IA e Lembretes não têm botão no seletor, então o gesto levava para telas que não estão listadas em lugar nenhum, e o Tarefas — que tem botão — ficava fora do alcance. (2) Não havia portão: o gesto funcionava com a conversa aberta, quando o horizontal já pertence à conversa. (3) `navigation.bindSwipe` e `workspace._bindWorkspaceSwipe` escutavam `touchend` no mesmo `document`, então o mesmo arrasto voltava para o explorador E trocava de página ao mesmo tempo. As três páginas agora saem por um método só (`openWorkspacePage`), o mesmo usado pelos botões da sidebar. O arrasto só age sem conversa na tela; com a conversa aberta ele é da conversa. O portão olha se a conversa está DE FATO na tela, e não se `activeThread` está preenchido — ele continua preenchido depois de voltar ao explorador, e é por isso que o arrasto volta a funcionar assim que o usuário volta.
- As setas do teclado no seletor de páginas também foram corrigidas: percorriam as mesmas abas sem botão do arrasto, então levavam a uma página sem aba acesa e o foco ia para um seletor inexistente. Um `role=tablist` navega entre as próprias abas.
### Corrigido
- No celular, **abrir a conversa, voltar e clicar nela de novo não reabria nada**: o clique era engolido. O `openThread` começava com `if (this.activeThread === id) return`, um atalho para não re-renderizar a conversa que já está na tela — mas o gesto de volta (`goBack`) só remove a classe `show-chat` da `.app` e deixa `activeThread` apontando para a conversa, então o atalho disparava com a conversa escondida e o `return` matava o clique. O atalho agora só vale quando a conversa está de fato visível. No desktop `show-chat` é inerte (04-responsive.css só a usa dentro de `max-width: 760px`), então a otimização continua valendo lá, sem re-render.
- O mesmo atalho travava a saída das abas do workspace: `showWorkspaceTab` também remove `show-chat` no mobile, então voltar de IA/Diária/Lembretes/Busca e clicar na conversa aberta ficava sem efeito. A correção é a mesma e cobre os dois caminhos.
- **Abrir uma conversa vazia depois de uma com conteúdo mostrava as mensagens da conversa anterior.** O `renderMessages` tem dois caminhos de limpeza: o do reset (quando a conversa tem notas) apaga bolhas e separadores de dia, mas o da conversa sem nenhuma nota apagava só os separadores. As bolhas ficavam dentro de `#messages` e, como o `#empty-state` é `margin: auto` (flex child centralizado), ele aparecia no meio delas em vez de substituí-las. Os dois caminhos agora limpam as mesmas coisas, preservando `#load-slot`, `#empty-state` e `#note-preview`.
- **Nota editada com texto curto (ou sem texto) transbordava a palavra "editada" para fora da bolha.** A meta da mensagem é `position: absolute` com `white-space: nowrap` — fora do fluxo, ela não entra na largura intrínseca da bolha, e por isso existe um `min-width` nela. Esse piso tinha 90px, dimensionado para a meta mais curta: medido a 12px, "19:12" ocupa 32px, mas "editada 19:12" ocupa 81px e "editada enviando…" ocupa 109px. Numa nota editada e curta a bolha encolhia até 90px e o "editada" saía pela borda esquerda. A nota editada ganhou piso próprio de 124px (cobre o pior caso medido, 122px); as demais seguem em 90px, e a bolha de áudio continua com `min-width: 0`.

## [1.20.0] — 2026-10-16
### Adicionado
- Mascote da IA configurável, no botão **Mascote** do menu do perfil: nome, cor do corpo, cor da sombra, cor dos olhos, cor dos acessórios, silhueta (6 formas), olhos (7), boca (4), bochechas e acessórios (12, de orelhas a coroa). Um preview fixo no topo do painel mostra o resultado na hora, e a escolha vale ao mesmo tempo no item da barra lateral, no estado vazio da página da IA e no indicador "Pensando…". Cor vazia = herda a cor do tema.
- **Modal de primeiro login**: quem entra no app sem ter escolhido um nome de mascote é perguntado "Como ele se chama?". Aparece no primeiro login e em qualquer login posterior enquanto o nome não tiver sido definido; cancelando, o nome padrão é mantido e a pergunta volta no próximo acesso. A distinção entre "nome escolhido" e "nome padrão" é o novo `nameSet`.
- O item do explorador e o título da página da IA passam a usar o **nome do mascote** em vez de "Conversa com a IA".
- As opções de olhos, boca e acessórios passaram a mostrar **o desenho da peça** em vez do nome, com `title`/`aria-label` preservando o rótulo. Cabe tudo na tela sem barra de rolagem, e a miniatura é mais rápida de reconhecer do que "Coelho" ou "Visor".
- Favoritos virou subconteúdo de "Meus cadernos" e perdeu o rótulo próprio: a estrela e o texto dourado de cada item já dizem quais são, e dois títulos em maiúscula empilhados ("MEUS CADERNOS" e "FAVORITOS") competiam entre si. A separação dos grupos passa a ser um trilho vertical dourado à esquerda do bloco, como os itens fixados de IDE: uma linha atravessada lia como "fim de seção" e dividia a coluna em dois. A seção também subiu para peso 800 na cor de texto, com mais respiro de topo.
- A página de Tarefas esconde a barra de rolagem. A coluna continua rolando por wheel e toque — mesmo truque da árvore do explorador.
- O cabeçalho da página de Tarefas ganhou o ícone em tile, com o mesmo desenho da aba "Tarefas" do explorador. Ficava só com o texto e destoava das demais páginas, que mostram ícone + título; o botão de voltar e o contador já existiam.

- Avatar animado da IA: substitui o ícone do item "Conversa com a IA" na barra lateral e ocupa o estado vazio da página da IA. Duas peças — um núcleo fixo onde o rosto se ancora e uma casca que se remodela para a silhueta — com orelhas de gato, bochechas, piscada e respiração. Durante o envio aparece um "Pensando…" com o avatar no estado `thinking`. CSS puro: respeita a regra global de `prefers-reduced-motion` sem nenhum JS por quadro.

### Corrigido
- O botão de voltar de Busca, Lembretes e Tarefas usava a classe `.btn-icon`, que não existia no CSS: caía no `<button>` cru do navegador, medido em 8×21px, sem área de toque (WCAG 2.5.5 pede 44×44) e com um "‹" de texto puro. A classe agora tem as mesmas regras do `#btn-back` do cabeçalho global — círculo de 40×40, glifo SVG e área de toque estendida — e os três glifos foram trocados por SVG.
- O botão de voltar de Tarefas estava dentro de `if (expTasks)`, mas `#explorer-tasks` não existe mais no DOM (foi substituído pela aba `.page-switch[data-page="tasks"]`). A guarda é sempre falsa, então a seta **nunca recebeu listener** — era um botão inerte, não só sem estilo. Era também `mobile-only`; agora aparece no desktop, onde volta para a aba Cadernos e desmarca "Tarefas" (que ficava aceso com a página já fechada).
- No celular, a página de Tarefas abria por trás da sidebar e sem a tabbar: `showTasksPage()` não chamava `_mobileRevealCanvas()`, que as outras abas recebem por `showWorkspaceTab`. Ela ficava com o cabeçalho deslocado em 8px e a tabbar escondida, enquanto Conversas e Diária mostravam as duas coisas — era a página com o formato diferente, e não a Diária.
- O contador do cabeçalho ("40 abertas", "12 resultados") tinha fundo `rgba(255,255,255,.6)` fixo e texto em `--text-dim`. No tema escuro virava um chip claro com texto cinza e o contraste ficava em 3.89, abaixo de 4.5. Passou a usar `--bg-elev`, `--border` e `--text`, medido em 5.05 no tema claro e 6.24 no escuro.
- Botão **Sortear** no painel do mascote: gera silhueta, olhos, boca, acessório, bochechas e cores novos de uma vez. As cores saem de uma paleta curada (8 corpos com sombra já contrastada + 5 tons de detalhe) em vez de hex aleatório, que daria corpo quase branco com sombra quase preta ou olhos da mesma cor do corpo. O preview dá um pulso a cada sorteio. O nome **não** é sorteado: é identidade escolhida pelo usuário.
- Kicker "**✦ Assistente**" acima do item do mascote no **explorador**. No cabeçalho da conversa fica só o ícone de estrelinhas, como nas outras páginas.
- O modal de primeiro login agora explica o que o assistente faz antes de pedir o nome, para quem nunca usou.
- A preferência mora em `ui.mascot`, que é escopo do **dispositivo** (fora de `SCOPE_KEYS`): o mascote não atravessa contas e não pede schema novo no servidor.

- O item do mascote ficava **abaixo** de Favoritos. Os favoritos são renderizados num bloco próprio (`#fav-section`), não dentro de `#tree`, então a ordem no HTML é que decide — e o item era anexado a `#tree`, que vem depois. Passou a ter um slot próprio (`#ai-slot`) antes de `#fav-section`.
- Renomear o mascote no painel não atualizava o rótulo da árvore: ele vinha de `t.name`, congelado no boot por `ensureAiThread`. Agora vem da configuração, e o nome entrou na assinatura do render — sem isso o `renderTree` retornava cedo pelo cache e deixava o rótulo velho.
- Os seletores de cor do painel mostravam a cor errada. `getComputedStyle` não resolve custom properties (devolve o texto literal `var(...)`), e o Chrome resolve `color-mix()` no formato moderno `color(srgb 0.86 0.49 0.41)`, com floats de 0 a 1 — nenhum dos dois formatos era lido. Agora a cor é resolvida aplicando a variável numa propriedade real do próprio avatar e convertendo os dois formatos para `#rrggbb`.
- O acessório "Fone" era centrado na cara e o arco cobria os olhos. Subiu para y=24%.
- Os chips-ícone do painel ficavam com a cor do tema em vez da cor escolhida: eles são irmãos do `.ai-av` e não herdavam as variáveis inline dele. Agora as variáveis de cor são publicadas também na raiz do painel.
- Acessórios do mascote (orelhas, auréola, antena) apareciam quase inteiros escondidos atrás do corpo — só a ponta vazava, e só de um lado, porque o `scaleY(.6)` do corpo tem origem no centro e o `border-radius` do blob é assimétrico. As orelhas foram recalibradas para ultrapassar a silhueta nos dois lados.
- O acessório era posicionado com um tamanho em px **chutado** pelo JavaScript (o painel assumia 92px enquanto o CSS desenhava 64px), então ele vaziava para fora da caixa e era cortado — em todos os tamanhos (tile, página da IA, "Pensando…"). Agora a posição é em **porcentagem**, que sempre acompanha a caixa renderizada, e o parâmetro de tamanho em px foi eliminado.
- O painel do Mascote foi reorganizado em grupos com divisórias e rótulo acima do controle. Antes era rótulo à esquerda e controle à direita: os chips ficavam presos numa caixa de 196px ao lado de ~120px vazios, com as bordas serrilhadas e o rótulo flutuando no meio de blocos de quatro linhas. As divisórias ganharam respiro em cima e embaixo.
- Configurações e Mascote abrem **encostados no botão de perfil**, crescendo para cima e limitados ao espaço disponível acima dele. Antes cada painel tinha sua própria matemática de posição: ambos ocupavam quase a janela inteira de cima a baixo (o de Configurações preenchia 884px dos 900px de janela), ficavam soltos do botão que os abriu e abriam em posições diferentes. Agora a matemática virou uma função só, `placeProfilePopover` (utils.js), usada pelos dois.
- O painel do Mascote ganhou respiro interno: padding lateral e vertical, mais espaço entre seções e chips maiores.
- Com `prefers-reduced-motion` (ou animação desligada) o avatar da IA aparecia como **retângulo**: a casca só tinha `border-radius` dentro dos `@keyframes`. Cada silhueta agora tem um `border-radius` estático equivalente ao frame inicial.
- O acessório era emitido fora do `.ai-av`, então `position:absolute` o ancorava no popover e as orelhas apareciam soltas no canto da tela. Passou a ser filho do wrapper achatado (acompanha o `scaleY`) e ganhou camada própria: orelhas/auréola/antena atrás do corpo, coroa/boné/fone na frente do rosto.

## [1.19.0] ÔÇö 2026-09-30
### Modificado
- Trocar de conversa esvazia o fluxo de mensagens: as bolhas da conversa anterior saiam do DOM (2 notas apareciam como 4). Preserva o #empty-state, que mora dentro de #messages.

## [1.18.0] ÔÇö 2026-09-29
### Modificado
- versao sobe na promocao via scripts/release.mjs

## [1.17.0] ÔÇö 2026-09-29
### Corrigido
- **Aviso de lista completa sumia com "ocultar itens conclu├¡dos" ligado**: marcar a ├║ltima caixa de um checklist sa├¡a por um caminho que retornava antes de disparar o aviso, ent├úo a lista ficava completa sem nenhuma confirma├º├úo ÔÇö badge, confete e toast. O aviso agora sai nos dois caminhos, sem repetir a cada re-render
- **Separador de dia ficava ├│rf├úo**: ao apagar todas as mensagens de um dia, o indicador ("Hoje", "Ontem" ou a data) continuava vis├¡vel ocupando 39px de espa├ºo morto. Agora ele some com anima├º├úo e sai do fluxo. A causa era dupla: o cleanup de render procurava `.day-sep`, mas o elemento real ├® o wrapper `.day-sep-wrap` ÔÇö ent├úo nada era removido e os separadores ainda se acumulavam a cada re-render da conversa
- **A barra de rolagem "guardava" o espa├ºo da mensagem apagada**: o fluxo mantinha a altura antiga depois de remover n├│s, deixando espa├ºo vazio no fim. Isso valia para apagar mensagem, ocultar item conclu├¡do, sumir com um separador e para o evento de exclus├úo vindo de outro aparelho
- **A seta de voltar ao lado do nome da conversa era um bot├úo de 8├ù21px**: ela usava a classe `.btn-icon`, que n├úo existe no CSS, e ficava com o estilo padr├úo do navegador ÔÇö sem ├írea de toque, onde o m├¡nimo ├® 44├ù44. Virou um bot├úo circular de 40├ù40 com ├írea de toque de 44├ù44, ├¡cone em SVG na cor do tema e anima├º├úo leve ao pressionar
### Adicionado
- **"Voltar" no celular virou uma hierarquia de tr├¬s n├¡veis**: um arrasto para o lado (ou o bot├úo Voltar) fecha primeiro o que estiver aberto por cima ÔÇö o seletor de rea├º├Áes, o menu da mensagem, o modal, o preview da nota; depois leva da conversa de volta para o explorador de conversas e pastas; e s├│ na a├º├úo seguinte chega ao n├¡vel de minimizar o app. Cada gesto consome um n├¡vel, nunca todos de uma vez
- **Barra de rolagem do fluxo de mensagens refeita**: polegar mais vis├¡vel que antes, que ganha corpo ao passar o mouse e adquire a cor de destaque ao arrastar

## [1.16.0] ÔÇö 2026-09-29
### Modificado
- **Texto leg├¡vel em todo o app**: 41 regras de texto que estavam entre 10px e 11.5px subiram para 12px ÔÇö secund├írias da sidebar, hora e status das mensagens, r├│tulos de Configura├º├Áes, dicas de lembretes e da Di├íria, legendas da busca e da IA. Os n├║meros de badge, contador e avatar ficaram como estavam: s├úo glifos, n├úo texto
- **Contraste medido nos 10 temas**: ao validar a tipografia, ficou registrado que `.bubble .meta` (3.16 no p├¬ssego, 2.35 no sakura, 2.46 no napolitano), `.explorer-label` e `.brand-sub` est├úo abaixo de 4.5:1 ÔÇö a cor n├úo depende do tamanho da fonte, ent├úo a falha ├® antiga e nunca foi medida. Novo item de backlog (B1b)

## [1.15.0] ÔÇö 2026-09-29
### Adicionado
- **Mensagens de voz**: gravar ├íudio agora vira uma mensagem de verdade na conversa, no formato do WhatsApp ÔÇö bot├úo de play ├á esquerda, **waveform real** no meio (os picos do ├íudio de verdade, n├úo barras decorativas), dura├º├úo e progresso clic├ível, e a foto do remetente (do login Google) ou a inicial do nome ├á direita. O ├íudio ├® gravado, enviado para o Supabase Storage e toca em qualquer aparelho da conta; as barrinhas mostram o som enquanto voc├¬ ouve, e clicar numa barra pula para aquele trecho
### Corrigido
- **O bot├úo do campo da IA agora ├® o mesmo da conversa**: na p├ígina da IA o bot├úo da direita alterna entre microfone (campo vazio) e enviar (com texto), igual ao composer das conversas ÔÇö mesma caixa, mesma cor e mesmos ├¡cones. O bot├úo da esquerda (clipe de anexo) n├úo existe na IA, porque l├í n├úo h├í anexo
- **O ├íudio enviado n├úo virava mensagem**: a grava├º├úo entrava na lista de imagens como arquivo solto e aparecia como anexo quebrado em vez de mensagem. Agora o ├íudio tem destino pr├│prio, com dados de onda, dura├º├úo e remetente

## [1.14.0] ÔÇö 2026-09-29
### Adicionado
- **P├ígina "Como usar"**: novo item no menu do seu perfil abre um guia completo do app ÔÇö conversas, cadernos, mensagens (formata├º├úo, checklist, men├º├Áes), IA, Di├íria, Lembretes, Pend├¬ncias, busca, sincroniza├º├úo, atalhos e todas as se├º├Áes das Configura├º├Áes. Cada recurso tem um passo a passo curto, e a p├ígina respeita o tema ativo

## [1.13.6] ÔÇö 2026-09-29
### Corrigido
- **Login com o Google voltou a funcionar**: o cliente Supabase era criado com o `flowType` padr├úo (`implicit`), mas a p├ígina de retorno do OAuth roda como PKCE. O Google voltava com os tokens no fragment e o client n├úo reconhecia o retorno ÔÇö a janela ficava em ÔÇ£Conectando com o GoogleÔÇªÔÇØ, fechava e ningu├®m era logado. Agora o `flowType: 'pkce'` ├® expl├¡cito no cliente compartilhado

## [1.13.5] ÔÇö 2026-09-28
### Modificado
- **O campo da IA ├® o mesmo da conversa**: a janela da IA trocou o input retangular por **o mesmo componente cozy** do composer das conversas ÔÇö mesma p├¡lula arredondada, mesmos bot├Áes circulares, mesma borda de foco no coral. Agora ele tamb├®m ├® flutuante, como o da conversa, e o enviar s├│ ativa com texto
- **Logos seguem o tema**: al├®m da logo da barra lateral, agora mudam com a cor do tema a do aviso ÔÇ£Nenhuma conversa selecionadaÔÇØ, a do login e a do splash
- **Bot├Áes do cabe├ºalho acendem**: Pend├¬ncias, Lembretes e Notifica├º├Áes ficam s├│lidos (na cor do tema) quando a p├ígina/popover est├í aberto, como a lupa. Pend├¬ncias e Lembretes tamb├®m passaram a alternar ÔÇö clicar de novo fecha
- **Di├íria sem input redundante**: o campo r├ípido e o bot├úo `+` sa├¡ram da p├ígina; criar tarefa ├® s├│ pelo bot├úo **Nova tarefa** (modal com hor├írio e switch de aviso)
- **Esc fecha as notifica├º├Áes** (antes s├│ o clique-fora)

### Corrigido
- O campo da IA n├úo desenhava mais um ret├óngulo ao ser focado: o foco ├® marcado s├│ na p├¡lula, como na conversa

## [1.13.4] ÔÇö 2026-09-28
### Corrigido
- **As contas pararam de compartilhar notas** (a causa de verdade): a fila de envio offline era ├║nica para o dispositivo inteiro. Uma nota escrita offline pela conta A era reenviada assim que **qualquer** conta entrasse ÔÇö e gravada no servidor com o `user_id` da conta B (o RLS aceitava, ent├úo a nota aparecia na conta errada). Agora cada item da fila pertence a uma conta e s├│ ├® enviado quando ela est├í online
- **Itens antigos da fila** (enfileirados antes desta corre├º├úo) n├úo vazam mais: s├│ sobem se a conversa a que se referem existir na conta que est├í entrando
- **Edi├º├Áes, tags, rea├º├Áes, exclus├Áes e pinos** passes a levar o `user_id` no filtro, al├®m do RLS ÔÇö uma segunda barreira caso a policy do servidor mude
- **Realtime sem sess├úo n├úo abre mais canal**: um canal sem filtro por `user_id` continua recebendo as linhas de todo mundo (o RLS n├úo protege o Realtime como protege o REST)
- **Logout derruba o canal**: ao sair, o app deixa de receber as notas da conta que saiu

## [1.13.3] ÔÇö 2026-09-28
### Corrigido
- **Contas n├úo se misturam mais**: criar uma conta nova com outro e-mail e reabrir o app j├í n├úo mostra as conversas da conta anterior. O que ├® seu (conversas, cadernos, chave da IA, rotina da Di├íria) agora fica guardado **por conta** neste dispositivo; o que ├® do aparelho (tema, som, fonte, densidade) continua compartilhado
- **Troca de conta remonta a tela**: a conversa aberta, o chat com a IA e os pins da conta anterior n├úo ficam mais pendurados ao entrar com outra conta

### Modificado
- **Di├íria com data e contador em destaque**: o cabe├ºalho da p├ígina mostra o ├¡cone ­ƒùô´©Å e o card inicial virou data (dia da semana, dia do m├¬s, m├¬s/ano) com contador `2/5 conclu├¡das` que fica verde no dia completo
- **Modal de tarefa di├íria**: bot├úo **Nova tarefa** abre um modal com o texto, o **hor├írio** e um switch **Avisar neste hor├írio** ÔÇö o aviso vira notifica├º├úo no dia, no hor├írio escolhido. A entrada r├ípida continua na p├ígina
- **├ìcone da p├ígina no cabe├ºalho**: cada p├ígina do workspace (IA, Di├íria, Lembretes) mostra seu ├¡cone ├á esquerda do t├¡tulo

## [1.13.2] ÔÇö 2026-09-28
### Modificado
- **Placeholder aponta para a IA**: o segundo atalho virou **Ô£ª Conversar com a IA** (antes, Abrir Di├íria) e o texto ensina que ela l├¬ notas, responde e cria notas
- **P├ígina da IA com identidade**: o cabe├ºalho mostra **ÔÇ£Conversa com a IAÔÇØ** (era o gen├®rico ÔÇ£Selecione uma conversaÔÇØ) com um **Ôôÿ** que abre a lista do que ela ├® capaz de fazer ÔÇö clique fixa, hover mostra, Esc/clique-fora fecha
- **Placeholder animado na busca**: o campo digita exemplos em loop (`#urgente`, `in:Compras`ÔÇª) para ensinar a sintaxe; para de digitar quando voc├¬ come├ºa a escrever

## [1.13.1] ÔÇö 2026-09-28
### Adicionado
- **Placeholder ÔÇ£Nenhuma conversa selecionadaÔÇØ**: ao abrir o app (ou excluir/apagar tudo) o canvas mostra logo animada, mensagem e atalhos **+ Nova conversa** e **Abrir Di├íria** ÔÇö sem mais tela em branco. Some sozinho ao abrir uma conversa (e n├úo compete com as p├íginas IA/Di├íria)

## [1.13.0] ÔÇö 2026-09-28
### IA ÔÇö assistente das suas notas
- **A IA agora l├¬ suas notas**: as conversas recentes entram como contexto autom├ítico ÔÇö pe├ºa resumos, planos e perguntas sobre o que voc├¬ j├í anotou
- **A IA cria notas de verdade**: pediu ÔÇ£crie uma nota na conversa Compras com a lista do churrascoÔÇØ? Ela cria na conversa certa (com confirma├º├úo e chip na resposta) e a nota sincroniza como qualquer outra
- **├üudio no chat**: bot├úo de microfone grava, **transcreve com a Gemini** (mesma chave) e cola o texto no campo para revis├úo antes de enviar ÔÇö com timer, pulso vermelho e status
### Di├íria ÔÇö rotina que se renova
- **Checklist de rotina**: cadastre tarefas fixas (ex.: beber 2L de ├ígua) e marque como conclu├¡do **por dia** ÔÇö ├á meia-noite a lista recome├ºa, o item fica
- **Progresso do dia** com barra e **streak** ­ƒöÑ de dias seguidos completando tudo
- Removido o di├írio de texto livre (a ess├¬ncia agora vive nas conversas)

## [1.12.1] ÔÇö 2026-09-28
### Corrigido
- **Busca no lugar exato do NOVO**: o painel virou overlay na mesma ├írea do bot├úo (crossfade) ÔÇö n├úo empurra mais o layout nem abre ÔÇ£abaixoÔÇØ
- **Sem scrollbars**: a scrollbar do painel de busca e a da lista de cadernos/conversas do explorador foram escondidas (o scroll por gesto/roda continua funcionando)

## [1.12.0] ÔÇö 2026-09-28
### Modificado
- **Seletor de p├íginas redesenhado**: virou uma faixa pr├│pria **abaixo da marca e acima do NOVO**, com r├│tulos completos (Cadernos ┬À IA ┬À Di├íria), ├¡cones e estado ativo claro ÔÇö navega├º├úo principal do app
- **Menu removido das conversas abertas**: a faixa de abas dentro do canvas saiu; a conversa fica limpa, sem navega├º├úo duplicada ÔÇö voltar para a lista segue pelo ÔÇ╣ ou pelo seletor
- **Toggle lupa Ôåö busca refeito**: o NOVO agora **desaparece em fade out** (sem encolher), o painel de busca **aparece em fade in** e **a lupa n├úo se move um pixel**

### Removido
- Abas do workspace dentro da conversa e CSS/JS ├│rf├úos (o seletor da sidebar assumiu a navega├º├úo)

## [1.11.0] ÔÇö 2026-09-28
### Adicionado
- **Bot├úo ÔÇ£+ NOVOÔÇØ unificado**: um s├│ bot├úo cria conversa **ou** caderno ÔÇö o modal ganhou o seletor `­ƒÆ¼ Conversa | ­ƒôü Caderno` e troca o formul├írio na hora (mantendo o que voc├¬ j├í digitou)
- **Lupa no explorador**: o bot├úo de busca recolheu o ÔÇ£+ NOVOÔÇØ com fade e abre o campo de busca no mesmo espa├ºo ÔÇö um componente de cada vez, mais espa├ºo para a lista
- **Seletor de p├íginas no explorador**: os tr├¬s bot├Áes antigos viraram um seletor **­ƒôô Cadernos ┬À Ô£ª IA ┬À ­ƒùô´©Å Di├íria** ao lado da marca ÔÇö alterna para a IA ou a Di├íria direto de qualquer lugar, sem precisar abrir uma conversa antes

## [1.10.0] ÔÇö 2026-09-28
### Adicionado
- **Workspace com abas**: faixa compacta de abas **Conversas ┬À IA ┬À Lembretes ┬À Di├íria** abaixo do cabe├ºalho (a conversa aberta continua sendo tela dentro de Conversas, com Voltar). No celular, o **swipe horizontal** alterna as p├íginas e mostra por um instante o **indicador do destino** (seu carrossel tempor├írio) enquanto o dedo se move
- **Chat com IA (Gemini)**: aba IA com conversa persistente neste dispositivo ÔÇö voc├¬ cola sua pr├│pria chave do Google AI Studio (nada sai do aparelho al├®m da chamada direta ├á API), escolhe o modelo e conversa com markdown renderizado. O hist├│rico guarda as ├║ltimas 40 mensagens e a CSP do site foi aberta especificamente para `generativelanguage.googleapis.com`
- **Di├íria**: espa├ºo privado para registrar o dia, por data, salvo apenas no dispositivo (n├úo sincroniza)
- Bot├úo Lembretes do explorer agora abre a aba Lembretes (mesma lista de sempre)

## [1.9.4] ÔÇö 2026-09-28
### Corrigido
- **App n├úo abria (tela em branco)**: um refactor de "workspace" entrou pela metade num deploy (import ligado, m├│dulo incompleto) e derrubou a inicializa├º├úo. As pe├ºas do refactor foram retiradas at├® serem conclu├¡das em outro lugar; o app volta a abrir normalmente na 1.9.1+ com os ├¡cones novos da logo oficial

## [1.9.3] ÔÇö 2026-09-28
### Corrigido
- **├ìcone do app usa a logo oficial** (bal├úo + l├ípis, coral): a arte que ia para a tela inicial do celular era um resqu├¡cio visual da era NoteThread (carretel de linha roxo) referenciado no manifest. Os ├¡cones do launcher s├úo gerados agora da pr├│pria logo ÔÇö glifo grande no tile e variante maskable com o gradiente coral at├® a borda

## [1.9.2] ÔÇö 2026-09-28
### Corrigido
- **Bot├úo "Instalar app" voltou a aparecer depois de desinstalar**: a flag que o escondia ficava presa no armazenamento do site (que sobrevive ├á desinstala├º├úo no Android). Agora o navegador decide ÔÇö ele s├│ oferece o prompt quando o app realmente n├úo est├í instalado

## [1.9.1] ÔÇö 2026-09-28
### Adicionado
- **Splash de abertura**: tela de boot com a marca, barra de progresso animada e fundo do tema substitui o flash em branco na primeira carga (mobile/PWA); some com fade assim que a interface est├í pronta
### Corrigido
- **├ìcone do launcher**: o glifo agora ocupa o tile inteiro ÔÇö variante maskable pr├│pria (fundo at├® a borda, glifo na safe zone) e o logo retangular n├úo ├® mais usado como ├¡cone de app; sem compress├úo na tela inicial do Android
- **Bot├úo de mensagem fixada** n├úo aparece mais sobre a lista de cadernos no celular nem por cima das p├íginas de Busca/Lembretes/Pend├¬ncias
- **Pend├¬ncias e Lembretes funcionam no celular**: as p├íginas deslizam o canvas para frente (ficavam escondidas atr├ís da lista de cadernos) e o bot├úo Voltar devolve ao explorer
- Modal de Nova conversa/caderno ancorado no topo no mobile ÔÇö o conte├║do fica vis├¡vel mesmo com o teclado aberto

## [1.9.0] ÔÇö 2026-09-28
### Adicionado
- **Instalar app**: bot├úo novo no menu do perfil aparece quando o navegador oferece a instala├º├úo do PWA (Chrome/Android/Edge) e some para sempre depois que voc├¬ instala. No iOS o caminho continua sendo Compartilhar ÔåÆ "Adicionar ├á Tela"
- **Atalhos no ├¡cone do app**: segurar o ├¡cone (Android/Chrome) mostra **Nova conversa**, **Pend├¬ncias** e **Lembretes** ÔÇö abrem direto na a├º├úo certa, sem passar pela tela inicial
- Metadados de app (application-name, t├¡tulo iOS, description) para listing em lojas e buscadores
### Corrigido
- **Men├º├Áes no editor novo**: dropdown de @ voltou a abrir (regress├úo do editor WYSIWYG) e o backlink `@[Nome](t:id)` n├úo se perde mais ao enviar a nota ÔÇö "Mencionado em" e a navega├º├úo entre notas funcionam de novo de ponta a ponta

## [1.8.2] ÔÇö 2026-09-26
### Adicionado
- **Vis├úo Pend├¬ncias** Ô£à: novo bot├úo no topo do explorer mostra **todos os itens de checklist abertos de todas as conversas** numa lista ├║nica ÔÇö com checkbox funcional (marcar aqui edita a nota de origem e sincroniza entre dispositivos), conversa de origem em cada linha e clique que abre a nota certa. Um contador discreto no bot├úo mostra quantas pend├¬ncias existem; concluir um item anima a linha para fora. O SaveChat agora tamb├®m funciona como gerenciador leve de tarefas
### Corrigido
- O bot├úo **Lembretes** do explorer n├úo abria a p├ígina (as fun├º├Áes eram chamadas mas nunca tinham sido implementadas) ÔÇö agora abre a lista de lembretes pendentes com link para cada conversa

## [1.8.1] ÔÇö 2026-09-25
### Adicionado
- **P├®talas flutuantes** Ô£┐: novo toggle "Ambiente ÔåÆ P├®talas flutuantes" nas configura├º├Áes ÔÇö p├®talas, estrelinhas e cora├º├Áes sobem devagar pelo fundo do app, em pouqu├¡ssima quantidade e com a paleta do tema atual (mais discretos nos temas escuros). Padr├úo **desligado**, zero impacto em performance quando off, e respeita `prefers-reduced-motion` (quem prefere menos movimento no sistema n├úo v├¬ nada)

## [1.8.0] ÔÇö 2026-09-25
### Adicionado
- **Rea├º├Áes sincronizadas (P0)**: agora elas atravessam dispositivos ÔÇö o Supabase ganhou a coluna `notes.reactions` (jsonb), cada toggle envia o mapa da nota e a chegada remota ├® mesclada **por usu├írio/emoji** (uni├úo), ent├úo ningu├®m mais perde rea├º├úo por causa de eco ou concorr├¬ncia. Remo├º├Áes feitas em outro dispositivo tamb├®m chegam (evento `note:reactions`). Servidor sem a migra├º├úo n├úo quebra o sync de notas
- **Sub-listas com Tab / Shift+Tab**: dentro de qualquer lista (marcadores, numerada ou checklist), Tab indenta o item e Shift+Tab desindenta; o markdown guarda o recuo (2 espa├ºos por n├¡vel) e a bolha renderiza a hierarquia com marcadores distintos (disc ÔåÆ circle ÔåÆ square; a., b. ÔåÆ i., ii.) ÔÇö colar listas indentadas de fora tamb├®m vira sub-lista
- **Bot├Áes de lista com estado ativo**: os bot├Áes de checklist, marcadores, numerada e c├│digo na barra do composer acendem quando o cursor est├í dentro do formato correspondente (al├®m de negrito/it├ílico que j├í acendiam)
- **Colar markdown convertido**: cole texto com `- item`, `1. item`, `[ ] tarefa`, `**negrito**`, `` `c├│digo` `` ou men├º├Áes `@[Nome](t:id)` e ele entra no editor j├í formatado; texto comum continua colando normal (com emoji de rea├º├úo no texto, tamb├®m converte)
- **Buscar por rea├º├úo**: novo filtro `rx:­ƒöÑ` na busca (funciona com emoji direto ou apelidos em pt como `rx:coracao`, `rx:fogo`, `rx:ideia`, `rx:top`) ÔÇö combin├ível com `in:`, `#tag` e datas; resultado mostra chip "rea├º├úo: ­ƒöÑ" e o painel de atalhos ganhou o comando

## [1.7.3] ÔÇö 2026-09-25
### Alterado
- **Tema Bubblegum ÔåÆ Napolitano**: o Bubblegum (rosa chiclete) era muito parecido com o Sakura. O Napolitano traz a paleta do sorvete ÔÇö morango no accent, chocolate nas bolhas pr├│prias e baunilha nos fundos ÔÇö com logo e favicon pr├│prios. Quem tinha Bubblegum salvo recebe o Napolitano automaticamente

## [1.7.2] ÔÇö 2026-09-25
### Melhorado
- **Glifos redesenhados**: sakura com recorte em V na p├®tala e estames pontilhados, borboleta com 4 asas + antenas com bolinhas, morango com coroa de folhas e sementinhas, arco-├¡ris com 3 faixas em matizes derivados da cor do tema + nuvens fofas nas pontas + estrela
- **Menu de rea├º├Áes em 2 vistas**: a linha superior mostra as **4 rea├º├Áes mais usadas por voc├¬** (aprende com o uso; come├ºa com ÔØñ´©Å Ô£¿ ­ƒî© ­ƒÿè) e um bot├úo **+** abre o **seletor completo** dentro do mesmo popover ÔÇö com **seta ÔåÉ para voltar** ao menu
- **Cat├ílogo de rea├º├Áes expandido para 24**: al├®m das afetivas, rea├º├Áes funcionais para marcar as pr├│prias mensagens ÔÇö Ô£à ÔØî ÔØù ÔØô ­ƒæì ­ƒÖÅ ­ƒöÑ Ô¡É ­ƒÆí ­ƒÄ» ­ƒôî ÔÅ░ ­ƒæÇ ­ƒÆ» ­ƒÿé ­ƒÑ░ ­ƒÿ« ­ƒÿó ­ƒñö ­ƒ½Â

## [1.7.1] ÔÇö 2026-09-25
### Adicionado
- **Rea├º├Áes r├ípidas (ÔØñ´©Å Ô£¿ ­ƒî© ­ƒÿè)**: linha de rea├º├úo no popover da mensagem (seta Ôû¥, clique direito ou long-press) e p├¡lulas na bolha com contagem ÔÇö clique alterna a sua rea├º├úo, e o popover n├úo fecha ao reagir (permite v├írias). Persistidas localmente por usu├írio (`note.reactions`); sincroniza├º├úo entre dispositivos chega junto com a coluna remota
- **Bolhas mais org├ónicas**: cantos com leve assimetria (rabicho no canto de origem: inferior-direito nas suas, inferior-esquerdo nas recebidas) e **sombra blush** ÔÇö brilho da pr├│pria cor da bolha do tema em vez de cinza, com fallback autom├ítico para browsers sem `color-mix`

## [1.7.0] ÔÇö 2026-09-25
### Adicionado
- **Temas novos: Sakura** (rosa cerejeira suave) **e Napolitano** (sorvete: morango + chocolate + baunilha) ÔÇö com logo e favicon pr├│prios que acompanham o tema. *(na 1.7.0 o segundo tema era o Bubblegum, muito parecido com o Sakura ÔÇö trocado na 1.7.3)*
- **4 padr├Áes de fundo novos**: Sakura (flores de cerejeira), Borboletas, Morangos e Arco-├¡ris ÔÇö glifos desenhados no gerador, com cor acompanhando cada tema e previews na grade de configura├º├Áes
- **Confete cozy ao concluir checklist**: marcar o ├║ltimo item de uma lista solta estrelinhas e p├®talas na bolha, com som suave (sparkle). Respeita prefers-reduced-motion
- **Frases fofas variadas no estado vazio** de conversas novas ("P├ígina em branco, ideias ├á solta Ô£¿", "Respire, anote, flores├ºa ­ƒî©"ÔÇª) ÔÇö uma diferente a cada conversa criada
- **Toasts com voz ao criar conversa/caderno** ("Caderninho novo criado ­ƒîÀ", "Prontinho! A├¡ ├® com voc├¬ Ô£¿")
- **Lembretes falando em primeira pessoa**: "Psst! Voc├¬ me pediu para lembrar voc├¬: ÔÇª" (notifica├º├úo e toast)

### Melhorado
- Sons: nova a├º├úo `playName` permite tocar um som espec├¡fico da lib respeitando as prefer├¬ncias do usu├írio (enabled/volume)

## [1.6.1] ÔÇö 2026-09-25
### Melhorado
- **Shift+Enter continua bullet e lista numerada** (al├®m da checklist): no composer, quebra no caret e o texto seguinte migra para o novo item; na edi├º├úo de mensagem enviada, insere `- ` ou o pr├│ximo n├║mero (`2.`, `3.`ÔÇª) automaticamente. Fora de lista, quebra de linha simples
- **Enter em item vazio de lista numerada agora sai da lista** ÔÇö antes alternava para bullet (bug de comando errado)
- **Sa├¡da de item vazio reescrita com manipula├º├úo direta de DOM** (determin├¡stica, sem depender de execCommand/foco da janela)
- **Corrigida corrup├º├úo ao salvar edi├º├úo**: a hora da bolha podia entrar no texto da mensagem quando a serializa├º├úo inclu├¡a o meta re-anexado; agora serializa um clone limpo
- **Detec├º├úo de linha na edi├º├úo respeita `<br>`**: continua├º├Áes seguidas de lista n├úo acumulam mais prefixos na mesma linha

## [1.6.0] ÔÇö 2026-09-21
### Melhorado
- **Rodap├® da bolha sem sobreposi├º├úo**: padding-bottom das mensagens aumentado ÔÇö a ├║ltima linha do texto n├úo encosta mais no hor├írio (que ├® posicionado no canto inferior da bolha); densidades compacta e m├®dia acompanham
- **Popover da mensagem 100% dentro da tela**: posi├º├úo calculada com a medi├º├úo real do popover (n├úo mais estimada) e clamps nos dois eixos ÔÇö abre para cima quando n├úo cabe embaixo e encosta no ch├úo da janela quando necess├írio
- **Shift+Enter em checklist cria a pr├│xima checkbox** (no composer E na edi├º├úo de mensagem enviada): novo item entra com checkbox desmarcada e o texto ap├│s o caret migra para ele; item vazio continua saindo da lista. A edi├º├úo inline agora serializa via markdown, preservando checklists, quebras de linha e negrito que antes se perdiam ao salvar
- **Flick de layout no scroll infinito eliminado (v3, definitivo)**: espa├ºo do indicador de carregamento ├® RESERVADO no fluxo (slot #load-slot no HTML, sempre presente com altura fixa de 30px, no topo do chat, acima das mensagens) ÔÇö mostrar/esconder o indicador apenas liga/desliga a opacidade dentro do slot. Layout id├¬ntico nos dois estados (scrollHeight/scrollTop constantes medidos, shift das bolhas = 0), as mensagens nunca alcan├ºam nem ficam sob o indicador
### Melhorado
- **Centro de notifica├º├Áes redesenhado**: cada item ganhou um tile de ├¡cone por tipo (rel├│gio = lembrete, pin = fixada, bal├úo = mensagem) com cor do tema; hierarquia clara t├¡tulo ┬À hora relativa ┬À corpo em at├® 2 linhas ┬À nome da conversa; p├¡lula de contador de n├úo-lidas no cabe├ºalho (al├®m do badge da nav); dot de n├úo-lida virou badge discreto no canto; estado vazio com sino em SVG (sem emoji); clicar numa notifica├º├úo agora a marca como lida ÔÇö antes o badge s├│ baixava com "Marcar lidas". Fix: a regra base `.rem-item` (declarada depois no CSS) vencia o grid do item e empilhava o ├¡cone sobre o texto ÔÇö agora `.rem-list .notif-item` garante o layout correto. Segundo conflito na mesma fam├¡lia: `.popover button` (gen├®rica, declarada depois) esticava os bot├Áes "Ativar" e "Marcar lidas" com `width: 100%` ÔÇö rescalda `.rem-popover` devolve o tamanho de p├¡lula
### Corrigido
- **Bot├úo Favoritar quebrado em duas linhas** no menu de contexto da conversa: o c├│digo que exibia/ocultava o par Favoritar/Remover dos favoritos aplicava `display: block` inline, sobrescrevendo o `display: flex` do CSS ÔÇö o ├¡cone e o texto ca├¡am em linhas separadas. Agora o estilo inline ├® apenas removido ao exibir, devolvendo o controle ao CSS
- **Flick da lista lateral ao criar conversa/caderno**: o renderTree reconstru├¡a a lista inteira e re-animava TODOS os n├│s (mesma fam├¡lia do bug da anima├º├úo dupla das bolhas). Agora a ├írvore s├│ reconstr├│i quando algo vis├¡vel realmente mudou (fingerprint), e a anima├º├úo de entrada toca apenas no n├│ rec├®m-criado ÔÇö ecos do realtime e renders redundantes n├úo piscam mais a lista
- **Anima├º├úo dupla no envio**: a bolha nova recebia duas classes de anima├º├úo ao mesmo tempo (`is-new` + `just-sent`) ÔÇö a segunda trocava a anima├º├úo no mesmo frame e a entrada reiniciava (o piscar 2├ù em todo envio). Agora cada bolha tem UMA anima├º├úo: pop spring no envio pr├│prio, entrada suave s├│ em mensagem remota
- **Rede de seguran├ºa de DOM**: qualquer caminho de render agora garante no m├íximo 1 bolha por nota (`dedupeBubblesDom`), e o envio registra a nota no conjunto de renderiza├º├úo (o eco do realtime n├úo criava esse registro)
- **Guardas reconhecem texto com zero-width spaces**: replay de extens├úo/serializa├º├úo reinjeta caracteres invis├¡veis (\u200B etc.) ÔÇö g├¬meas longas com esses caracteres escapavam da compara├º├úo de texto; agora s├úo removidos antes de comparar
- **Causa da "anima├º├úo repetindo" encontrada**: o evento de tint de chegada (`note:remote`) disparava tamb├®m para o eco da sua pr├│pria nota ÔÇö cada envio piscava azul ~300ms depois, parecendo a anima├º├úo de envio 2-3├ù. Agora o tint s├│ ocorre para notas de OUTRO usu├írio (filtro por user_id + guarda extra no handler)
- **Guard estrutural anti-double-fire**: nota "nova" (clientId diferente) com texto longo id├¬ntico (ÔëÑ200 chars) da mesma pessoa em Ôëñ2,5s ├® absorvida pela existente em vez de inserida ÔÇö e a g├¬mea ├® apagada do servidor. Mensagens curtas repetidas de prop├│sito continuam passando normalmente
- **Re-render ao criar nota corrigido**: o snapshot que chega ap├│s reconex├Áes s├│ re-renderiza a conversa aberta se algo vis├¡vel mudou (fingerprint antes/depois do merge) ÔÇö elimina o flash da ├írvore e das mensagens ao criar nota/enviar logo ap├│s abrir o app
- **Atualiza├º├Áes nunca eram oferecidas**: o chip comparava CHANGELOG ├ù vers├úo do app ÔÇö com as duas sincronizadas, o app dizia "├║ltima vers├úo" mesmo com um Service Worker novo em waiting. Agora o update ├® oferecido **sempre que houver SW esperando**, independente das vers├Áes, e a vers├úo do app volta a subir a cada release (1.5.3 ÔåÆ 1.6.0)
- Todas as corre├º├Áes de duplica├º├úo de mensagens abaixo (das rodadas de 1.5.3) agora chegam de verdade ao navegador ÔÇö antes ficavam presas porque nenhum update era oferecido

## [1.5.3] ÔÇö 2026-09-21
### Adicionado
- **Centro de notifica├º├Áes**: o sino agora abre um feed persistente com as notifica├º├Áes n├úo-lidas (ponto azul), bot├úo "Marcar lidas", linha de permiss├úo do sistema e lembretes pendentes; lembretes disparados alimentam o feed automaticamente. ├ìcone trocado para sino com tra├ºo fino estilo Hugeicons
- **UI do centro de notifica├º├Áes refinada**: itens agrupados por "Hoje / Anteriores", hora relativa (agora ┬À 12min ┬À 17:35 ┬À 20/09), corpo da mensagem em segunda linha, destaque suave nas n├úo-lidas e empty state amig├ível ("Tudo tranquilo por aqui")
- **Indicador de destino no Drag & drop**: chip flutuante que segue o cursor ("Mover paraÔÇª", "Antes deÔÇª", "Depois deÔÇª"), linha de inser├º├úo azul entre as notas e realce tracejado no caderno alvo
### Corrigido
- **Menu da conta logada n├úo abria**: um bloco de CSS truncado descartava 376 regras do stylesheet (o popover perdia o `position: fixed` e todos os estilos posteriores) ÔÇö CSS restaurado
- **Borda interna quadrada ao focar a busca**: era a decora├º├úo nativa do `input[type=search]` do Chrome/Edge ÔÇö removida via `-webkit-appearance: none`
- **"Atualizar app" n├úo aplicava a nova vers├úo**: o clique recarregava a p├ígina sem esperar o Service Worker novo instalar (e o HTML podia vir do cache HTTP antigo). Agora o bot├úo for├ºa o download, espera a instala├º├úo terminar e s├│ ent├úo ativa+recarrega; `APP_VERSION` tamb├®m ficou sincronizada com o CHANGELOG (antes estava travada em 1.4.2, o que fazia o chip apontar "atualiza├º├úo dispon├¡vel" para sempre) ÔÇö novo teste impede a dessincroniza├º├úo
- **Mensagens grandes duplicadas**: defesas em profundidade contra duplica├º├úo de notas ÔÇö eco do realtime de notas rec├®m-criadas neste dispositivo ├® ignorado (echo guard com janela de 15s), o envio passa a levar a nota can├┤nica do Store com `sortOrder` correto (antes ia sem ordena├º├úo e o eco sobrescrevia), e o Store auto-cura dados antigos removendo notas duplicadas por `clientId` na carga
- **Mensagens grandes duplicadas ÔÇö parte 2 (cura de double-send)**: notas g├¬meas (texto id├¬ntico + mesmo autor + timestamps quase iguais) criadas por builds antigos com `client_id` diferentes s├úo detectadas no snapshot, no realtime, no scroll infinito, **no carregamento do app e antes de cada render** ÔÇö a repetida n├úo renderiza e ├® **apagada do servidor automaticamente**. Era o caso que sobrevivia: a mesma mensagem enviada 2├ù pelo build antigo vira duas linhas leg├¡timas no banco/localStorage, invis├¡veis para qualquer dedup por `clientId`
- **Eco do realtime corrompia a nota pr├│pria**: o merge copiava `undefined` por cima de campos existentes (apagava flag `local`) e trocava o `userId` do email para UUID ÔÇö a mensagem enviada voltava como "remota" (lado errado da conversa, guardas cegas). Merge agora preserva campos ausentes e "minha nota" reconhece tamb├®m o UUID do auth
- **Envio duplicado na hora do Enter**: `sendNote` agora tem trava anti-disparo m├║ltiplo ÔÇö o mesmo texto na mesma conversa em janela de 2s ├® descartado (Enter + clique, re-binding, webviews que repetem o keydown). O bot├úo de enviar tamb├®m n├úo fica mais habilitado com o editor vazio
- **Diagn├│stico de build**: o console agora imprime a vers├úo do build ao carregar (`SaveChat build vN`) e `window.NoteThread.debugLog()` exp├Áe os ├║ltimos eventos de sync/envio para rastrear qualquer duplica├º├úo restante
- **Compatibilidade com Grammarly**: o compositor ├® marcado com `data-gramm="false"` etc. ÔÇö a extens├úo replaya texto e eventos de teclado em campos `contenteditable` e era candidata forte ao disparo m├║ltiplo do envio (o console do usu├írio mostrava o Grammarly injetado)

## [1.5.2] ÔÇö 2026-09-21
### Corrigido
- **Drag & drop de conversas para cadernos** (bug cr├¡tico): um `now()` ├│rf├úo no Store quebrava a movimenta├º├úo ÔÇö a conversa mudava de lugar na mem├│ria, mas nada era salvo nem re-renderizado. O import faltante foi restaurado
### Melhorado
- Painel do explorador 20px mais largo (300ÔåÆ320px) e logo do brand ampliada (36ÔåÆ40px) para acompanhar o nome do app; tagline "Suas ideias, organizadas" garantida em linha ├║nica em qualquer fonte

## [1.5.1] ÔÇö 2026-09-21
### Corrigido
- Composer volta ao tamanho m├¡nimo ap├│s enviar mensagem longa (overflow interno >60vh travava a altura)
- A ├írea de mensagens agora rola "at├®" o composer: padding inferior din├ómico acompanha a altura real do campo flutuante ÔÇö a ├║ltima mensagem nunca fica escondida atr├ís dele
- Mensagem rec├®m-enviada sempre rola para posi├º├úo totalmente vis├¡vel, acima do composer
- Bot├Áes de formata├º├úo (checklist, listas, c├│digo) funcionam mesmo com o foco fora do editor

## [1.5.0] ÔÇö 2026-09-21
### Adicionado
- Editor de mensagens WYSIWYG: os bot├Áes de negrito/it├ílico agora aplicam o efeito direto no texto enquanto voc├¬ digita ÔÇö sem asteriscos na tela. O negrito/it├ílico "modo cont├¡nuo" formata as pr├│ximas palavras at├® ser desligado (o bot├úo fica destacado e acompanha o cursor: Ctrl/Ôîÿ+B, Ctrl/Ôîÿ+I)
- Listas e checklist agora aparecem formatadas no pr├│prio editor (bullets, numeradas e caixinhas clic├íveis) e continuam sendo salvas como texto simples compat├¡vel
- Anexar imagem: bot├úo send/mic volta ao modo microfone corretamente ap├│s enviar

## [1.4.2] ÔÇö 2026-09-18
### Corrigido
- Menus de contexto: glifos e textos perfeitamente alinhados em coluna (caderno e notas); "Excluir caderno" agora usa o mesmo ├¡cone de lixeira do menu das notas
- Login com Google em popup: novo fluxo com p├ígina dedicada de retorno (oauth-callback.html) ÔÇö o popup apenas autoriza, troca o c├│digo de seguran├ºa e se fecha; ├® a janela original (onde voc├¬ clicou em "Entrar com Google") que entra no app. O app nunca mais abre dentro do popup
- O Google agora SEMPRE mostra a escolha de conta (prompt=select_account) em vez de autorizar silenciosamente a sess├úo j├í aberta no navegador
- Se o navegador bloquear o fechamento do popup, ele mostra "Login conclu├¡do! Pode fechar esta janela" em vez de renderizar o app
- Celular/tablet: login com Google por REDIRECT na mesma aba (sem popup ÔÇö UX correta no mobile e em PWA standalone), com retorno pela mesma p├ígina dedicada de callback
- Servidor de desenvolvimento na porta 3000 (bate com as Redirect URLs http://localhost:3000 j├í cadastradas no Supabase)
- ├ürvore: cadernos (pastas) agora t├¬m aba lateral escura no tile (estilo fich├írio), diferenciando-os visualmente das conversas ÔÇö herda a cor da paleta
- ├ürvore: conversa criada pelo estado vazio do caderno ("Pasta vazia ÔÇö clique...") agora nasce DENTRO do caderno, n├úo na raiz
- ├ürvore: p├¡lula fantasma vazia (a "linha branca") n├úo aparece mais ├á direita do nome de cadernos sem conversas
- Menu de contexto do caderno (clique direito / toque longo): nova a├º├úo "´╝ï Nova conversa" para criar direto naquele caderno
- Modal de nova conversa: seletor "Criar em" com todos os cadernos + raiz ÔÇö pr├®-escolhido quando vem do caderno, edit├ível a qualquer momento
- Popover do perfil: reposicionado com a altura real e movido para fora da sidebar ÔÇö nunca mais sobrep├Áe o nome/avatar do login (em telas estreitas ele herdava o sistema de coordenadas da sidebar, com transform, e ia parar fora da tela)
- Empty state da conversa: ├¡cone quebrado (desenho custom torto) trocado por ├¡cone de nota estilo Hugeicons (stroke 1.5, herda a cor do tema); bot├úo "Nova conversa" duplicado removido
- Bot├Áes NOVA CONVERSA / NOVO CADERNO agora seguem a fonte escolhida nas configura├º├Áes (bot├Áes n├úo herdam font-family por padr├úo ÔÇö ficavam na fonte do sistema, "dura"); glifos centralizados verticalmente
- Mecanismo de atualiza├º├úo ├á prova de cache stale: o Service Worker nunca ├® servido do pr├│prio cache, o precache baixa assets sempre da rede (nunca herda vers├úo velha do SW anterior) e todos os assets s├úo revalidados com o servidor ÔÇö corrige o caso de o aviso "nova vers├úo" aparecer mas o bot├úo Atualizar n├úo resolver

### Melhorado
- P├ígina de login: campo de senha com bot├úo de revelar/ocultar DENTRO do input, foco sempre com cantos arredondados e mensagens de erro s├│ quando a tentativa de login ├® real

## [1.4.1] ÔÇö 2026-09-02
### Adicionado
- Bot├úo "Atualizar app" no menu do perfil: verifica├º├úo autom├ítica na abertura (compara com o CHANGELOG servido), indicador de status (atualizado Ô£ô / nova vers├úo dispon├¡vel / offline) e instala├º├úo da nova vers├úo no clique
- Ponto ├ómbar no avatar quando h├í vers├úo nova dispon├¡vel
- Atualiza├º├úo controlada: o Service Worker agora espera o clique (SKIP_WAITING) em vez de assumir a nova vers├úo sozinho
- Vers├úo ├║nica centralizada em `window.APP_VERSION` (Sobre, Sentry e verifica├º├úo usam a mesma fonte)

### Melhorado
- Navega├º├úo e CHANGELOG agora s├úo network-first no Service Worker ÔÇö a vers├úo nova chega sem duplo reload

## [1.4.0] ÔÇö 2026-09-01
### Adicionado
- Rebrand final para SaveChat: logo pr├│pria em toda a UI, favicon com badge de lembretes, ├¡cones PWA dedicados (any + maskable)
- Gera├º├úo de assets de loja: screenshots 824├ù1830 no manifest, feature graphic 1024├ù500, textos da Play em docs/STORE_LISTING.md
- Movido para public/: este changelog agora ├® servido pelo site ÔÇö o toast "Nova vers├úo" l├¬ o que mudou de verdade (antes 404 em prod)
- Terminologia oficial na UI (docs/GLOSSARIO.md): Conversa, Mensagem, Caderno
- Menu do t├¡tulo da conversa com backlinks "Mencionado em"
- Motion fino: transform-origin din├ómico nos popovers, crossfade na troca de tema (View Transitions), lift no drag & drop da ├írvore
- Emojis com carregamento sob demanda; pipeline de build minificado (dist/) para preview de prod
- Hardening do banco: EXECUTE p├║blico revogado no event trigger de auto-RLS (advisors de seguran├ºa do Supabase)

### Corrigido
- E-mail de contato legal (privacidade/termos) apontava para dom├¡nio da marca antiga
- Vers├úo sincronizada: package.json, tela Sobre, Sentry release e tag git

## [1.3.0] ÔÇö 2026-08-24
### Adicionado
- Rebrand para ChatSolo: logo pr├│pria (login, explorer, favicon, manifest PWA)
- Import de backup JSON (merge por id, sem duplicar) ÔÇö complementa o export existente
- Menu dropdown no nome da nota: backlinks "Mencionado em" + op├º├úo Convidar (placeholder)
- Preview de nota linkada em card fixo (estilo card pinado), sempre vis├¡vel independente do scroll
- Men├º├úo com apar├¬ncia de chip-link no campo de input (camada espelho)

### Corrigido
- Settings popover cortado/travado ao alternar notas (reset de maxHeight/overflow a cada abertura)
- Fonte branca nos temas dark/midnight (nome do usu├írio, tela de login)
- Bolhas dos temas claros com fundo saturado + texto branco (--on-bubble; contraste 3.2ÔÇô4.3:1)
- Seta Ôû¥ da mensagem movida para o canto superior direito
- Checkbox de checklist s├│ alterna ao clicar no pr├│prio checkbox
- Foco do composer com raio arredondado coerente (24px)
- Scrollbar customizada no fluxo de mensagens

### Acessibilidade
- Touch targets ÔëÑ44px via hit-area ::after em 6 controles pequenos
- Focus trap no modal + Esc fecha + foco devolvido ao gatilho

## [1.2.0] ÔÇö 2026-08-21
### Adicionado
- Busca com filtros `in:`, `#tag`, `depois:`, `antes:` + chips
- Backlink reverso "Mencionado em" para men├º├Áes `@`
- Pagina├º├úo real `.range()` no Supabase (thread com 5k notas abre r├ípido)
- "What's new" no toast de update (mostra 2 itens do changelog)
- Imagens no Supabase Storage (bucket `note-images`, 5MB, fallback base64)
- Checklists clic├íveis com persist├¬ncia + ocultar conclu├¡das (fade)

### Corrigido
- Singleton Supabase (Multiple GoTrueClient), status laranja preso, modal exclus├úo nota

## [1.1.0] ÔÇö 2026-08-21
### Adicionado
- Men├º├Áes `@` com autocomplete + lembretes com Notification API + badge ÔÅ░
- Persist├¬ncia de login (lembrar-me), modal exclus├úo nota, ├írea arrow, checkboxes
- Pull-to-refresh com indicador visual

## [1.0.0] ÔÇö 2026-08-21
### Adicionado
- Checklist ├║nico `docs/ROADMAP_ESTAVEL.md` (Fases 0ÔÇô4)
- Reorganiza├º├úo `README.md` + `docs/PROGRESSO.md` + `docs/MOBILE_TASKS.md`
- Fix mobile: popovers responsivos, touch 44px, emoji grid 4 colunas, safe-area
- PWA: `meta theme-color` din├ómico, `viewport-fit=cover`
- Server: headers `CSP`/`Cache-Control`, rate-limit, sanitiza├º├úo
- Lightbox pinch-to-zoom + CI, `.env.example`, `privacy.html`/`terms.html`
