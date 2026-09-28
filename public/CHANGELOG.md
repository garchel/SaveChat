# Changelog — SaveChat

Todas as mudanças notáveis serão documentadas aqui (semver).

## [1.13.0] — 2026-09-28
### IA — assistente das suas notas
- **A IA agora lê suas notas**: as conversas recentes entram como contexto automático — peça resumos, planos e perguntas sobre o que você já anotou
- **A IA cria notas de verdade**: pediu “crie uma nota na conversa Compras com a lista do churrasco”? Ela cria na conversa certa (com confirmação e chip na resposta) e a nota sincroniza como qualquer outra
- **Áudio no chat**: botão de microfone grava, **transcreve com a Gemini** (mesma chave) e cola o texto no campo para revisão antes de enviar — com timer, pulso vermelho e status
### Diária — rotina que se renova
- **Checklist de rotina**: cadastre tarefas fixas (ex.: beber 2L de água) e marque como concluído **por dia** — à meia-noite a lista recomeça, o item fica
- **Progresso do dia** com barra e **streak** 🔥 de dias seguidos completando tudo
- Removido o diário de texto livre (a essência agora vive nas conversas)

## [1.12.1] — 2026-09-28
### Corrigido
- **Busca no lugar exato do NOVO**: o painel virou overlay na mesma área do botão (crossfade) — não empurra mais o layout nem abre “abaixo”
- **Sem scrollbars**: a scrollbar do painel de busca e a da lista de cadernos/conversas do explorador foram escondidas (o scroll por gesto/roda continua funcionando)

## [1.12.0] — 2026-09-28
### Modificado
- **Seletor de páginas redesenhado**: virou uma faixa própria **abaixo da marca e acima do NOVO**, com rótulos completos (Cadernos · IA · Diária), ícones e estado ativo claro — navegação principal do app
- **Menu removido das conversas abertas**: a faixa de abas dentro do canvas saiu; a conversa fica limpa, sem navegação duplicada — voltar para a lista segue pelo ‹ ou pelo seletor
- **Toggle lupa ↔ busca refeito**: o NOVO agora **desaparece em fade out** (sem encolher), o painel de busca **aparece em fade in** e **a lupa não se move um pixel**

### Removido
- Abas do workspace dentro da conversa e CSS/JS órfãos (o seletor da sidebar assumiu a navegação)

## [1.11.0] — 2026-09-28
### Adicionado
- **Botão “+ NOVO” unificado**: um só botão cria conversa **ou** caderno — o modal ganhou o seletor `💬 Conversa | 📁 Caderno` e troca o formulário na hora (mantendo o que você já digitou)
- **Lupa no explorador**: o botão de busca recolheu o “+ NOVO” com fade e abre o campo de busca no mesmo espaço — um componente de cada vez, mais espaço para a lista
- **Seletor de páginas no explorador**: os três botões antigos viraram um seletor **📓 Cadernos · ✦ IA · 🗓️ Diária** ao lado da marca — alterna para a IA ou a Diária direto de qualquer lugar, sem precisar abrir uma conversa antes

## [1.10.0] — 2026-09-28
### Adicionado
- **Workspace com abas**: faixa compacta de abas **Conversas · IA · Lembretes · Diária** abaixo do cabeçalho (a conversa aberta continua sendo tela dentro de Conversas, com Voltar). No celular, o **swipe horizontal** alterna as páginas e mostra por um instante o **indicador do destino** (seu carrossel temporário) enquanto o dedo se move
- **Chat com IA (Gemini)**: aba IA com conversa persistente neste dispositivo — você cola sua própria chave do Google AI Studio (nada sai do aparelho além da chamada direta à API), escolhe o modelo e conversa com markdown renderizado. O histórico guarda as últimas 40 mensagens e a CSP do site foi aberta especificamente para `generativelanguage.googleapis.com`
- **Diária**: espaço privado para registrar o dia, por data, salvo apenas no dispositivo (não sincroniza)
- Botão Lembretes do explorer agora abre a aba Lembretes (mesma lista de sempre)

