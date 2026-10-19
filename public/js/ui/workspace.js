// Workspace: navegacao entre as paginas do seletor lateral
// (Cadernos | IA | Diária) e o atalho de swipe. O resto das
// páginas vive em workspace-ai.js e workspace-daily.js.

import { Store } from '../store.js';
import { ICON, wrapSvg } from '../icons.js';
import { esc, haptic, now } from '../utils.js';
import { mascotFromStore } from '../mascot.js';
const DEFAULT_MODEL = 'gemini-2.5-flash';
// TABS: as páginas do workspace. 'reminders' não tem mais aba própria
// (v1.12.0) — a lista é a mesma das Pendências e o header troca entre
// elas, então a entrada continua existindo só para o toggle do explorer.
const TABS = ['conversations', 'ai', 'reminders', 'daily'];
const TAB_LABEL = { conversations: 'Cadernos', ai: 'IA', reminders: 'Lembretes', daily: 'Diária' };

// As três páginas do seletor, na ordem da tabbar: é este conjunto — e só
// este — que o arrasto percorre.
//
// Antes ele andava por TABS, que inclui 'ai' e 'reminders'. Duas abas que
// não têm botão no `.page-switcher` nem na tabbar: o arrasto levava para
// telas que o usuário não vê listadas em lugar nenhum, e o Tarefas — que
// tem botão — ficava fora do alcance do gesto.
//
// Os valores são os de `data-page`, os mesmos de `.page-switch` e
// `.tabbar-btn`, então os três caminhos falam a mesma língua.
const SWIPE_PAGES = ['notes', 'tasks', 'daily'];
const SWIPE_LABEL = { notes: 'Cadernos', tasks: 'Tarefas', daily: 'Diária' };

