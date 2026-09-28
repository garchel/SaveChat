import { esc, haptic, uid, now } from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';

// ---------- Workspace: páginas IA · Lembretes · Diária ----------
// Navegação pelo seletor da sidebar (Cadernos | IA | Diária); conversa aberta
// é tela dentro de Cadernos. Swipe continua como atalho com o indicador
// momentâneo (#workspace-swipe-hint — o carrossel temporário).
//
// IA (v1.13.0): assistente das NOTAS do usuário — lê as notas recentes das
// conversas como contexto e PODE CRIAR NOTAS via function calling
// (criar_nota). Chat de verdade, com áudio: grava (MediaRecorder) →
// transcreve (Gemini multimodal, mesma chave do usuário) → coloca o texto no
// campo para revisão antes do envio.
//
// Diária (v1.13.0): checklist de ROTINA que se renova todo dia — os itens são
// fixos (o usuário cadastra uma vez) e a marcação de "concluído" vale só para
// o dia (log por data), então toda madrugada a lista recomeça limpa.

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TRANSCRIBE_MODEL = 'gemini-2.5-flash';
const TABS = ['conversations', 'ai', 'reminders', 'daily'];
const TAB_LABEL = { conversations: 'Cadernos', ai: 'IA', reminders: 'Lembretes', daily: 'Diária' };