## [1.9.4] — 2026-09-28
### Corrigido
- **App não abria (tela em branco)**: um refactor de "workspace" entrou pela metade num deploy (import ligado, módulo incompleto) e derrubou a inicialização. As peças do refactor foram retiradas até serem concluídas em outro lugar; o app volta a abrir normalmente na 1.9.1+ com os ícones novos da logo oficial

## [1.9.3] — 2026-09-28
### Corrigido
- **Ícone do app usa a logo oficial** (balão + lápis, coral): a arte que ia para a tela inicial do celular era um resquício visual da era NoteThread (carretel de linha roxo) referenciado no manifest. Os ícones do launcher são gerados agora da própria logo — glifo grande no tile e variante maskable com o gradiente coral até a borda

## [1.9.2] — 2026-09-28
### Corrigido
- **Botão "Instalar app" voltou a aparecer depois de desinstalar**: a flag que o escondia ficava presa no armazenamento do site (que sobrevive à desinstalação no Android). Agora o navegador decide — ele só oferece o prompt quando o app realmente não está instalado

## [1.9.1] — 2026-09-28
### Adicionado
- **Splash de abertura**: tela de boot com a marca, barra de progresso animada e fundo do tema substitui o flash em branco na primeira carga (mobile/PWA); some com fade assim que a interface está pronta
### Corrigido
- **Ícone do launcher**: o glifo agora ocupa o tile inteiro — variante maskable própria (fundo até a borda, glifo na safe zone) e o logo retangular não é mais usado como ícone de app; sem compressão na tela inicial do Android
- **Botão de mensagem fixada** não aparece mais sobre a lista de cadernos no celular nem por cima das páginas de Busca/Lembretes/Pendências
- **Pendências e Lembretes funcionam no celular**: as páginas deslizam o canvas para frente (ficavam escondidas atrás da lista de cadernos) e o botão Voltar devolve ao explorer
- Modal de Nova conversa/caderno ancorado no topo no mobile — o conteúdo fica visível mesmo com o teclado aberto

## [1.9.0] — 2026-09-28
### Adicionado
- **Instalar app**: botão novo no menu do perfil aparece quando o navegador oferece a instalação do PWA (Chrome/Android/Edge) e some para sempre depois que você instala. No iOS o caminho continua sendo Compartilhar → "Adicionar à Tela"
- **Atalhos no ícone do app**: segurar o ícone (Android/Chrome) mostra **Nova conversa**, **Pendências** e **Lembretes** — abrem direto na ação certa, sem passar pela tela inicial
- Metadados de app (application-name, título iOS, description) para listing em lojas e buscadores
### Corrigido
- **Menções no editor novo**: dropdown de @ voltou a abrir (regressão do editor WYSIWYG) e o backlink `@[Nome](t:id)` não se perde mais ao enviar a nota — "Mencionado em" e a navegação entre notas funcionam de novo de ponta a ponta

## [1.8.2] — 2026-09-26
### Adicionado
- **Visão Pendências** ✅: novo botão no topo do explorer mostra **todos os itens de checklist abertos de todas as conversas** numa lista única — com checkbox funcional (marcar aqui edita a nota de origem e sincroniza entre dispositivos), conversa de origem em cada linha e clique que abre a nota certa. Um contador discreto no botão mostra quantas pendências existem; concluir um item anima a linha para fora. O SaveChat agora também funciona como gerenciador leve de tarefas
### Corrigido
- O botão **Lembretes** do explorer não abria a página (as funções eram chamadas mas nunca tinham sido implementadas) — agora abre a lista de lembretes pendentes com link para cada conversa

## [1.8.1] — 2026-09-25
### Adicionado
- **Pétalas flutuantes** ✿: novo toggle "Ambiente → Pétalas flutuantes" nas configurações — pétalas, estrelinhas e corações sobem devagar pelo fundo do app, em pouquíssima quantidade e com a paleta do tema atual (mais discretos nos temas escuros). Padrão **desligado**, zero impacto em performance quando off, e respeita `prefers-reduced-motion` (quem prefere menos movimento no sistema não vê nada)

