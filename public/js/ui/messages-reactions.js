// Reações rápidas (❤️ ✨ 🌸 😊) e o popover de ações da mensagem.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { haptic } from '../utils.js';

export const MessagesReactionsMethods = {
    _quickReactions() {
      const counts = (Store.data.ui && Store.data.ui.reactionUse) || {};
      const sorted = this.REACTIONS.filter((e2) => counts[e2]).sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
      const rest = this.REACTIONS.filter((e2) => !counts[e2]);
      const top = sorted.concat(rest).slice(0, 4);
      // fallback estável = os 4 primeiros do catálogo
      return top.length >= 4 ? top : ['❤️', '✨', '🌸', '😊'];
    },
    _bumpReactionUse(emoji) {
      Store.data.ui = Store.data.ui || {};
      const c = Store.data.ui.reactionUse || (Store.data.ui.reactionUse = {});
      c[emoji] = (c[emoji] || 0) + 1;
      Store.save();
    },
    // html das pills na bolha — marca as que o usuário atual reagiu
    _reactionsHtml(n) {
      if (!n.reactions || !Object.keys(n.reactions).length) return '';
      const me = Store.getUserId();
      const emojis = Object.keys(n.reactions).filter((k) => n.reactions[k] && n.reactions[k].length);
      if (!emojis.length) return '';
      const pills = emojis.map((e2) => {
        const mine = n.reactions[e2].includes(me);
        const count = n.reactions[e2].length;
        return `<button type="button" class="rx-pill${mine ? ' mine' : ''}" data-rx="${e2}" title="${count} reação${count !== 1 ? 'es' : ''}">${e2}${count > 1 ? `<span class="rx-n">${count}</span>` : ''}</button>`;
      }).join('');
      return `<div class="bubble-reactions">${pills}</div>`;
    },
    toggleReaction(clientId, emoji) {
      const tid = this.activeThread;
      const updated = Store.toggleReaction(tid, clientId, emoji);
      if (!updated) return;
      this._bumpReactionUse(emoji);
      // sync de reações (P0): envia o mapa completo do estado local — o merge no
      // outro device é por usuário/emoji, então enviar tudo é seguro e simples
      Sync.send('note:reactions', { threadId: tid, clientId, reactions: Store.reactionsOf(tid, clientId) });
      Sound.playName('toggle');
      haptic('light');
      this._replaceBubble(clientId, updated);
    },

    // ---------- Popover de ações da mensagem ----------
    bindMsgPopover() {
      const p = this.dom.msgPopover;
      // fecha em qualquer clique fora
      document.addEventListener('click', (e) => {
        if (p.classList.contains('hidden')) return;
        if (p.contains(e.target) || e.target.classList && e.target.classList.contains('msg-toggle')) return;
        p.classList.add('hidden');
      });
      // ação
      p.addEventListener('click', (e) => {
        // reações (quick e do picker): não fecham o popover (permite reagir com várias)
        const rb = e.target.closest('.rp-react');
        if (rb && rb.dataset.react) { this.toggleReaction(this.popoverClientId, rb.dataset.react); this._syncReactionButtons(p, this.popoverClientId); return; }
        const b = e.target.closest('button'); if (!b || !b.dataset.msg) return;
        const act = b.dataset.msg;
        // + abre a vista picker (preenchendo a grade); ← volta pro menu
        if (act === 'react-more') { this._openReactionPicker(p); return; }
        if (act === 'react-back') { this._showRpView(p, 'menu'); return; }
        const cid = this.popoverClientId;
        p.classList.add('hidden');
        this._showRpView(p, 'menu'); // próxima abertura começa no menu
        if (!cid) return;
        if (act === 'edit') this.editNoteInline(cid);
        else if (act === 'delete') this.confirmDeleteNote(cid);
        else if (act === 'pin' || act === 'unpin') this.togglePin(cid);
        else if (act === 'tags') this.editTags(cid);
        else if (act === 'copy') this.copyNote(cid);
        else if (act === 'remind') this.showReminderModal(cid);
        else if (act === 'cancel-remind') this.cancelReminder(cid);
      });
    },
    // reflete as reações atuais da nota nos botões do popover (quick + picker)
    _syncReactionButtons(p, clientId) {
      const n = (Store.notesFor(this.activeThread) || []).find((x) => x.clientId === clientId);
      const me = Store.getUserId();
      p.querySelectorAll('.rp-react').forEach((b) => {
        const on = !!(n && n.reactions && n.reactions[b.dataset.react] && n.reactions[b.dataset.react].includes(me));
        b.classList.toggle('active', on);
      });
    },
    // troca entre as vistas menu/picker do popover de mensagem
    _showRpView(p, view) {
      p.querySelectorAll('.rp-view').forEach((v) => v.classList.toggle('hidden', v.dataset.rpView !== view));
      // reposiciona: a altura muda entre vistas e o clamp precisa recalcular
      if (!p.classList.contains('hidden')) this._clampMsgPopover(p);
    },
    _openReactionPicker(p) {
      const grid = p.querySelector('#rp-grid');
      grid.innerHTML = this.REACTIONS.map((e2) => `<button type="button" class="rp-react rp-grid-it" data-react="${e2}" aria-label="Reagir com ${e2}">${e2}</button>`).join('');
      this._syncReactionButtons(p, this.popoverClientId);
      this._showRpView(p, 'picker');
    },
    _clampMsgPopover(p) {
      const pw = p.offsetWidth, ph = p.offsetHeight;
      let left = parseFloat(p.style.left) || 8;
      let top = parseFloat(p.style.top) || 8;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
      p.style.left = Math.round(left) + 'px';
      p.style.top = Math.round(top) + 'px';
    },
    openMsgPopover(bubbleEl, note) {
      const p = this.dom.msgPopover;
      this.popoverClientId = note.clientId;
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === note.clientId;
      const hasRemind = !!(note.remindAt && !note.remindFired);
      p.querySelector('[data-msg="pin"]').classList.toggle('hidden', isPinned);
      p.querySelector('[data-msg="unpin"]').classList.toggle('hidden', !isPinned);
      p.querySelector('[data-msg="cancel-remind"]').classList.toggle('hidden', !hasRemind);
      // quick row dinâmica: reflete as reações mais usadas pelo usuário
      const quick = this._quickReactions();
      const row = p.querySelector('.rp-row');
      const btns = quick.map((e2) => `<button type="button" class="rp-react" data-react="${e2}" aria-label="Reagir com ${e2}">${e2}</button>`).join('');
      row.innerHTML = btns + '<button type="button" class="rp-more" data-msg="react-more" title="Mais reações" aria-label="Mais reações">+</button>';
      this._showRpView(p, 'menu'); // sempre abre no menu
      this._syncReactionButtons(p, note.clientId);
      p.classList.remove('hidden');
      // posicionar perto do bubble, ancorado à seta ▾ — medição REAL do popover
      // (ph estimado estourava em telas baixas/cliques no fim da conversa) e
      // clamps nos DOIS eixos: popover 100% dentro da janela, sempre
      const r = bubbleEl.getBoundingClientRect();
      const pw = p.offsetWidth, ph = p.offsetHeight;
      let left = r.right - pw + 30; // alinha canto direito
      let top = r.bottom + 6;
      if (top + ph > window.innerHeight - 8) {
        // não cabe embaixo → abre pra cima; ainda não cabe? encosta no chão
        top = r.top - ph - 6;
        if (top < 8) top = Math.max(8, window.innerHeight - ph - 8);
      }
      if (left < 8) left = 8;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      p.style.left = Math.round(left) + 'px';
      p.style.top = Math.round(top) + 'px';
    },

    // ---------- Long-press (mobile) ----------
};