const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
    document.getElementById('ai-send')?.addEventListener('click', () => this.sendAiMessage());
    const aiPrompt = document.getElementById('ai-prompt');
    if (aiPrompt) {
      aiPrompt.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendAiMessage(); }
      });
      aiPrompt.addEventListener('input', () => this._growAiPrompt(aiPrompt));
    }
    document.getElementById('ai-mic')?.addEventListener('click', () => this._toggleAiRecording());
    // ----- Diária (rotina que se renova) -----
    document.getElementById('daily-add-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('daily-input');
      const text = (input && input.value.trim()) || '';
      if (text) { this.addDailyItem(text); input.value = ''; input.focus(); }
    });
    // delegação: concluir / excluir itens da rotina
    const dailyList = document.getElementById('daily-list');
    if (dailyList) dailyList.addEventListener('click', (e) => {
      const li = e.target.closest('.daily-item');
      if (!li) return;
      if (e.target.closest('.daily-del')) this.deleteDailyItem(li.dataset.id);
      else if (e.target.closest('.daily-check')) this.toggleDailyItem(li.dataset.id);
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
    if (tab === 'ai') this.prepareAiPage();
    if (tab === 'reminders') this.renderRemindersList();
    if (tab === 'daily') this.renderDailyPage();
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
      list.innerHTML = '<div class="workspace-empty"><span aria-hidden="true">✦</span><strong>Peça à IA — ela conhece suas notas</strong><span>Resuma uma conversa, planeje seu dia ou peça: <em>“crie uma nota na conversa Compras com a lista do churrasco”</em>.</span></div>';
      return;
    }
    list.innerHTML = history.map((item) => {
      const chips = (item.actions || []).map((a) => `<div class="ai-action-chip">${esc(a)}</div>`).join('');
      return `<article class="ai-message ${item.role === 'user' ? 'user' : 'model'}"><div class="ai-message-label">${item.role === 'user' ? 'Você' : 'IA'}</div>${chips}<div class="ai-message-body">${renderMarkdown(item.text || '')}</div></article>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  },

  // contexto: notas recentes das conversas (o que a IA "enxerga")
  _buildAiContext() {
    const threads = Store.threadList()
      .slice()
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, 15);
    const lines = [];
    threads.forEach((t) => {
      const notes = (Store.notesFor(t.id) || []).slice(-10);
      if (!notes.length) return;
      lines.push(`### Conversa: ${t.name}`);
      notes.forEach((n) => lines.push(`- ${String(n.text || '').replace(/\s+/g, ' ').slice(0, 300)}`));
    });
    return lines.join('\n').slice(0, 24000);
  },

  _aiSystemInstruction() {
    const context = this._buildAiContext();
    let text = 'Você é o assistente de IA do SaveChat, um app de notas em conversas. Responda em português brasileiro, com clareza e simpatia, usando markdown quando ajudar. ' +
      'Você RECEBE como contexto as notas recentes das conversas do usuário — use esse conteúdo para responder resumos, planejamentos e perguntas sobre as notas. Se algo não estiver nas notas, diga que não encontrou. ' +
      'Você PODE CRIAR NOTAS: sempre que o usuário pedir para registrar/anotar/criar algo numa conversa, chame a função criar_nota com o nome EXATO da conversa e o conteúdo em markdown. Depois de criar, confirme em uma frase curta.';
    if (context) text += `\n\n=== Notas recentes do usuário (contexto — não repita no chat) ===\n${context}`;
    return { parts: [{ text }] };
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
    this._growAiPrompt(input);
    input.disabled = true; button.disabled = true;
    this.renderAiMessages();
    const prior = history.slice(-21, -1).map(({ role, text }) => ({
      role: role === 'model' ? 'model' : 'user',
      parts: [{ text: String(text).slice(0, 12000) }],
    }));
    const contents = [...prior, { role: 'user', parts: [{ text: prompt.slice(0, 12000) }] }];
    const tools = [{
      functionDeclarations: [{
        name: 'criar_nota',
        description: 'Cria uma nova nota (mensagem) numa conversa existente do SaveChat. Use sempre que o usuário pedir para registrar, anotar, planejar ou criar conteúdo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            conversa: { type: 'STRING', description: 'Nome exato da conversa onde criar a nota (veja o contexto enviado)' },
            texto: { type: 'STRING', description: 'Conteúdo completo da nota, em markdown' },
          },
          required: ['conversa', 'texto'],
        },
      }],
    }];
    try {
      const first = await this._aiFetch(Store.data.ui.aiModel, key, { systemInstruction: this._aiSystemInstruction(), contents, tools });
      const cand = (first.candidates || [])[0] || {};
      const parts = (cand.content && cand.content.parts) || [];
      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      let answer = parts.filter((p) => p.text).map((p) => p.text).join('').trim();
      let actions = [];
      let finalContents = contents;
      if (calls.length) {
        // executa as ferramentas e faz a 2ª chamada com os resultados
        const modelParts = [];
        const responses = [];
        actions = calls.map((call) => {
          modelParts.push({ functionCall: call });
          if (call.name === 'criar_nota') {
            const res = this._execCreateNote({ conversa: call.args && call.args.conversa, texto: call.args && call.args.texto });
            responses.push({ functionResponse: { name: 'criar_nota', response: res } });
            return res.ok ? `📝 Nota criada em “${res.conversa}”` : `⚠️ Não consegui criar a nota: ${res.erro}`;
          }
          responses.push({ functionResponse: { name: call.name, response: { ok: false, erro: 'Função desconhecida' } } });
          return `⚠️ Função desconhecida: ${call.name}`;
        });
        finalContents = [...contents,
          { role: 'model', parts: modelParts },
          { role: 'user', parts: responses },
        ];
        const second = await this._aiFetch(Store.data.ui.aiModel, key, { systemInstruction: this._aiSystemInstruction(), contents: finalContents, tools });
        const cand2 = (second.candidates || [])[0] || {};
        answer = ((cand2.content && cand2.content.parts) || []).filter((p) => p.text).map((p) => p.text).join('').trim();
      }
      if (!answer && !actions.length) throw new Error('A IA não retornou uma resposta. Tente novamente.');
      history.push({ role: 'model', text: answer || '', actions, ts: Date.now() });
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

  async _aiFetch(model, key, body) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(Object.assign({ generationConfig: { maxOutputTokens: 2048 } }, body)),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : `Erro da API (${response.status})`);
    return data;
  },

  // executa criar_nota: escreve no Store e envia pelo sync (mesmo caminho do composer)
  _execCreateNote({ conversa, texto }) {
    const name = normName(conversa);
    const threads = Store.threadList();
    const target = threads.find((t) => normName(t.name) === name)
      || threads.find((t) => normName(t.name).includes(name));
    if (!target) return { ok: false, erro: `Conversa "${conversa}" não encontrada` };
    const clean = String(texto || '').trim();
    if (!clean) return { ok: false, erro: 'Texto da nota vazio' };
    const note = {
      clientId: uid(), threadId: target.id, text: clean.slice(0, 8000),
      ts: now(), userId: (Store.user && Store.user.mail) || 'anon', pending: true, local: true,
    };
    const eff = Store.upsertNote(note) || note;
    const stored = (Store.notesFor(target.id) || []).find((x) => x.clientId === eff.clientId);
    Sync.send('note:upsert', Object.assign({}, stored || eff, { pending: false }));
    // se a conversa alvo está aberta, a nota aparece na hora
    if (this.activeThread === target.id && typeof this.appendNoteRealtime === 'function') {
      this.appendNoteRealtime(stored || eff);
      this.updateNoteCount && this.updateNoteCount();
    }
    return { ok: true, conversa: target.name };
  },

  _growAiPrompt(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  },

  // ---------- Áudio: gravar → transcrever (Gemini) → campo de texto ----------
  async _toggleAiRecording() {
    const rec = this._aiRecorder;
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    const key = (Store.data.ui && Store.data.ui.aiKey) || (document.getElementById('ai-key') || {}).value?.trim();
    if (!key) { this.toast('Adicione sua chave da API Gemini para usar áudio', { kind: 'info' }); document.getElementById('ai-key')?.focus(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.toast('Gravação de áudio não é suportada neste navegador', { kind: 'error' }); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => this._finishAiRecording(stream, chunks, mime || 'audio/webm', key);
      recorder.start();
      this._aiRecorder = recorder;
      this._setRecUI(true);
      const t0 = Date.now();
      this._aiRecTimer = setInterval(() => {
        const el = document.getElementById('ai-rec-timer');
        if (!el) return;
        const s = Math.floor((Date.now() - t0) / 1000);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 500);
    } catch (err) {
      this.toast(err && err.name === 'NotAllowedError' ? 'Permissão de microfone negada' : 'Não consegui acessar o microfone', { kind: 'error' });
    }
  },

  async _finishAiRecording(stream, chunks, mime, key) {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(this._aiRecTimer);
    this._aiRecorder = null;
    this._setRecUI(false);
    const blob = new Blob(chunks, { type: mime });
    if (blob.size < 1200) { this.toast('Áudio muito curto — grave um pouco mais', { kind: 'info' }); return; }
    const mic = document.getElementById('ai-mic');
    mic && mic.classList.add('busy');
    this._setRecStatus('Transcrevendo áudio…');
    try {
      const text = await this._transcribeAudio(blob, key);
      const ta = document.getElementById('ai-prompt');
      if (ta) {
        ta.value = ta.value ? `${ta.value} ${text}` : text;
        this._growAiPrompt(ta);
        ta.focus();
      }
      haptic('success');
      this.toast('Áudio transcrito — revise e envie', { kind: 'success' });
    } catch (err) {
      this.toast((err && err.message) || 'Falha ao transcrever o áudio', { kind: 'error', duration: 5000 });
    } finally {
      mic && mic.classList.remove('busy');
      this._setRecStatus('');
    }
  },

  async _transcribeAudio(blob, key) {
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Falha ao ler o áudio'));
      reader.readAsDataURL(blob);
    });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcreva este áudio em português brasileiro, fielmente, sem comentários. Responda APENAS com a transcrição.' },
            { inlineData: { mimeType: blob.type || 'audio/webm', data: b64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : `Erro da API (${response.status})`);
    const out = ((data.candidates || [])[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
      .map((p) => p.text || '').join('').trim();
    if (!out) throw new Error('Não consegui extrair fala deste áudio.');
    return out;
  },

  _setRecUI(on) {
    const mic = document.getElementById('ai-mic');
    const status = document.getElementById('ai-rec-status');
    if (mic) {
      mic.classList.toggle('rec', on);
      mic.setAttribute('aria-pressed', String(!!on));
      mic.title = on ? 'Parar gravação e transcrever' : 'Gravar áudio';
    }
    if (status) status.classList.toggle('hidden', !on);
  },

  _setRecStatus(text) {
    const status = document.getElementById('ai-rec-status');
    if (status && text) status.querySelector('.ai-rec-text').textContent = text;
    if (status && text) status.classList.remove('hidden');
    else if (status && !this._aiRecorder) status.classList.add('hidden');
  },

  // ================= Diária — rotina que se renova todo dia =================
  // itens: [{id, text, createdAt}] · log: { 'YYYY-MM-DD': { done: [id] } }
  _daily() {
    Store.data.ui = Store.data.ui || {};
    Store.data.ui.dailyRoutine = Store.data.ui.dailyRoutine || { items: [], log: {} };
    Store.data.ui.dailyRoutine.items = Store.data.ui.dailyRoutine.items || [];
    Store.data.ui.dailyRoutine.log = Store.data.ui.dailyRoutine.log || {};
    return Store.data.ui.dailyRoutine;
  },

  addDailyItem(text) {
    const d = this._daily();
    d.items.push({ id: uid(), text: String(text).slice(0, 160), createdAt: now() });
    Store.save();
    this.renderDailyPage();
    haptic('light');
  },

  toggleDailyItem(id) {
    const d = this._daily();
    const key = todayKey();
    d.log[key] = d.log[key] || { done: [] };
    const done = d.log[key].done;
    const i = done.indexOf(id);
    if (i >= 0) done.splice(i, 1); else done.push(id);
    Store.save();
    this.renderDailyPage();
    haptic('light');
  },

  deleteDailyItem(id) {
    const d = this._daily();
    d.items = d.items.filter((x) => x.id !== id);
    Object.values(d.log).forEach((entry) => { if (entry.done) entry.done = entry.done.filter((x) => x !== id); });
    Store.save();
    this.renderDailyPage();
  },

  renderDailyPage() {
    const list = document.getElementById('daily-list');
    if (!list) return;
    const d = this._daily();
    const key = todayKey();
    const doneToday = (d.log[key] && d.log[key].done) || [];
    const total = d.items.length;
    const doneCount = d.items.filter((x) => doneToday.includes(x.id)).length;
    // progresso
    const bar = document.getElementById('daily-progress-bar');
    if (bar) bar.style.width = total ? `${Math.round((doneCount / total) * 100)}%` : '0%';
    const sub = document.getElementById('daily-sub');
    if (sub) sub.textContent = total
      ? (doneCount >= total && total > 0 ? 'Tudo concluído hoje — amanhã ela recomeça. 🎉' : `${doneCount} de ${total} concluídas hoje — amanhã a lista recomeça.`)
      : 'Cadastre sua rotina uma vez — ela se renova todo dia.';
    // streak: dias seguidos (até ontem) com tudo concluído
    const streakEl = document.getElementById('daily-streak');
    if (streakEl) {
      let streak = 0;
      const cursor = new Date();
      for (;;) {
        cursor.setDate(cursor.getDate() - 1);
        const k = todayKey(cursor);
        const entry = d.log[k];
        if (total && entry && entry.done && entry.done.length >= total) streak++; else break;
      }
      streakEl.innerHTML = `🔥 <strong>${streak}</strong>`;
      streakEl.title = streak === 1 ? '1 dia seguido completando toda a rotina' : `${streak} dias seguidos completando toda a rotina`;
    }
    // lista
    if (!total) {
      list.innerHTML = '<li class="daily-empty">Nenhuma tarefa da rotina ainda. Adicione a primeira acima — por exemplo: <em>beber 2L de água</em>, <em>exercício</em>, <em>ler 10 páginas</em>.</li>';
      return;
    }
    list.innerHTML = d.items.map((item) => {
      const done = doneToday.includes(item.id);
      return `<li class="daily-item${done ? ' done' : ''}" data-id="${item.id}">` +
        `<button type="button" class="daily-check" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Desmarcar' : 'Concluir'}: ${esc(item.text)}">` +
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 12.5l4 4 9-9"/></svg></button>` +
        `<span class="daily-text">${esc(item.text)}</span>` +
        `<button type="button" class="daily-del" aria-label="Excluir ${esc(item.text)}">×</button></li>`;
    }).join('');
  },
};

export { DEFAULT_MODEL };
