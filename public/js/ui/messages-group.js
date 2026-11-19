// Agrupar mensagens: seleção múltipla de bolhas e fusão em uma única nota.
//
// Fluxo: menu ⋮ da bolha → "Agrupar" → cada bolha ganha um checkbox e o botão
// de enviar/gravar do composer vira Cancelar + Agrupar (n). Confirmar com 2+
// selecionadas cria uma nota nova com o conteúdo de todas, separadas por uma
// linha em branco, e apaga as originais.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { uid, now, haptic, $ } from '../utils.js';

export const MessagesGroupMethods = {
  _group: null,

  startGroupMode(clientId) {
    if (!this.activeThread) return;
    this._group = { sel: new Set() };
    if (clientId) this._group.sel.add(clientId);
    document.getElementById('messages')?.classList.add('grouping');
    this._composerRow()?.classList.add('grouping');
    this._renderGroupChecks();
    this._syncGroupBar();
    haptic('light');
  },

  // o composer da CONVERSA especificamente: `querySelector('.composer-row')`
  // pegava o da página de IA (primeiro no DOM) e a classe ia para o lugar errado
  _composerRow() {
    return $('#composer-input')?.closest('.composer-row') || null;
  },

  _renderGroupChecks() {
    const box = document.getElementById('messages');
    if (!box || !this._group) return;
    box.querySelectorAll('.bubble').forEach((el) => {
      const cid = el.dataset.clientId;
      if (!cid) return;
      if (!el.querySelector('.bubble-check')) {
        const wrap = document.createElement('span');
        wrap.className = 'bubble-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('aria-label', 'Selecionar mensagem');
        cb.dataset.cid = cid;
        wrap.appendChild(cb);
        // o clique no rótulo não abre o menu da bolha nem seleciona texto
        wrap.addEventListener('click', (e) => { e.stopPropagation(); this._toggleGroupSel(cid); });
        el.insertBefore(wrap, el.firstChild);
        el.classList.add('group-sel');
      }
      const cb = el.querySelector('.bubble-check input');
      const on = this._group.sel.has(cid);
      if (cb) cb.checked = on;
      el.classList.toggle('group-checked', on);
    });
  },

  _toggleGroupSel(clientId) {
    if (!this._group) return;
    if (this._group.sel.has(clientId)) this._group.sel.delete(clientId);
    else this._group.sel.add(clientId);
    const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
    if (el) {
      el.classList.toggle('group-checked', this._group.sel.has(clientId));
      const cb = el.querySelector('.bubble-check input');
      if (cb) cb.checked = this._group.sel.has(clientId);
    }
    this._syncGroupBar();
    haptic('light');
  },

  _syncGroupBar() {
    const n = this._group ? this._group.sel.size : 0;
    const bar = $('#group-bar');
    if (bar) bar.classList.toggle('hidden', !this._group);
    const confirm = $('#group-confirm');
    if (confirm) {
      confirm.disabled = n < 2;
      confirm.textContent = 'Agrupar (' + n + ')';
    }
  },

  bindGroupBar() {
    $('#group-cancel')?.addEventListener('click', () => this.cancelGroupMode());
    $('#group-confirm')?.addEventListener('click', () => this.confirmGroup());
  },

  cancelGroupMode() {
    if (!this._group) return;
    this._exitGroupMode();
  },

  _exitGroupMode() {
    this._group = null;
    document.getElementById('messages')?.classList.remove('grouping');
    this._composerRow()?.classList.remove('grouping');
    document.querySelectorAll('.bubble-check').forEach((el) => el.remove());
    document.querySelectorAll('.bubble.group-sel').forEach((el) => {
      el.classList.remove('group-sel', 'group-checked');
    });
    this._syncGroupBar();
  },

  confirmGroup() {
    const sel = this._group ? [...this._group.sel] : [];
    if (sel.length < 2 || !this.activeThread) return;
    const arr = Store.notesFor(this.activeThread) || [];
    const notas = arr.filter((n) => sel.indexOf(n.clientId) >= 0).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (notas.length < 2) { this._exitGroupMode(); return; }

    // uma nota carrega UM áudio: não há como fundir dois sem perder mídia
    if (notas.some((n) => n.audio && (n.audio.url || n.audio.mime))) {
      this.toast('Mensagens com áudio não podem ser agrupadas', { kind: 'error' });
      return;
    }

    const texto = notas.map((n) => (n.text || '').trim()).filter(Boolean).join('\n\n');
    if (!texto) {
      this.toast('As mensagens selecionadas estão vazias', { kind: 'error' });
      return;
    }

    const imgs = notas.reduce((acc, n) => acc.concat(n.images || []), []);
    const merged = {
      clientId: uid(),
      threadId: this.activeThread,
      text: texto,
      images: imgs,
      // herda o horário da última selecionada: a agrupada ocupa o lugar dela
      ts: notas[notas.length - 1].ts || now(),
      userId: Store.user ? Store.user.mail : 'anon',
      pending: true, local: true,
    };
    const eff = Store.upsertNote(merged) || merged;
    this._exitGroupMode();
    this.appendNoteRealtime(eff);

    const stored = (Store.notesFor(this.activeThread) || []).find((x) => x.clientId === eff.clientId);
    Sync.send('note:upsert', Object.assign({}, stored || eff, { pending: false }));
    this.markSent(eff.clientId);

    notas.forEach((n) => {
      Store.deleteNote(this.activeThread, n.clientId);
      Sync.send('note:delete', { threadId: this.activeThread, clientId: n.clientId });
      const el = document.querySelector(`.bubble[data-client-id="${n.clientId}"]`);
      if (el) el.remove();
      if (this.renderedClientIds) this.renderedClientIds.delete(n.clientId);
    });

    this.updateNoteCount();
    this._pruneOrphanDaySeps(document.getElementById('messages'));
    Sound.play('toggle');
    haptic('success');
    this.toast(notas.length + ' mensagens agrupadas', { kind: 'success' });
  },
};
