// Pagina da IA: assistente que lê as notas recentes como contexto e
// pode criar mensagens (function calling). Inclui o áudio
// (grava -> transcreve pelo Gemini -> campo para revisão).

import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { renderMarkdown } from '../markdown.js';
import { esc, haptic, uid, now } from '../utils.js';
// normName: comparação sem acento/maiúscula (a IA manda o nome da
// conversa e o nome real pode ter acento)
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TRANSCRIBE_MODEL = 'gemini-2.5-flash';
// Glifos do botão único da IA — os MESMOS paths de composer-audio.js,
// para o botão ser indistinguível do da conversa.
const MIC_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

export const WorkspaceAiMethods = {
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
      input.disabled = false;
      button.disabled = false;
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

  // Botão único da IA: vazio = microfone (estilo accent-soft, igual o
  // .cozy-send.audio-mode da conversa), com texto = enviar (accent sólido).

  _updateAiSendAudioState(ta, btn) {
    if (!btn) return;
    const hasContent = ta && ta.value.trim() !== '';
    this._aiAudioMode = !hasContent;
    btn.classList.toggle('audio-mode', this._aiAudioMode);
    const label = this._aiAudioMode ? 'Gravar áudio' : 'Enviar mensagem para a IA';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const want = this._aiAudioMode ? MIC_SVG : SEND_SVG;
    if (btn.innerHTML !== want) btn.innerHTML = want;
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
      const aiBtn = document.getElementById('ai-send');
      if (aiBtn) { aiBtn.classList.remove('audio-mode'); aiBtn.classList.add('recording'); }
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
    const aiBtnNow = document.getElementById('ai-send');
    if (aiBtnNow) {
      aiBtnNow.classList.remove('recording', 'audio-mode');
      this._updateAiSendAudioState(document.getElementById('ai-prompt'), aiBtnNow);
    }
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
  // itens: [{id, text, createdAt, time?: 'HH:MM', notify?: bool}]
  // log:  { 'YYYY-MM-DD': { done: [id], notified: [id] } }
};