## [1.8.0] — 2026-09-25
### Adicionado
- **Reações sincronizadas (P0)**: agora elas atravessam dispositivos — o Supabase ganhou a coluna `notes.reactions` (jsonb), cada toggle envia o mapa da nota e a chegada remota é mesclada **por usuário/emoji** (união), então ninguém mais perde reação por causa de eco ou concorrência. Remoções feitas em outro dispositivo também chegam (evento `note:reactions`). Servidor sem a migração não quebra o sync de notas
- **Sub-listas com Tab / Shift+Tab**: dentro de qualquer lista (marcadores, numerada ou checklist), Tab indenta o item e Shift+Tab desindenta; o markdown guarda o recuo (2 espaços por nível) e a bolha renderiza a hierarquia com marcadores distintos (disc → circle → square; a., b. → i., ii.) — colar listas indentadas de fora também vira sub-lista
- **Botões de lista com estado ativo**: os botões de checklist, marcadores, numerada e código na barra do composer acendem quando o cursor está dentro do formato correspondente (além de negrito/itálico que já acendiam)
- **Colar markdown convertido**: cole texto com `- item`, `1. item`, `[ ] tarefa`, `**negrito**`, `` `código` `` ou menções `@[Nome](t:id)` e ele entra no editor já formatado; texto comum continua colando normal (com emoji de reação no texto, também converte)
- **Buscar por reação**: novo filtro `rx:🔥` na busca (funciona com emoji direto ou apelidos em pt como `rx:coracao`, `rx:fogo`, `rx:ideia`, `rx:top`) — combinável com `in:`, `#tag` e datas; resultado mostra chip "reação: 🔥" e o painel de atalhos ganhou o comando

## [1.7.3] — 2026-09-25
### Alterado
- **Tema Bubblegum → Napolitano**: o Bubblegum (rosa chiclete) era muito parecido com o Sakura. O Napolitano traz a paleta do sorvete — morango no accent, chocolate nas bolhas próprias e baunilha nos fundos — com logo e favicon próprios. Quem tinha Bubblegum salvo recebe o Napolitano automaticamente

## [1.7.2] — 2026-09-25
### Melhorado
- **Glifos redesenhados**: sakura com recorte em V na pétala e estames pontilhados, borboleta com 4 asas + antenas com bolinhas, morango com coroa de folhas e sementinhas, arco-íris com 3 faixas em matizes derivados da cor do tema + nuvens fofas nas pontas + estrela
- **Menu de reações em 2 vistas**: a linha superior mostra as **4 reações mais usadas por você** (aprende com o uso; começa com ❤️ ✨ 🌸 😊) e um botão **+** abre o **seletor completo** dentro do mesmo popover — com **seta ← para voltar** ao menu
- **Catálogo de reações expandido para 24**: além das afetivas, reações funcionais para marcar as próprias mensagens — ✅ ❌ ❗ ❓ 👍 🙏 🔥 ⭐ 💡 🎯 📌 ⏰ 👀 💯 😂 🥰 😮 😢 🤔 🫶

## [1.7.1] — 2026-09-25
### Adicionado
- **Reações rápidas (❤️ ✨ 🌸 😊)**: linha de reação no popover da mensagem (seta ▾, clique direito ou long-press) e pílulas na bolha com contagem — clique alterna a sua reação, e o popover não fecha ao reagir (permite várias). Persistidas localmente por usuário (`note.reactions`); sincronização entre dispositivos chega junto com a coluna remota
- **Bolhas mais orgânicas**: cantos com leve assimetria (rabicho no canto de origem: inferior-direito nas suas, inferior-esquerdo nas recebidas) e **sombra blush** — brilho da própria cor da bolha do tema em vez de cinza, com fallback automático para browsers sem `color-mix`

