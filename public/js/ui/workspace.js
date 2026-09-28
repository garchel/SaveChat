import { esc } from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import { Store } from '../store.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MODEL_OPTIONS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const WorkspaceMethods = {
    showWorkspaceTab(name, { updateUrl = true } = {}) {
    const validTabs = ['conversations', 'ai', 'reminders', 'daily'];
    tabs.querySelectorAll('[data-workspace-tab]').forEach((button) => {
      button.addEventListener('click', () => this.showWorkspaceTab(button.dataset.workspaceTab));
    });
    document.getElementById('daily-date')?.addEventListener('change', () => this.renderDailyEntry());
    document.getElementById('daily-editor')?.addEventListener('input', () => this.saveDailyEntry());
    document.getElementById('ai-key')?.addEventListener('change', (event) => {
      Store.data.ui.aiKey = event.target.value.trim(); Store.save();
    });
    document.getElementById('ai-model')?.addEventListener('change', (event) => {
      Store.data.ui.aiModel = event.target.value.trim() || DEFAULT_MODEL; Store.save();
    });
    document.getElementById('ai-send')?.addEventListener('click', () => this.sendAiMessage());
    document.getElementById('ai-prompt')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendAiMessage(); }
    });
    this.showWorkspaceTab('conversations', { updateUrl: false });
  },

  showWorkspaceTab(name, { updateUrl = true } = {}) {
    const validTabs = ['conversations', 'ai', 'reminders', 'daily'];
    const tab = validTabs.includes(name) ? name : 'conversations';
    const app = document.getElementById('app');
    const pageIds = { ai: 'ai-page', reminders: 'reminders-page', daily: 'daily-page' };
    document.getElementById('search-page')?.classList.add('hidden');
    document.getElementById('tasks-page')?.classList.add('hidden');
    Object.values(pageIds).forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('messages')?.classList.toggle('hidden', tab !== 'conversations');
    document.getElementById('backlinks')?.classList.toggle('hidden', tab !== 'conversations');
    document.getElementById('live-region')?.classList.toggle('hidden', tab !== 'conversations');
    document.getElementById('chat-active-ui')?.setAttribute('data-active-tab', tab);
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
    if (app && window.matchMedia('(max-width: 760px)').matches) app.classList.add('show-chat');
    if (updateUrl) history.replaceState(null, '', location.pathname);
    this._workspaceTab = tab;
  },

  workspaceSwipe(direction) {
    const tabs = ['conversations', 'ai', 'reminders', 'daily'];
    const index = tabs.indexOf(this._workspaceTab || 'conversations');
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tabs.length) return false;
    this.showWorkspaceTab(tabs[nextIndex]);
    return true;
  },

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
    list.innerHTML = history.map((item) => `<article class="ai-message ${item.role === 'user' ? 'user' : 'model'}"><div class="ai-message-label">${item.role === 'user' ? 'Você' : 'IA'}</div><div class="ai-message-body">${renderMarkdown(item.text || '')}</div></article>`).join('');
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
    input.disabled = true;
    button.disabled = true;
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
      const answer = (data.candidates || []).flatMap((candidate) => candidate.content?.parts || []).map((part) => part.text || '').join('').trim();
      if (!answer) throw new Error('A IA não retornou uma resposta. Tente novamente.');
      history.push({ role: 'model', text: answer, ts: Date.now() });
      if (history.length > 40) history.splice(0, history.length - 40);
      Store.save();
      this.renderAiMessages();
    } catch (error) {
      history.pop();
      Store.save();
      this.renderAiMessages();
      const message = error.message || 'Falha ao falar com a API Gemini';
      this.toast(message.length > 130 ? `${message.slice(0, 127)}…` : message, { kind: 'error', duration: 5000 });
    } finally {
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  },

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

export { DEFAULT_MODEL, MODEL_OPTIONS };
