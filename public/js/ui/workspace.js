import { esc, haptic } from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import { Store } from '../store.js';

// ---------- Workspace: abas Conversas · IA · Lembretes · Diária ----------
// Design acordado (2026-09-28): faixa compacta de abas abaixo do cabeçalho —
// "conversa aberta" é tela dentro de Conversas (com Voltar), não aba. O swipe
// horizontal continua como atalho e mostra um indicador momentâneo
// (#workspace-swipe-hint) com o destino enquanto o dedo se move (ideia do
// carrossel temporário); ao soltar além do limiar, a aba correspondente ativa.
// IA = chat próprio (chave Gemini do usuário, salva só neste dispositivo).

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TABS = ['conversations', 'ai', 'reminders', 'daily'];
const TAB_LABEL = { conversations: '💬 Conversas', ai: '✦ IA', reminders: '⏰ Lembretes', daily: '📓 Diária' };
const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const WorkspaceMethods = {
  bindWorkspace() {
    document.querySelectorAll('[data-workspace-tab]').forEach((button) => {
      button.addEventListener('click', () => this.showWorkspaceTab(button.dataset.workspaceTab));
    });
    // teclado nas abas (role=tab): setas movem, Home/End atalhos
    const tablist = document.getElementById('workspace-tabs');
    if (tablist) tablist.addEventListener('keydown', (e) => {
      const idx = TABS.indexOf(this._workspaceTab || 'conversations');
      let next = null;
      if (e.key === 'ArrowRight') next = TABS[(idx + 1) % TABS.length];
      else if (e.key === 'ArrowLeft') next = TABS[(idx - 1 + TABS.length) % TABS.length];
      else if (e.key === 'Home') next = TABS[0];
      else if (e.key === 'End') next = TABS[TABS.length - 1];
      if (next) { e.preventDefault(); this.showWorkspaceTab(next); document.querySelector(`[data-workspace-tab="${next}"]`)?.focus(); }
    });
    document.getElementById('daily-date')?.addEventListener('change', () => this.renderDailyEntry());
    document.getElementById('daily-editor')?.addEventListener('input', () => this.saveDailyEntry());
    document.getElementById('ai-key')?.addEventListener('change', (event) => {
      Store.data.ui = Store.data.ui || {};
      Store.data.ui.aiKey = event.target.value.trim(); Store.save();
    });
    document.getElementById('ai-model')?.addEventListener('change', (event) => {
      Store.data.ui = Store.data.ui || {};
      Store.data.ui.aiModel = event.target.value.trim() || DEFAULT_MODEL; Store.save();
    });
    document.getElementById('ai-send')?.addEventListener('click', () => this.sendAiMessage());
    document.getElementById('ai-prompt')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendAiMessage(); }
    });
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
    // abas IA/Lembretes/Diária são navegação global: o canvas precisa estar
    // clicável mesmo sem conversa aberta (o .visible é o gate do container);
    // em Conversas, volta ao estado normal (visível só com thread aberta)
    cui?.classList.toggle('visible', tab !== 'conversations' || !!this.activeThread);
    document.querySelectorAll('[data-workspace-tab]').forEach((button) => {
      const active = button.dataset.workspaceTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    if (tab !== 'conversations') document.getElementById(pageIds[tab])?.classList.remove('hidden');
    if (tab === 'ai') this.prepareAiPage();
    if (tab === 'reminders') this.renderRemindersList();
    if (tab === 'daily') this.renderDailyEntry();
    // no mobile as páginas vivem no canvas: desliza para frente
    if (app && window.matchMedia('(max-width: 760px)').matches) app.classList.add('show-chat');
    if (updateUrl) history.replaceState(null, '', location.pathname);
    this._workspaceTab = tab;
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
      if (!armed || !hiddenHint() === false) { /* hint visível: atualiza alvo */ }
      if (!armed || e.touches.length !== 1) return;
      if (!hint || sx === 0 && sy === 0) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      // horizontal dominante + já passou de um terço do limiar → mostra o destino
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

  // ---------- IA (Gemini) ----------
  prepareAiPage() {
    const key = document.getElementById('ai-key');
    const model = document.getElementById('ai-model');
    if (key) key.value = (Store.data.ui && Store.data.ui.aiKey) || '';
    if (model) model.value = (Store.data.ui && Store.data.ui.aiModel) || DEFAULT_MODEL;
    this.renderAiMessages();
  },

  renderAiMessages() {
    const list = document.getElementById('ai-messages');
    if (!list) return;
    const history = (Store.data.ui && Store.data.ui.aiChat) || [];
    if (!history.length) {
      list.innerHTML = '<div class="workspace-empty"><span aria-hidden="true">✦</span><strong>Seu espaço de ideias com IA</strong><span>Peça ajuda para planejar, escrever, resumir ou organizar o que está pensando.</span></div>';
      return;
    }
    list.innerHTML = history.map((item) =>
      `<article class="ai-message ${item.role === 'user' ? 'user' : 'model'}"><div class="ai-message-label">${item.role === 'user' ? 'Você' : 'IA'}</div><div class="ai-message-body">${renderMarkdown(item.text || '')}</div></article>`
    ).join('');
    list.scrollTop = list.scrollHeight;
  },

  async sendAiMessage() {
    const input = document.getElementById('ai-prompt');
    const button = document.getElementById('ai-send');
    const keyField = document.getElementById('ai-key');
    const modelField = document.getElementById('ai-model');
    const prompt = input && input.value.trim();
    const key = keyField && keyField.value.trim();
    if (!prompt) return;
    if (!key) { this.toast('Adicione sua chave da API Gemini para começar', { kind: 'info' }); keyField?.focus(); return; }
    Store.data.ui = Store.data.ui || {};
    Store.data.ui.aiKey = key;
    Store.data.ui.aiModel = (modelField && modelField.value.trim()) || DEFAULT_MODEL;
    const history = Store.data.ui.aiChat || (Store.data.ui.aiChat = []);
    history.push({ role: 'user', text: prompt, ts: Date.now() });
    Store.save();
    input.value = '';
    input.disabled = true; button.disabled = true;
    this.renderAiMessages();
    const prior = history.slice(-21, -1).map(({ role, text }) => ({
      role: role === 'model' ? 'model' : 'user', parts: [{ text: String(text).slice(0, 12000) }],
    }));
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(Store.data.ui.aiModel)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Você é o assistente de IA do SaveChat. Responda em português brasileiro, com clareza e simpatia. Não afirme ter acesso às conversas ou notas do usuário: só use o que ele incluir na mensagem.' }] },
          contents: [...prior, { role: 'user', parts: [{ text: prompt.slice(0, 12000) }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : `Erro da API (${response.status})`);
      const answer = (data.candidates || []).flatMap((candidate) => (candidate.content && candidate.content.parts) || []).map((part) => part.text || '').join('').trim();
      if (!answer) throw new Error('A IA não retornou uma resposta. Tente novamente.');
      history.push({ role: 'model', text: answer, ts: Date.now() });
      if (history.length > 40) history.splice(0, history.length - 40);
      Store.save();
      this.renderAiMessages();
      haptic('success');
    } catch (error) {
      history.pop();
      Store.save();
      this.renderAiMessages();
      const message = error.message || 'Falha ao falar com a API Gemini';
      this.toast(message.length > 130 ? `${message.slice(0, 127)}…` : message, { kind: 'error', duration: 5000 });
    } finally {
      input.disabled = false; button.disabled = false;
      input.focus();
    }
  },

  // ---------- Diária (privada, só neste dispositivo) ----------
  renderDailyEntry() {
    const date = document.getElementById('daily-date');
    const editor = document.getElementById('daily-editor');
    const status = document.getElementById('daily-status');
    if (!date || !editor) return;
    if (!date.value) date.value = todayKey();
    const entries = (Store.data.ui && Store.data.ui.dailyEntries) || {};
    editor.value = entries[date.value] || '';
    if (status) status.textContent = editor.value ? 'Anotação salva neste dispositivo' : 'Privada e salva neste dispositivo';
  },

  saveDailyEntry() {
    const date = document.getElementById('daily-date');
    const editor = document.getElementById('daily-editor');
    const status = document.getElementById('daily-status');
    if (!date || !editor) return;
    Store.data.ui = Store.data.ui || {};
    Store.data.ui.dailyEntries = Store.data.ui.dailyEntries || {};
    if (editor.value.trim()) Store.data.ui.dailyEntries[date.value] = editor.value;
    else delete Store.data.ui.dailyEntries[date.value];
    Store.save();
    if (status) status.textContent = 'Salvo neste dispositivo';
  },
};

export { DEFAULT_MODEL };
