// Pagina da IA: assistente que lê as notas recentes como contexto e pode
// propor criar/editar notas e marcar checkboxes (function calling). Nada é
// executado até o usuário confirmar; a execução é local, sem 2ª chamada à IA.
// Inclui o áudio (grava -> transcreve pelo Groq Whisper -> campo para revisão).

import { Store } from '../store.js';
import { Sync, getSupa, USE_SUPABASE, SUPABASE_ANON_KEY } from '../sync-supabase.js';
import { renderMarkdown } from '../markdown.js';
import { esc, haptic, uid, now } from '../utils.js';
import { mascotAvatarHtml, mascotFromStore } from '../mascot.js';
import { transcribeAudio } from '../transcribe.js';
// normName: comparação sem acento/maiúscula (a IA manda o nome da
// conversa e o nome real pode ter acento)
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const DEFAULT_MODEL = 'gemini-3.6-flash';
// Glifos do botão único da IA — os MESMOS paths de composer-audio.js,
// para o botão ser indistinguível do da conversa.
const MIC_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

export const WorkspaceAiMethods = {
  prepareAiPage() {
    this.renderAiMessages();
  },

  renderAiMessages() {
    const list = document.getElementById('ai-messages');
    if (!list) return;
    const history = (Store.data.ui && Store.data.ui.aiChat) || [];
    if (!history.length) {
      list.innerHTML = `<div class="workspace-empty">${mascotAvatarHtml('idle')}<span class="ai-mascot-name">${esc(mascotFromStore().name)}</span><strong>Peça à IA — ela conhece suas notas</strong><span>Resuma uma conversa, planeje seu dia ou peça: <em>“crie uma nota na conversa Compras com a lista do churrasco”</em>.</span></div>`;
      return;
    }
    // Enquanto a resposta não chega, o avatar mostra "pensando" no fim da lista.
    const thinking = this._aiBusy
      ? `<div class="ai-typing">${mascotAvatarHtml('thinking')}<span>Pensando…</span></div>`
      : '';
    list.innerHTML = history.map((item) => {
      const chips = (item.actions || []).map((a) => `<div class="ai-action-chip">${esc(a)}</div>`).join('');
      const article = `<article class="ai-message ${item.role === 'user' ? 'user' : 'model'}"><div class="ai-message-label">${item.role === 'user' ? 'Você' : 'IA'}</div>${chips}<div class="ai-message-body">${renderMarkdown(item.text || '')}</div></article>`;
      if (!item.pending || item.pending.status !== 'pending') return article;
      const msgId = esc(item.id || item.ts || '');
      return `<div class="ai-message-group">${article}<div class="ai-confirm-actions" role="group" aria-label="Confirmação da ação"><button type="button" class="ai-confirm-btn cancel" data-ai-confirm="cancel" data-ai-msg="${msgId}">Cancelar</button><button type="button" class="ai-confirm-btn confirm" data-ai-confirm="confirm" data-ai-msg="${msgId}">Confirmar</button></div></div>`;
    }).join('') + thinking;
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
      notes.forEach((n) => {
        const text = String(n.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        // a transcrição do áudio vive em `audio.transcript` (sincronizada na
        // coluna jsonb `audio`); sem esta linha a IA não "ouve" a mensagem de voz
        const transcript = String((n.audio && n.audio.transcript) || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        const id = n.clientId || n.id;
        const tag = id ? `[nota:${id}] ` : '';
        if (text) lines.push(`- ${tag}${text}`);
        if (transcript) lines.push(`- ${tag}[áudio transcrito] ${transcript}`);
      });
    });
    return lines.join('\n').slice(0, 24000);
  },

  _aiSystemInstruction() {
    const context = this._buildAiContext();
    let text = 'Você é o assistente de IA do SaveChat, um app de notas em conversas. Responda em português brasileiro, com clareza e simpatia, usando markdown quando ajudar. ' +
      'Você RECEBE como contexto as notas recentes das conversas do usuário — incluindo a transcrição das mensagens de voz, marcada com [áudio transcrito] — use esse conteúdo para responder resumos, planejamentos e perguntas sobre as notas. Se algo não estiver nas notas, diga que não encontrou. ' +
      'Você PODE CRIAR, EDITAR E MARCAR CHECKBOXES EM NOTAS. Use as funções quando o usuário pedir para registrar, anotar, criar, alterar, corrigir, marcar ou desmarcar algo. ' +
      'Para editar ou marcar uma nota existente, use o [nota:ID] que aparece no contexto; se não houver ID, mande um trecho do texto atual em “nota”. Nunca invente IDs. ' +
      'Chame TODAS as funções necessárias para cumprir o pedido, em ordem. Não execute nem diga que executou: o app mostra a confirmação e só age depois que o usuário aceitar. ' +
      'Depois do pedido, não responda “feito” nem peça nova confirmação em texto; a pergunta de confirmação é montada pelo app.';
    if (context) text += `\n\n=== Notas recentes do usuário (contexto — não repita no chat) ===\n${context}`;
    return { parts: [{ text }] };
  },

  // Ferramentas que a IA pode pedir. Elas NÃO executam nada sozinhas: a
  // resposta vira uma proposta e o app só age depois do "Confirmar".
  _aiTools() {
    return [{
      functionDeclarations: [
        {
          name: 'criar_nota',
          description: 'Cria uma nova nota (mensagem) numa conversa existente do SaveChat. Use quando o usuário pedir para registrar, anotar, planejar ou criar conteúdo novo.',
          parameters: {
            type: 'OBJECT',
            properties: {
              conversa: { type: 'STRING', description: 'Nome exato da conversa onde criar a nota (veja o contexto enviado)' },
              texto: { type: 'STRING', description: 'Conteúdo completo da nota, em markdown' },
            },
            required: ['conversa', 'texto'],
          },
        },
        {
          name: 'editar_nota',
          description: 'Substitui o texto completo de uma nota existente. Use quando o usuário pedir para editar, corrigir, completar ou reescrever uma nota. Prefira nota_id; use nota (trecho do texto atual) se não tiver o id.',
          parameters: {
            type: 'OBJECT',
            properties: {
              conversa: { type: 'STRING', description: 'Nome exato da conversa da nota' },
              nota_id: { type: 'STRING', description: 'ID da nota no contexto, no formato [nota:ID]' },
              nota: { type: 'STRING', description: 'Trecho do texto atual da nota, para localizá-la quando não houver nota_id' },
              novo_texto: { type: 'STRING', description: 'Novo conteúdo completo da nota, em markdown' },
            },
            required: ['conversa', 'novo_texto'],
          },
        },
        {
          name: 'marcar_checkbox',
          description: 'Marca ou desmarca uma checkbox de uma nota existente. Se item for omitido, aplica a todas as checkboxes da nota. Use marcado=false para desmarcar.',
          parameters: {
            type: 'OBJECT',
            properties: {
              conversa: { type: 'STRING', description: 'Nome exato da conversa da nota' },
              nota_id: { type: 'STRING', description: 'ID da nota no contexto, no formato [nota:ID]' },
              nota: { type: 'STRING', description: 'Trecho do texto atual da nota, para localizá-la quando não houver nota_id' },
              item: { type: 'STRING', description: 'Texto da checkbox a marcar/desmarcar; omita para todas' },
              marcado: { type: 'BOOLEAN', description: 'true para marcar; false para desmarcar (padrão: true)' },
            },
            required: ['conversa'],
          },
        },
      ],
    }];
  },

  _aiShortText(value, max = 64) {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  },

  _aiActionText(action) {
    const q = (s) => `“${this._aiShortText(s)}”`;
    const conversa = q(action && action.conversa ? action.conversa : 'conversa não identificada');
    if (!action) return 'executar uma ação';
    if (action.type === 'create_note') return `criar uma nota em ${conversa}`;
    if (action.type === 'edit_note') {
      const resumo = action.notaResumo || action.nota;
      const alvo = resumo ? `a nota ${q(resumo)}` : 'a nota selecionada';
      return `editar ${alvo} em ${conversa}`;
    }
    if (action.type === 'toggle_checkbox') {
      const verbo = action.marcado ? 'marcar' : 'desmarcar';
      const alvo = action.item ? q(action.item) : 'todas as caixas';
      const resumo = action.notaResumo || action.nota;
      const nota = resumo ? ` na nota ${q(resumo)}` : '';
      return `${verbo} ${alvo}${nota} em ${conversa}`;
    }
    return `executar a ação ${q(action.name || 'desconhecida')}`;
  },

  _aiConfirmationText(actions) {
    const parts = (actions || []).map((a) => this._aiActionText(a)).filter(Boolean);
    if (!parts.length) return '';
    const joined = parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
    return `Você confirma que quer ${joined}?`;
  },

  _aiNoteId(value) {
    return String(value || '').trim().replace(/^\[?\s*nota:\s*/i, '').replace(/\]$/, '').trim();
  },

  _aiPlanActions(callParts) {
    return (callParts || []).map((part) => {
      const call = part && part.functionCall;
      if (!call) return null;
      const args = call.args || {};
      if (call.name === 'criar_nota') {
        return {
          type: 'create_note',
          conversa: String(args.conversa || '').trim(),
          texto: String(args.texto || '').trim(),
        };
      }
      if (call.name === 'editar_nota') {
        const conversa = String(args.conversa || '').trim();
        const notaId = this._aiNoteId(args.nota_id || args.notaId);
        const nota = String(args.nota || '').trim();
        const target = this._findAiThread(conversa);
        const found = target ? this._findAiNote(target, { notaId, nota }) : null;
        return {
          type: 'edit_note',
          conversa,
          notaId: (found && found.clientId) || notaId,
          nota,
          notaResumo: String((found && found.text) || '').slice(0, 300),
          novoTexto: String(args.novo_texto || args.novoTexto || args.texto || '').trim(),
        };
      }
      if (call.name === 'marcar_checkbox') {
        const conversa = String(args.conversa || '').trim();
        const notaId = this._aiNoteId(args.nota_id || args.notaId);
        const nota = String(args.nota || '').trim();
        const target = this._findAiThread(conversa);
        const found = target ? this._findAiNote(target, { notaId, nota }) : null;
        return {
          type: 'toggle_checkbox',
          conversa,
          notaId: (found && found.clientId) || notaId,
          nota,
          notaResumo: String((found && found.text) || '').slice(0, 300),
          item: String(args.item || '').trim(),
          marcado: !(args.marcado === false || args.marcado === 'false'),
        };
      }
      return {
        type: 'unknown',
        conversa: String(args.conversa || '').trim(),
        name: call.name,
      };
    }).filter(Boolean);
  },

  async sendAiMessage() {
    const input = document.getElementById('ai-prompt');
    const button = document.getElementById('ai-send');
    const prompt = input && input.value.trim();
    if (!prompt) return;
    Store.data.ui = Store.data.ui || {};
    // Sem chave própria, o app usa o provedor do servidor (api/ai.js). A
    // chave só é obrigatória quando não há Supabase (dev local), porque nesse
    // caso não existe sessão para o proxy autenticar. Chaves salvas por
    // versões anteriores continuam valendo mesmo sem a interface de config.
    const key = Store.data.ui.aiKey || '';
    const model = Store.data.ui.aiModel || DEFAULT_MODEL;
    if (!key && !USE_SUPABASE) { this.toast('A IA precisa de uma sessão ou de uma chave da API configurada', { kind: 'info' }); return; }
    Store.data.ui.aiModel = model;
    const history = Store.data.ui.aiChat || (Store.data.ui.aiChat = []);
    const userMsg = { id: uid(), role: 'user', text: prompt, ts: Date.now() };
    history.push(userMsg);
    Store.save();
    // A thread da IA é conversa permanente na árvore (ai-thread.js): o
    // histórico também vira nota ali, para persistir como qualquer outra
    // conversa — mas a thread é `localOnly`, então o conteúdo não sai do
    // aparelho. `role` fica gravado em `aiRole` para o render saber de
    // quem é a fala.
    this._aiPersistTurn('user', prompt, userMsg.id);
    input.value = '';
    this._growAiPrompt(input);
    input.disabled = true; button.disabled = true;
    this._aiBusy = true;
    this.renderAiMessages();
    const start = history.length;
    const prior = history.slice(-21, -1).map(({ role, text }) => ({
      role: role === 'model' ? 'model' : 'user',
      parts: [{ text: String(text).slice(0, 12000) }],
    }));
    const contents = [...prior, { role: 'user', parts: [{ text: prompt.slice(0, 12000) }] }];
    try {
      const first = await this._aiFetch(model, key, { systemInstruction: this._aiSystemInstruction(), contents, tools: this._aiTools() });
      const cand = (first.candidates || [])[0] || {};
      const parts = (cand.content && cand.content.parts) || [];
      const callParts = parts.filter((p) => p.functionCall);
      let answer = parts.filter((p) => p.text).map((p) => p.text).join('').trim();
      const actions = callParts.length ? this._aiPlanActions(callParts) : [];
      let pending = null;
      if (actions.length) {
        // Nada é executado aqui. Guardamos o plano na mensagem e deixamos o
        // usuário decidir; o "Confirmar" roda as ações localmente, sem uma
        // segunda chamada à IA.
        answer = this._aiConfirmationText(actions);
        pending = { status: 'pending', actions };
      }
      if (!answer) throw new Error('A IA não retornou uma resposta. Tente novamente.');
      const modelMsg = { id: uid(), role: 'model', text: answer, actions: [], ts: Date.now() };
      if (pending) modelMsg.pending = pending;
      history.push(modelMsg);
      if (history.length > 40) history.splice(0, history.length - 40);
      Store.save();
      this._aiPersistTurn('model', answer, modelMsg.id);
      this._aiBusy = false;
      this.renderAiMessages();
      haptic('success');
    } catch (error) {
      // Sem execução antes da confirmação, uma falha pode desfazer o turno
      // inteiro (o usuário vê o toast e tenta de novo).
      while (history.length > start - 1) history.pop();
      Store.save();
      this._aiBusy = false;
      this.renderAiMessages();
      const message = error.message || 'Falha ao falar com a API Gemini';
      this.toast(message.length > 130 ? `${message.slice(0, 127)}…` : message, { kind: 'error', duration: 5000 });
    } finally {
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  },

  resolveAiPending(msgId, decision) {
    const history = (Store.data.ui && Store.data.ui.aiChat) || [];
    const msg = history.find((m) => m.pending && m.pending.status === 'pending'
      && ((m.id && m.id === msgId) || String(m.ts) === String(msgId)));
    if (!msg) return;
    if (decision !== 'confirm') {
      msg.pending.status = 'cancelled';
      msg.text = 'Ação cancelada.';
      msg.actions = [];
      Store.save();
      this._aiUpdatePersistedTurn(msg.id, msg.text);
      this.renderAiMessages();
      haptic('light');
      this.toast('Ação cancelada', { kind: 'info', duration: 2500 });
      return;
    }
    const actions = Array.isArray(msg.pending.actions) ? msg.pending.actions : [];
    const results = actions.map((action) => {
      try {
        return this._executeAiAction(action);
      } catch (err) {
        return { ok: false, erro: (err && err.message) || 'Falha ao executar a ação' };
      }
    });
    const okCount = results.filter((r) => r.ok).length;
    msg.pending.status = 'done';
    msg.pending.results = results;
    msg.actions = results.map((r) => (r.ok ? r.message : `⚠️ ${r.erro || 'Não consegui concluir a ação'}`));
    msg.text = msg.actions.join('\n') || 'Nenhuma ação pendente.';
    Store.save();
    this._aiUpdatePersistedTurn(msg.id, msg.text);
    this.renderAiMessages();
    const allOk = actions.length > 0 && okCount === actions.length;
    haptic(allOk ? 'success' : 'error');
    this.toast(allOk
      ? (actions.length === 1 ? 'Ação confirmada' : 'Ações confirmadas')
      : (okCount ? 'Ação concluída com avisos' : 'Não consegui concluir a ação'),
    { kind: allOk ? 'success' : 'info', duration: 3500 });
  },

  _executeAiAction(action) {
    if (!action || !action.type) return { ok: false, erro: 'Ação inválida' };
    if (action.type === 'create_note') {
      const res = this._execCreateNote({ conversa: action.conversa, texto: action.texto });
      return res.ok
        ? { ok: true, message: `📝 Nota criada em “${res.conversa}”` }
        : { ok: false, erro: res.erro };
    }
    if (action.type === 'edit_note') return this._execEditNote(action);
    if (action.type === 'toggle_checkbox') return this._execToggleCheckbox(action);
    return { ok: false, erro: `Função desconhecida: ${action.name || action.type}` };
  },

  // Espelha um turno da conversa com a IA na thread permanente
  // (`ai-assistant`, ver ai-thread.js), como nota comum — com `aiRole`
  // dizendo de quem é a fala, porque uma nota normal só distingue
  // user/other. A thread é `localOnly`, então o sync ignora; nada disso
  // vai para o servidor.
  //
  // O histórico CANÔNICO continua sendo `ui.aiChat` (que a página da IA já
  // usava e que guarda `actions`/tool-calls, algo que nota não tem). Este
  // espelho é o que aparece na árvore; se os dois divergirem, manda o
  // `ui.aiChat`. Em falha da API o catch dá `history.pop()` no
  // `ui.aiChat` mas NÃO desfaz a nota da pergunta — aceitável: a pergunta
  // existiu e fica registrada como tentativa, o que é mais honesto do que
  // sumir com ela.
  _aiPersistTurn(role, text, aiMsgId) {
    const ai = window.NoteThread && window.NoteThread.AiThread;
    if (!ai || !text) return;
    ai.ensureAiThread();
    const note = {
      clientId: uid(),
      threadId: ai.AI_THREAD_ID,
      user: 'me',
      text,
      ts: Date.now(),
      images: [],
      aiRole: role === 'model' ? 'model' : 'user',
      localOnly: true,
      aiMsgId: aiMsgId || undefined,
    };
    Store.upsertNote(note);
    if (typeof this.renderTree === 'function') this.queueRenderTree();
  },

  // Atualiza o espelho na thread da IA quando uma proposta pendente é
  // confirmada ou cancelada. Sem isso, a árvore mostraria a pergunta de
  // confirmação para sempre, enquanto a página da IA já mostra o resultado.
  _aiUpdatePersistedTurn(aiMsgId, text) {
    if (!aiMsgId) return;
    const ai = window.NoteThread && window.NoteThread.AiThread;
    if (!ai) return;
    const notes = Store.notesFor(ai.AI_THREAD_ID) || [];
    const n = notes.find((x) => x.aiMsgId === aiMsgId);
    if (!n) return;
    n.text = text;
    n.editedAt = now();
    n.rev = (n.rev || 0) + 1;
    Store.save();
    if (this.activeThread === ai.AI_THREAD_ID && typeof this._replaceBubble === 'function') {
      if (this.renderedClientIds) this.renderedClientIds.delete(n.clientId);
      this._replaceBubble(n.clientId, n);
    }
    if (typeof this.queueRenderTree === 'function') this.queueRenderTree();
  },

  // Token do Supabase para o proxy (api/ai.js). Sem sessão não há como
  // provar ao servidor que a chamada vem de um usuário do app.
  async _aiSessionToken() {
    if (!USE_SUPABASE) return '';
    try {
      const supa = await getSupa();
      const { data: { session } } = await supa.auth.getSession();
      return (session && session.access_token) || '';
    } catch (e) {
      return '';
    }
  },

  async _aiFetch(model, key, body) {
    const payload = Object.assign({ generationConfig: { maxOutputTokens: 2048 } }, body);
    const json = JSON.stringify(payload);
    let response;
    if (key) {
      // BYOK: a chave do próprio usuário, direto no Google — nada passa
      // pelo servidor do app.
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: json,
      });
    } else {
      // Provedor do app: a chave fica no servidor. Daqui saem só o pedido e
      // a sessão; a função valida o token antes de gastar a cota.
      const token = await this._aiSessionToken();
      if (!token) throw new Error('Entre na sua conta para usar a IA.');
      response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          // anon key pública: identifica o projeto do Supabase na validação
          // da sessão. Não é segredo (já vai no HTML).
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ model, payload }),
      });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : `Erro da API (${response.status})`);
    return data;
  },

  // Localiza a conversa e a nota que a IA apontou. A IA recebe o clientId
  // como [nota:ID]; quando ela não manda o ID, procuramos pelo trecho do
  // texto. A nota mais recente ganha em caso de empate (o contexto manda as
  // últimas notas de cada conversa).
  _findAiThread(conversa) {
    const name = normName(conversa);
    if (!name) return null;
    const threads = Store.threadList();
    return threads.find((t) => normName(t.name) === name)
      || threads.find((t) => normName(t.name).includes(name))
      || null;
  },

  _findAiNote(target, { notaId, nota } = {}) {
    if (!target) return null;
    const notes = Store.notesFor(target.id) || [];
    const id = this._aiNoteId(notaId);
    if (id) {
      const byId = notes.find((n) => n.clientId === id || n.id === id);
      if (byId) return byId;
    }
    const q = normName(nota).replace(/\s+/g, ' ').trim();
    if (!q) return null;
    const textOf = (n) => normName(n.text).replace(/\s+/g, ' ').trim();
    const recent = notes.slice().reverse();
    return recent.find((n) => textOf(n) === q)
      || recent.find((n) => textOf(n).includes(q))
      || recent.find((n) => textOf(n) && q.includes(textOf(n)))
      || null;
  },

  // Mesmo caminho de persistência das edições feitas no composer: Store
  // primeiro, sync depois; se a conversa estiver aberta, a bolha é trocada.
  _afterAiNoteEdit(target, n) {
    Sync.send('note:edit', {
      threadId: target.id,
      clientId: n.clientId,
      text: n.text,
      edited: !!n.edited,
      editedAt: n.editedAt,
      rev: n.rev,
    });
    if (this.activeThread === target.id && typeof this._replaceBubble === 'function') {
      if (this.renderedClientIds) this.renderedClientIds.delete(n.clientId);
      this._replaceBubble(n.clientId, n);
      if (typeof this._syncScrollMetrics === 'function') this._syncScrollMetrics();
    }
    if (typeof this.queueRenderTree === 'function') this.queueRenderTree();
  },

  // executa criar_nota: escreve no Store e envia pelo sync (mesmo caminho do composer)
  _execCreateNote({ conversa, texto }) {
    const target = this._findAiThread(conversa);
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
    if (typeof this.queueRenderTree === 'function') this.queueRenderTree();
    return { ok: true, conversa: target.name };
  },

  _execEditNote({ conversa, notaId, nota, novoTexto } = {}) {
    const target = this._findAiThread(conversa);
    if (!target) return { ok: false, erro: `Conversa "${conversa}" não encontrada` };
    const n = this._findAiNote(target, { notaId, nota });
    if (!n) return { ok: false, erro: 'Nota não encontrada para editar' };
    const clean = String(novoTexto || '').trim();
    if (!clean) return { ok: false, erro: 'Texto novo da nota vazio' };
    if (clean === n.text) return { ok: true, message: `✓ A nota em “${target.name}” já estava assim` };
    const updated = Store.editNote(target.id, n.clientId, clean.slice(0, 8000));
    if (!updated) return { ok: false, erro: 'Não consegui atualizar a nota' };
    this._afterAiNoteEdit(target, updated);
    return { ok: true, message: `✏️ Nota editada em “${target.name}”` };
  },

  _execToggleCheckbox({ conversa, notaId, nota, item, marcado } = {}) {
    const target = this._findAiThread(conversa);
    if (!target) return { ok: false, erro: `Conversa "${conversa}" não encontrada` };
    const n = this._findAiNote(target, { notaId, nota });
    if (!n) return { ok: false, erro: 'Nota não encontrada para marcar a checkbox' };
    const checked = marcado !== false;
    const q = normName(item).replace(/\s+/g, ' ').trim();
    const lines = String(n.text || '').split('\n');
    const boxes = [];
    lines.forEach((line, index) => {
      const m = line.match(/^(\s*)\[([ xX])\]\s*(.*)$/);
      if (m) boxes.push({ index, m, label: m[3] });
    });
    if (!boxes.length) return { ok: false, erro: 'Esta nota não tem checkboxes' };
    let chosen = boxes;
    if (q) {
      const matches = boxes.filter(({ label }) => {
        const l = normName(label).replace(/\s+/g, ' ').trim();
        return l === q || l.includes(q) || q.includes(l);
      });
      if (!matches.length) return { ok: false, erro: `Checkbox “${item}” não encontrada` };
      chosen = [matches[0]];
    }
    let changed = false;
    chosen.forEach(({ index, m }) => {
      if ((m[2].toLowerCase() === 'x') === checked) return;
      lines[index] = `${m[1]}[${checked ? 'x' : ' '}] ${m[3]}`;
      changed = true;
    });
    const alvo = q ? `“${this._aiShortText(item)}”` : 'todas as caixas';
    if (!changed) return { ok: true, message: `✓ ${alvo} já estava${chosen.length > 1 ? 'm' : ''} ${checked ? 'marcada' : 'desmarcada'}${chosen.length > 1 ? 's' : ''}` };
    n.text = lines.join('\n');
    n.editedAt = now();
    n.rev = (n.rev || 0) + 1;
    Store.save();
    this._afterAiNoteEdit(target, n);
    return { ok: true, message: `${checked ? '☑️' : '☐'} ${alvo} ${checked ? 'marcada' : 'desmarcada'} em “${target.name}”` };
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

  // ---------- Áudio: gravar → transcrever (Groq Whisper) → campo de texto ----------

  async _toggleAiRecording() {
    const rec = this._aiRecorder;
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    const token = await this._aiSessionToken();
    if (!token) { this.toast('Entre na sua conta para transcrever áudio', { kind: 'info' }); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.toast('Gravação de áudio não é suportada neste navegador', { kind: 'error' }); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => this._finishAiRecording(stream, chunks, mime || 'audio/webm');
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

  async _finishAiRecording(stream, chunks, mime) {
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
      const text = await this._transcribeAudio(blob);
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

  async _transcribeAudio(blob) {
    return transcribeAudio(blob, { mime: blob.type });
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