## [1.7.0] — 2026-09-25
### Adicionado
- **Temas novos: Sakura** (rosa cerejeira suave) **e Napolitano** (sorvete: morango + chocolate + baunilha) — com logo e favicon próprios que acompanham o tema. *(na 1.7.0 o segundo tema era o Bubblegum, muito parecido com o Sakura — trocado na 1.7.3)*
- **4 padrões de fundo novos**: Sakura (flores de cerejeira), Borboletas, Morangos e Arco-íris — glifos desenhados no gerador, com cor acompanhando cada tema e previews na grade de configurações
- **Confete cozy ao concluir checklist**: marcar o último item de uma lista solta estrelinhas e pétalas na bolha, com som suave (sparkle). Respeita prefers-reduced-motion
- **Frases fofas variadas no estado vazio** de conversas novas ("Página em branco, ideias à solta ✨", "Respire, anote, floresça 🌸"…) — uma diferente a cada conversa criada
- **Toasts com voz ao criar conversa/caderno** ("Caderninho novo criado 🌷", "Prontinho! Aí é com você ✨")
- **Lembretes falando em primeira pessoa**: "Psst! Você me pediu para lembrar você: …" (notificação e toast)

### Melhorado
- Sons: nova ação `playName` permite tocar um som específico da lib respeitando as preferências do usuário (enabled/volume)

## [1.6.1] — 2026-09-25
### Melhorado
- **Shift+Enter continua bullet e lista numerada** (além da checklist): no composer, quebra no caret e o texto seguinte migra para o novo item; na edição de mensagem enviada, insere `- ` ou o próximo número (`2.`, `3.`…) automaticamente. Fora de lista, quebra de linha simples
- **Enter em item vazio de lista numerada agora sai da lista** — antes alternava para bullet (bug de comando errado)
- **Saída de item vazio reescrita com manipulação direta de DOM** (determinística, sem depender de execCommand/foco da janela)
- **Corrigida corrupção ao salvar edição**: a hora da bolha podia entrar no texto da mensagem quando a serialização incluía o meta re-anexado; agora serializa um clone limpo
- **Detecção de linha na edição respeita `<br>`**: continuações seguidas de lista não acumulam mais prefixos na mesma linha

