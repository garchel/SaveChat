// Workspace: navegacao entre as paginas do seletor lateral
// (Cadernos | IA | Diária) e o atalho de swipe. O resto das
// páginas vive em workspace-ai.js e workspace-daily.js.

import { Store } from '../store.js';
import { ICON, wrapSvg } from '../icons.js';
import { esc, haptic, now } from '../utils.js';
const DEFAULT_MODEL = 'gemini-2.5-flash';
// TABS: as páginas do workspace. 'reminders' não tem mais aba própria
// (v1.12.0) — a lista é a mesma das Pendências e o header troca entre
// elas, então a entrada continua existindo só para o toggle do explorer.
const TABS = ['conversations', 'ai', 'reminders', 'daily'];
const TAB_LABEL = { conversations: 'Cadernos', ai: 'IA', reminders: 'Lembretes', daily: 'Diária' };

export const WorkspaceMethods = {
  bindWorkspace() {
    // Navegação de páginas: seletor da sidebar do explorador (Cadernos | IA | Diária)
    document.querySelectorAll('.page-switch').forEach((button) => {
      button.addEventListener('click', () => {
        const page = button.dataset.page;
        if (page === 'notes') {
          this.showWorkspaceTab('conversations');
          const app = document.getElementById('app');
          if (app && window.matchMedia('(max-width: 760px)').matches) app.classList.remove('show-chat');
        } else {
          this.showWorkspaceTab(page);
        }
      });
    });
    // teclado no seletor (role=tab): setas movem, Home/End atalhos
    const tablist = document.querySelector('.page-switcher');
    if (tablist) tablist.addEventListener('keydown', (e) => {
      const idx = TABS.indexOf(this._workspaceTab || 'conversations');
      let next = null;
      if (e.key === 'ArrowRight') next = TABS[(idx + 1) % TABS.length];
      else if (e.key === 'ArrowLeft') next = TABS[(idx - 1 + TABS.length) % TABS.length];
      else if (e.key === 'Home') next = TABS[0];
      else if (e.key === 'End') next = TABS[TABS.length - 1];
      if (next) { e.preventDefault(); this.showWorkspaceTab(next); document.querySelector(`.page-switch[data-page="${next === 'conversations' ? 'notes' : next}"]`)?.focus(); }
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
    // título do cabeçalho por página (a IA tem rótulo próprio, mais descritivo)
    const PAGE_TITLE = { ai: 'Conversa com a IA', daily: 'Diária', reminders: 'Lembretes' };
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

  // ---------- Swipe como atalho + carrossel temporário (feedback) ----------

  _bindWorkspaceSwipe() {
    const hint = document.getElementById('workspace-swipe-hint');
    let sx = 0, sy = 0, st = 0, armed = false;

    const hiddenHint = () => hint && !hint.classList.contains('hidden');
    const showHint = (dir, progress) => {
      if (!hint) return;
      const idx = TABS.indexOf(this._workspaceTab || 'conversations');
      const next = TABS[idx + dir];
      if (!next) { hint.classList.add('hidden'); return; }
      hint.innerHTML = `${dir > 0 ? esc(TAB_LABEL[TABS[idx]]) : ''}<span class="wsh-target">${esc(TAB_LABEL[next])}</span>${dir < 0 ? esc(TAB_LABEL[TABS[idx]]) : ''}`;
      hint.classList.remove('hidden');
      hint.style.setProperty('--wsh-progress', String(Math.min(1, progress)));
    };

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now();
      armed = true;
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
    const index = TABS.indexOf(this._workspaceTab || 'conversations');
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= TABS.length) return false;
    this.showWorkspaceTab(TABS[nextIndex]);
    return true;
  },

  // ================= IA — assistente das notas do usuário =================
};