export const WorkspaceMethods = {
  bindWorkspace() {
    // Navegação de páginas: seletor da sidebar do explorador (Cadernos | Tarefas | Diária)
    document.querySelectorAll('.page-switch').forEach((button) => {
      button.addEventListener('click', () => this.openWorkspacePage(button.dataset.page));
    });
    // Tabbar inferior (mobile): MESMA ação dos `.page-switch`, sem lógica
    // duplicada. Ela só é um atalho de 1 toque — o estado ativo é
    // sincronizado a partir do `.page-switch` da sidebar (que é a fonte
    // única), então não há como as duas divergirem.
    document.querySelectorAll('.tabbar-btn').forEach((button) => {
      button.addEventListener('click', () => this.openWorkspacePage(button.dataset.page));
    });
    // teclado no seletor (role=tab): setas movem, Home/End atalhos
    const tablist = document.querySelector('.page-switcher');
    if (tablist) tablist.addEventListener('keydown', (e) => {
      // Um role=tablist navega entre as PRÓPRIAS abas. As setas percorriam
      // TABS (conversations | ai | reminders | daily), mas o seletor só tem
      // três botões — Cadernos, Tarefas e Diária. 'ai' e 'reminders' não têm
      // botão, então a seta caía numa página sem aba acesa e o focus() apontava
      // para um seletor inexistente. Usa o mesmo conjunto do arrasto.
      const idx = SWIPE_PAGES.indexOf(this._currentSwipePage());
      let next = null;
      if (e.key === 'ArrowRight') next = SWIPE_PAGES[(idx + 1) % SWIPE_PAGES.length];
      else if (e.key === 'ArrowLeft') next = SWIPE_PAGES[(idx - 1 + SWIPE_PAGES.length) % SWIPE_PAGES.length];
      else if (e.key === 'Home') next = SWIPE_PAGES[0];
      else if (e.key === 'End') next = SWIPE_PAGES[SWIPE_PAGES.length - 1];
      if (next) {
        e.preventDefault();
        this.openWorkspacePage(next);
        document.querySelector(`.page-switch[data-page="${next}"]`)?.focus();
      }
    });
    // ----- IA -----
    document.getElementById('ai-key')?.addEventListener('change', (event) => {
      Store.data.ui = Store.data.ui || {};
      Store.data.ui.aiKey = event.target.value.trim(); Store.save();
    });
    document.getElementById('ai-model')?.addEventListener('change', (event) => {
      Store.data.ui = Store.data.ui || {};
      Store.data.ui.aiModel = event.target.value.trim() || DEFAULT_MODEL; Store.save();
    });
    const aiSend = document.getElementById('ai-send');
    aiSend?.addEventListener('click', () => {
      // vazio => grava áudio; com texto => envia. Mesma regra do composer.
      if (this._aiAudioMode) { this._toggleAiRecording(); return; }
      this.sendAiMessage();
    });
    const aiPrompt = document.getElementById('ai-prompt');
    if (aiPrompt) {
      aiPrompt.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendAiMessage(); }
      });
      // mesmo comportamento do composer da conversa: cresce até um teto e o
      // botão da direita troca de microfone para enviar conforme o texto.
      aiPrompt.addEventListener('input', () => { this._growAiPrompt(aiPrompt); this._updateAiSendAudioState(aiPrompt, aiSend); });
    }
    this._updateAiSendAudioState(aiPrompt, aiSend);
    // ----- Diária (rotina que se renova) -----
    // Criação/edição passa pelo modal (texto + horário + switch de notificação);
    // o antigo input rápido da página foi removido.
    document.getElementById('daily-new-task')?.addEventListener('click', () => this.openDailyTaskModal());
    // delegação: concluir / editar / excluir itens da rotina
    const dailyList = document.getElementById('daily-list');
    if (dailyList) dailyList.addEventListener('click', (e) => {
      const li = e.target.closest('.daily-item');
      if (!li) return;
      if (e.target.closest('.daily-del')) this.deleteDailyItem(li.dataset.id);
      else if (e.target.closest('.daily-edit')) this.openDailyTaskModal(li.dataset.id);
      else if (e.target.closest('.daily-check')) this.toggleDailyItem(li.dataset.id);
    });
    // checagem de avisos horários (roda junto com os lembretes do app)
    this.checkDailyNotifications();
    this._dailyTimer = setInterval(() => this.checkDailyNotifications(), 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.checkDailyNotifications(); this.renderDailyPage(); } });
    // tooltip "o que a IA pode fazer": clique fixa/solta, hover é CSS;
    // fecha com clique-fora e Escape
    const aiBtn = document.getElementById('ai-info-btn');
    const aiTip = document.getElementById('ai-info-tip');
    if (aiBtn && aiTip) {
      aiBtn.addEventListener('click', (e) => { e.stopPropagation(); aiTip.classList.toggle('open'); });
      document.addEventListener('click', (e) => {
        if (aiTip.classList.contains('open') && !aiTip.contains(e.target) && !aiBtn.contains(e.target)) aiTip.classList.remove('open');
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') aiTip.classList.remove('open'); });
    }
    // swipe entre páginas + carrossel temporário durante o gesto
    this._bindWorkspaceSwipe();
    this._workspaceTab = 'conversations';
  },

  showWorkspaceTab(name, { updateUrl = true } = {}) {
    const tab = TABS.includes(name) ? name : 'conversations';
    // o item "Conversa com a IA" da árvore acende só enquanto a página da
    // IA está aberta — em qualquer outra aba ele apaga
    this._aiTabOpen = tab === 'ai';
    const app = document.getElementById('app');
    const pageIds = { ai: 'ai-page', reminders: 'reminders-page', daily: 'daily-page' };
    document.getElementById('search-page')?.classList.add('hidden');
    document.getElementById('tasks-page')?.classList.add('hidden');
    Object.values(pageIds).forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('messages')?.classList.toggle('hidden', tab !== 'conversations');
    document.getElementById('backlinks')?.classList.toggle('hidden', tab !== 'conversations');
    document.getElementById('live-region')?.classList.toggle('hidden', tab !== 'conversations');
    const cui = document.getElementById('chat-active-ui');
    cui?.setAttribute('data-active-tab', tab);
    // páginas IA/Lembretes/Diária são navegação global: o canvas precisa estar
    // clicável mesmo sem conversa aberta; em Conversas, volta ao estado normal.
    // setChatActiveUi também controla o placeholder "nenhuma conversa" (assim
    // as páginas abertas nunca competem com ele em camadas)
    this.setChatActiveUi(tab !== 'conversations' || !!this.activeThread);
    // sincroniza o seletor da sidebar (Cadernos fica ativo também em conversas
    // abertas e na página de Lembretes — é o destino "de volta" ali)
    document.querySelectorAll('.page-switch').forEach((button) => {
      const page = button.dataset.page;
      const active = page === tab || (page === 'notes' && tab === 'conversations');
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    // o estado ativo da tabbar (mobile) é sincronizado em _syncTabbar(),
    // chamado por syncExplorerChrome() abaixo — não duplicar aqui.
    if (tab !== 'conversations') document.getElementById(pageIds[tab])?.classList.remove('hidden');
    // cabeçalho e tooltip informativa na página da IA
    const aiInfoBtn = document.getElementById('ai-info-btn');
    const aiInfoTip = document.getElementById('ai-info-tip');
    if (aiInfoBtn) aiInfoBtn.classList.toggle('hidden', tab !== 'ai');
    if (aiInfoTip && tab !== 'ai') aiInfoTip.classList.remove('open');
    // título do cabeçalho global por página (evita "Conversa com a IA" presa na Diária)
    const chatName = document.getElementById('chat-name');
    const threadMenuBtn = document.getElementById('btn-thread-menu');
    const pageIcon = document.getElementById('page-icon');
    const PAGE_ICON = { ai: ICON.sparkle, daily: ICON.calendar, reminders: ICON.clock };
    // título do cabeçalho por página (a IA usa o nome do mascote escolhido)
    const PAGE_TITLE = { ai: mascotFromStore().name, daily: 'Diária', reminders: 'Lembretes' };
    if (chatName) chatName.textContent = PAGE_TITLE[tab] || 'Selecione uma conversa';
    if (threadMenuBtn) threadMenuBtn.classList.toggle('hidden', tab === 'conversations' ? !this.activeThread : true);
    if (pageIcon) {
      const glyph = PAGE_ICON[tab];
      if (glyph) { pageIcon.innerHTML = wrapSvg(glyph, 18); pageIcon.classList.remove('hidden'); }
      else pageIcon.classList.add('hidden');
    }
    if (tab === 'conversations' && this.activeThread) {
      const t = Store.getThread(this.activeThread);
      if (chatName && t) chatName.textContent = t.name;
    }
    if (tab === 'ai') this.prepareAiPage();
    if (tab === 'reminders') this.renderRemindersList();
    if (tab === 'daily') this.renderDailyPage();
    // no mobile as páginas vivem no canvas: desliza para frente
    if (app && window.matchMedia('(max-width: 760px)').matches) app.classList.add('show-chat');
    if (updateUrl) history.replaceState(null, '', location.pathname);
    this._workspaceTab = tab;
    this.syncExplorerChrome(); // botão de Lembretes acende só na aba Lembretes
  },

  // ---------- Fonte única das três páginas ----------
  //
  // `.page-switch` (sidebar), `.tabbar-btn` (mobile) e o arrasto chamam ESTE
  // método. O mapeamento page → ação fica escrito uma vez só, então os três
  // caminhos não podem divergir — o Tarefas em especial é a página que não
  // passa por showWorkspaceTab (ela define `_workspaceTab` direto, porque
  // showWorkspaceTab só conhece TABS, que não tem 'tasks').
  openWorkspacePage(page) {
    if (page === 'notes') {
      this.showWorkspaceTab('conversations');
      // Cadernos no celular é o explorador: garante que a sidebar volte
      // para a frente, mesmo vindo de uma conversa aberta.
      const app = document.getElementById('app');
      if (app && window.matchMedia('(max-width: 760px)').matches) app.classList.remove('show-chat');
    } else if (page === 'tasks') {
      // Tarefas é a visão "Pendências" (tasks.js) — a mesma página que o
      // botão #explorer-tasks abria, agora com aba própria na barra.
      this.showTasksPage();
    } else {
      this.showWorkspaceTab(page);
    }
  },

  // ---------- Portão do arrasto ----------
  //
  // O arrasto entre páginas só faz sentido no explorador. Com uma conversa
  // aberta na tela, o gesto horizontal já tem outro dono: ele abre
  // (esquerda) ou fecha (direita) a conversa.
  //
  // `activeThread` sozinho NÃO serve como teste: ele continua preenchido
  // depois que o usuário volta para o explorador — é o mesmo estado que
  // travava a reabertura da conversa (messages.js openThread). Por isso o
  // teste é se a conversa está DE FATO na tela.
  conversationOnScreen() {
    // fora da aba Conversas nada de conversa está na tela, mesmo com
    // activeThread preenchido: em Tarefas/Diária/IA o arrasto é livre.
    if ((this._workspaceTab || 'conversations') !== 'conversations') return false;
    const msgs = document.getElementById('messages');
    if (msgs && msgs.classList.contains('hidden')) return false;
    if (!window.matchMedia('(max-width: 760px)').matches) return !!this.activeThread;
    const app = document.getElementById('app');
    return !!(this.activeThread && app && app.classList.contains('show-chat'));
  },

  // Qual das três páginas está na tela agora. `_workspaceTab` guarda o
  // identificador interno, que nem sempre é o nome do botão: 'conversations'
  // é o botão "notes", e 'ai'/'reminders' não são botões.
  _currentSwipePage() {
    const tab = this._workspaceTab || 'conversations';
    if (tab === 'tasks' || tab === 'daily') return tab;
    // Cadernos, IA e Lembretes: a página do arrasto é Cadernos. Quem estava
    // na IA/Lembretes e arrasta volta para o explorador, que é o destino
    // natural (e o botão aceso no seletor).
    return 'notes';
  },

  _nextSwipePage(direction) {
    const i = SWIPE_PAGES.indexOf(this._currentSwipePage());
    const n = SWIPE_PAGES[i + direction];
    return n || null;
  },

  // O arrasto entre páginas tem a prioridade sobre o de abrir/fechar
  // conversa. Os dois escutam touchend no document, e o mesmo gesto não pode
  // voltar para o explorador E trocar de página ao mesmo tempo. Vale quando
  // não há conversa na tela — aí o gesto "abrir conversa" (esquerda) não faz
  // sentido, porque o canvas já está visível.
  workspaceSwipeOwns(dx) {
    if (this.conversationOnScreen()) return false;
    return !!this._nextSwipePage(dx < 0 ? 1 : -1);
  },

  // ---------- Swipe como atalho + carrossel temporário (feedback) ----------

  _bindWorkspaceSwipe() {
    const hint = document.getElementById('workspace-swipe-hint');
    let sx = 0, sy = 0, st = 0, armed = false;

    const hiddenHint = () => hint && !hint.classList.contains('hidden');
    const showHint = (dir, progress) => {
      if (!hint) return;
      const next = this._nextSwipePage(dir);
      if (!next) { hint.classList.add('hidden'); return; }
      hint.innerHTML = `${dir > 0 ? esc(SWIPE_LABEL[this._currentSwipePage()]) : ''}<span class="wsh-target">${esc(SWIPE_LABEL[next])}</span>${dir < 0 ? esc(SWIPE_LABEL[this._currentSwipePage()]) : ''}`;
      hint.classList.remove('hidden');
      hint.style.setProperty('--wsh-progress', String(Math.min(1, progress)));
    };

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now();
      // com conversa na tela o gesto é dela: nem arma o carrossel
      armed = !this.conversationOnScreen();
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!armed || e.touches.length !== 1) return;
      if (!hint || sx === 0 && sy === 0) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      // horizontal dominante → mostra o destino (carrossel temporário)
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        const dir = dx > 0 ? -1 : 1; // arrastar ← volta, arrastar → avança
        showHint(dir, Math.abs(dx) / 60);
      } else if (hint) {
        hint.classList.add('hidden');
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!armed) return;
      armed = false;
      const wasVisible = hiddenHint();
      if (hint) hint.classList.add('hidden');
      if (!sx && !sy) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;
      sx = sy = st = 0;
      if (dt > 600 || Math.abs(dy) > 80) return;
      const SWIPE = 60;
      if (Math.abs(dx) < SWIPE) return;
      // arrastar → (dx<0) avança; arrastar ← (dx>0) volta
      this.workspaceSwipe(dx < 0 ? 1 : -1);
      if (wasVisible) haptic('light');
    }, { passive: true });
  },

  workspaceSwipe(direction) {
    const next = this._nextSwipePage(direction);
    if (!next) return false;
    // mesmo caminho dos botões: o arrasto não pode abrir a página de outro
    // jeito (Tarefas não passa por showWorkspaceTab)
    this.openWorkspacePage(next);
    return true;
  },

  // ================= IA — assistente das notas do usuário =================
};