## [1.6.0] — 2026-09-21
### Melhorado
- **Rodapé da bolha sem sobreposição**: padding-bottom das mensagens aumentado — a última linha do texto não encosta mais no horário (que é posicionado no canto inferior da bolha); densidades compacta e média acompanham
- **Popover da mensagem 100% dentro da tela**: posição calculada com a medição real do popover (não mais estimada) e clamps nos dois eixos — abre para cima quando não cabe embaixo e encosta no chão da janela quando necessário
- **Shift+Enter em checklist cria a próxima checkbox** (no composer E na edição de mensagem enviada): novo item entra com checkbox desmarcada e o texto após o caret migra para ele; item vazio continua saindo da lista. A edição inline agora serializa via markdown, preservando checklists, quebras de linha e negrito que antes se perdiam ao salvar
- **Flick de layout no scroll infinito eliminado (v3, definitivo)**: espaço do indicador de carregamento é RESERVADO no fluxo (slot #load-slot no HTML, sempre presente com altura fixa de 30px, no topo do chat, acima das mensagens) — mostrar/esconder o indicador apenas liga/desliga a opacidade dentro do slot. Layout idêntico nos dois estados (scrollHeight/scrollTop constantes medidos, shift das bolhas = 0), as mensagens nunca alcançam nem ficam sob o indicador
### Melhorado
- **Centro de notificações redesenhado**: cada item ganhou um tile de ícone por tipo (relógio = lembrete, pin = fixada, balão = mensagem) com cor do tema; hierarquia clara título · hora relativa · corpo em até 2 linhas · nome da conversa; pílula de contador de não-lidas no cabeçalho (além do badge da nav); dot de não-lida virou badge discreto no canto; estado vazio com sino em SVG (sem emoji); clicar numa notificação agora a marca como lida — antes o badge só baixava com "Marcar lidas". Fix: a regra base `.rem-item` (declarada depois no CSS) vencia o grid do item e empilhava o ícone sobre o texto — agora `.rem-list .notif-item` garante o layout correto. Segundo conflito na mesma família: `.popover button` (genérica, declarada depois) esticava os botões "Ativar" e "Marcar lidas" com `width: 100%` — rescalda `.rem-popover` devolve o tamanho de pílula
### Corrigido
- **Botão Favoritar quebrado em duas linhas** no menu de contexto da conversa: o código que exibia/ocultava o par Favoritar/Remover dos favoritos aplicava `display: block` inline, sobrescrevendo o `display: flex` do CSS — o ícone e o texto caíam em linhas separadas. Agora o estilo inline é apenas removido ao exibir, devolvendo o controle ao CSS
- **Flick da lista lateral ao criar conversa/caderno**: o renderTree reconstruía a lista inteira e re-animava TODOS os nós (mesma família do bug da animação dupla das bolhas). Agora a árvore só reconstrói quando algo visível realmente mudou (fingerprint), e a animação de entrada toca apenas no nó recém-criado — ecos do realtime e renders redundantes não piscam mais a lista
- **Animação dupla no envio**: a bolha nova recebia duas classes de animação ao mesmo tempo (`is-new` + `just-sent`) — a segunda trocava a animação no mesmo frame e a entrada reiniciava (o piscar 2× em todo envio). Agora cada bolha tem UMA animação: pop spring no envio próprio, entrada suave só em mensagem remota
- **Rede de segurança de DOM**: qualquer caminho de render agora garante no máximo 1 bolha por nota (`dedupeBubblesDom`), e o envio registra a nota no conjunto de renderização (o eco do realtime não criava esse registro)
- **Guardas reconhecem texto com zero-width spaces**: replay de extensão/serialização reinjeta caracteres invisíveis (\u200B etc.) — gêmeas longas com esses caracteres escapavam da comparação de texto; agora são removidos antes de comparar
- **Causa da "animação repetindo" encontrada**: o evento de tint de chegada (`note:remote`) disparava também para o eco da sua própria nota — cada envio piscava azul ~300ms depois, parecendo a animação de envio 2-3×. Agora o tint só ocorre para notas de OUTRO usuário (filtro por user_id + guarda extra no handler)
- **Guard estrutural anti-double-fire**: nota "nova" (clientId diferente) com texto longo idêntico (≥200 chars) da mesma pessoa em ≤2,5s é absorvida pela existente em vez de inserida — e a gêmea é apagada do servidor. Mensagens curtas repetidas de propósito continuam passando normalmente
- **Re-render ao criar nota corrigido**: o snapshot que chega após reconexões só re-renderiza a conversa aberta se algo visível mudou (fingerprint antes/depois do merge) — elimina o flash da árvore e das mensagens ao criar nota/enviar logo após abrir o app
- **Atualizações nunca eram oferecidas**: o chip comparava CHANGELOG × versão do app — com as duas sincronizadas, o app dizia "última versão" mesmo com um Service Worker novo em waiting. Agora o update é oferecido **sempre que houver SW esperando**, independente das versões, e a versão do app volta a subir a cada release (1.5.3 → 1.6.0)
- Todas as correções de duplicação de mensagens abaixo (das rodadas de 1.5.3) agora chegam de verdade ao navegador — antes ficavam presas porque nenhum update era oferecido

## [1.5.3] — 2026-09-21
### Adicionado
- **Centro de notificações**: o sino agora abre um feed persistente com as notificações não-lidas (ponto azul), botão "Marcar lidas", linha de permissão do sistema e lembretes pendentes; lembretes disparados alimentam o feed automaticamente. Ícone trocado para sino com traço fino estilo Hugeicons
- **UI do centro de notificações refinada**: itens agrupados por "Hoje / Anteriores", hora relativa (agora · 12min · 17:35 · 20/09), corpo da mensagem em segunda linha, destaque suave nas não-lidas e empty state amigável ("Tudo tranquilo por aqui")
- **Indicador de destino no Drag & drop**: chip flutuante que segue o cursor ("Mover para…", "Antes de…", "Depois de…"), linha de inserção azul entre as notas e realce tracejado no caderno alvo
### Corrigido
- **Menu da conta logada não abria**: um bloco de CSS truncado descartava 376 regras do stylesheet (o popover perdia o `position: fixed` e todos os estilos posteriores) — CSS restaurado
- **Borda interna quadrada ao focar a busca**: era a decoração nativa do `input[type=search]` do Chrome/Edge — removida via `-webkit-appearance: none`
- **"Atualizar app" não aplicava a nova versão**: o clique recarregava a página sem esperar o Service Worker novo instalar (e o HTML podia vir do cache HTTP antigo). Agora o botão força o download, espera a instalação terminar e só então ativa+recarrega; `APP_VERSION` também ficou sincronizada com o CHANGELOG (antes estava travada em 1.4.2, o que fazia o chip apontar "atualização disponível" para sempre) — novo teste impede a dessincronização
- **Mensagens grandes duplicadas**: defesas em profundidade contra duplicação de notas — eco do realtime de notas recém-criadas neste dispositivo é ignorado (echo guard com janela de 15s), o envio passa a levar a nota canônica do Store com `sortOrder` correto (antes ia sem ordenação e o eco sobrescrevia), e o Store auto-cura dados antigos removendo notas duplicadas por `clientId` na carga
- **Mensagens grandes duplicadas — parte 2 (cura de double-send)**: notas gêmeas (texto idêntico + mesmo autor + timestamps quase iguais) criadas por builds antigos com `client_id` diferentes são detectadas no snapshot, no realtime, no scroll infinito, **no carregamento do app e antes de cada render** — a repetida não renderiza e é **apagada do servidor automaticamente**. Era o caso que sobrevivia: a mesma mensagem enviada 2× pelo build antigo vira duas linhas legítimas no banco/localStorage, invisíveis para qualquer dedup por `clientId`
- **Eco do realtime corrompia a nota própria**: o merge copiava `undefined` por cima de campos existentes (apagava flag `local`) e trocava o `userId` do email para UUID — a mensagem enviada voltava como "remota" (lado errado da conversa, guardas cegas). Merge agora preserva campos ausentes e "minha nota" reconhece também o UUID do auth
- **Envio duplicado na hora do Enter**: `sendNote` agora tem trava anti-disparo múltiplo — o mesmo texto na mesma conversa em janela de 2s é descartado (Enter + clique, re-binding, webviews que repetem o keydown). O botão de enviar também não fica mais habilitado com o editor vazio
- **Diagnóstico de build**: o console agora imprime a versão do build ao carregar (`SaveChat build vN`) e `window.NoteThread.debugLog()` expõe os últimos eventos de sync/envio para rastrear qualquer duplicação restante
- **Compatibilidade com Grammarly**: o compositor é marcado com `data-gramm="false"` etc. — a extensão replaya texto e eventos de teclado em campos `contenteditable` e era candidata forte ao disparo múltiplo do envio (o console do usuário mostrava o Grammarly injetado)

## [1.5.2] — 2026-09-21
### Corrigido
- **Drag & drop de conversas para cadernos** (bug crítico): um `now()` órfão no Store quebrava a movimentação — a conversa mudava de lugar na memória, mas nada era salvo nem re-renderizado. O import faltante foi restaurado
### Melhorado
- Painel do explorador 20px mais largo (300→320px) e logo do brand ampliada (36→40px) para acompanhar o nome do app; tagline "Suas ideias, organizadas" garantida em linha única em qualquer fonte

## [1.5.1] — 2026-09-21
### Corrigido
- Composer volta ao tamanho mínimo após enviar mensagem longa (overflow interno >60vh travava a altura)
- A área de mensagens agora rola "até" o composer: padding inferior dinâmico acompanha a altura real do campo flutuante — a última mensagem nunca fica escondida atrás dele
- Mensagem recém-enviada sempre rola para posição totalmente visível, acima do composer
- Botões de formatação (checklist, listas, código) funcionam mesmo com o foco fora do editor

## [1.5.0] — 2026-09-21
### Adicionado
- Editor de mensagens WYSIWYG: os botões de negrito/itálico agora aplicam o efeito direto no texto enquanto você digita — sem asteriscos na tela. O negrito/itálico "modo contínuo" formata as próximas palavras até ser desligado (o botão fica destacado e acompanha o cursor: Ctrl/⌘+B, Ctrl/⌘+I)
- Listas e checklist agora aparecem formatadas no próprio editor (bullets, numeradas e caixinhas clicáveis) e continuam sendo salvas como texto simples compatível
- Anexar imagem: botão send/mic volta ao modo microfone corretamente após enviar

## [1.4.2] — 2026-09-18
### Corrigido
- Menus de contexto: glifos e textos perfeitamente alinhados em coluna (caderno e notas); "Excluir caderno" agora usa o mesmo ícone de lixeira do menu das notas
- Login com Google em popup: novo fluxo com página dedicada de retorno (oauth-callback.html) — o popup apenas autoriza, troca o código de segurança e se fecha; é a janela original (onde você clicou em "Entrar com Google") que entra no app. O app nunca mais abre dentro do popup
- O Google agora SEMPRE mostra a escolha de conta (prompt=select_account) em vez de autorizar silenciosamente a sessão já aberta no navegador
- Se o navegador bloquear o fechamento do popup, ele mostra "Login concluído! Pode fechar esta janela" em vez de renderizar o app
- Celular/tablet: login com Google por REDIRECT na mesma aba (sem popup — UX correta no mobile e em PWA standalone), com retorno pela mesma página dedicada de callback
- Servidor de desenvolvimento na porta 3000 (bate com as Redirect URLs http://localhost:3000 já cadastradas no Supabase)
- Árvore: cadernos (pastas) agora têm aba lateral escura no tile (estilo fichário), diferenciando-os visualmente das conversas — herda a cor da paleta
- Árvore: conversa criada pelo estado vazio do caderno ("Pasta vazia — clique...") agora nasce DENTRO do caderno, não na raiz
- Árvore: pílula fantasma vazia (a "linha branca") não aparece mais à direita do nome de cadernos sem conversas
- Menu de contexto do caderno (clique direito / toque longo): nova ação "＋ Nova conversa" para criar direto naquele caderno
- Modal de nova conversa: seletor "Criar em" com todos os cadernos + raiz — pré-escolhido quando vem do caderno, editável a qualquer momento
- Popover do perfil: reposicionado com a altura real e movido para fora da sidebar — nunca mais sobrepõe o nome/avatar do login (em telas estreitas ele herdava o sistema de coordenadas da sidebar, com transform, e ia parar fora da tela)
- Empty state da conversa: ícone quebrado (desenho custom torto) trocado por ícone de nota estilo Hugeicons (stroke 1.5, herda a cor do tema); botão "Nova conversa" duplicado removido
- Botões NOVA CONVERSA / NOVO CADERNO agora seguem a fonte escolhida nas configurações (botões não herdam font-family por padrão — ficavam na fonte do sistema, "dura"); glifos centralizados verticalmente
- Mecanismo de atualização à prova de cache stale: o Service Worker nunca é servido do próprio cache, o precache baixa assets sempre da rede (nunca herda versão velha do SW anterior) e todos os assets são revalidados com o servidor — corrige o caso de o aviso "nova versão" aparecer mas o botão Atualizar não resolver

### Melhorado
- Página de login: campo de senha com botão de revelar/ocultar DENTRO do input, foco sempre com cantos arredondados e mensagens de erro só quando a tentativa de login é real

## [1.4.1] — 2026-09-02
### Adicionado
- Botão "Atualizar app" no menu do perfil: verificação automática na abertura (compara com o CHANGELOG servido), indicador de status (atualizado ✓ / nova versão disponível / offline) e instalação da nova versão no clique
- Ponto âmbar no avatar quando há versão nova disponível
- Atualização controlada: o Service Worker agora espera o clique (SKIP_WAITING) em vez de assumir a nova versão sozinho
- Versão única centralizada em `window.APP_VERSION` (Sobre, Sentry e verificação usam a mesma fonte)

### Melhorado
- Navegação e CHANGELOG agora são network-first no Service Worker — a versão nova chega sem duplo reload

## [1.4.0] — 2026-09-01
### Adicionado
- Rebrand final para SaveChat: logo própria em toda a UI, favicon com badge de lembretes, ícones PWA dedicados (any + maskable)
- Geração de assets de loja: screenshots 824×1830 no manifest, feature graphic 1024×500, textos da Play em docs/STORE_LISTING.md
- Movido para public/: este changelog agora é servido pelo site — o toast "Nova versão" lê o que mudou de verdade (antes 404 em prod)
- Terminologia oficial na UI (docs/GLOSSARIO.md): Conversa, Mensagem, Caderno
- Menu do título da conversa com backlinks "Mencionado em"
- Motion fino: transform-origin dinâmico nos popovers, crossfade na troca de tema (View Transitions), lift no drag & drop da árvore
- Emojis com carregamento sob demanda; pipeline de build minificado (dist/) para preview de prod
- Hardening do banco: EXECUTE público revogado no event trigger de auto-RLS (advisors de segurança do Supabase)

### Corrigido
- E-mail de contato legal (privacidade/termos) apontava para domínio da marca antiga
- Versão sincronizada: package.json, tela Sobre, Sentry release e tag git

## [1.3.0] — 2026-08-24
### Adicionado
- Rebrand para ChatSolo: logo própria (login, explorer, favicon, manifest PWA)
- Import de backup JSON (merge por id, sem duplicar) — complementa o export existente
- Menu dropdown no nome da nota: backlinks "Mencionado em" + opção Convidar (placeholder)
- Preview de nota linkada em card fixo (estilo card pinado), sempre visível independente do scroll
- Menção com aparência de chip-link no campo de input (camada espelho)

### Corrigido
- Settings popover cortado/travado ao alternar notas (reset de maxHeight/overflow a cada abertura)
- Fonte branca nos temas dark/midnight (nome do usuário, tela de login)
- Bolhas dos temas claros com fundo saturado + texto branco (--on-bubble; contraste 3.2–4.3:1)
- Seta ▾ da mensagem movida para o canto superior direito
- Checkbox de checklist só alterna ao clicar no próprio checkbox
- Foco do composer com raio arredondado coerente (24px)
- Scrollbar customizada no fluxo de mensagens

### Acessibilidade
- Touch targets ≥44px via hit-area ::after em 6 controles pequenos
- Focus trap no modal + Esc fecha + foco devolvido ao gatilho

## [1.2.0] — 2026-08-21
### Adicionado
- Busca com filtros `in:`, `#tag`, `depois:`, `antes:` + chips
- Backlink reverso "Mencionado em" para menções `@`
- Paginação real `.range()` no Supabase (thread com 5k notas abre rápido)
- "What's new" no toast de update (mostra 2 itens do changelog)
- Imagens no Supabase Storage (bucket `note-images`, 5MB, fallback base64)
- Checklists clicáveis com persistência + ocultar concluídas (fade)

### Corrigido
- Singleton Supabase (Multiple GoTrueClient), status laranja preso, modal exclusão nota

## [1.1.0] — 2026-08-21
### Adicionado
- Menções `@` com autocomplete + lembretes com Notification API + badge ⏰
- Persistência de login (lembrar-me), modal exclusão nota, área arrow, checkboxes
- Pull-to-refresh com indicador visual

## [1.0.0] — 2026-08-21
### Adicionado
- Checklist único `docs/ROADMAP_ESTAVEL.md` (Fases 0–4)
- Reorganização `README.md` + `docs/PROGRESSO.md` + `docs/MOBILE_TASKS.md`
- Fix mobile: popovers responsivos, touch 44px, emoji grid 4 colunas, safe-area
- PWA: `meta theme-color` dinâmico, `viewport-fit=cover`
- Server: headers `CSP`/`Cache-Control`, rate-limit, sanitização
- Lightbox pinch-to-zoom + CI, `.env.example`, `privacy.html`/`terms.html`
