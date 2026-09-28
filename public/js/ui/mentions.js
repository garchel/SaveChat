import { esc } from '../utils.js';
import { Store } from '../store.js';

export const MentionMethods = {
_mentionToken(ta) {
      // retorna {start(el texto), query} se o caret está logo após "@texto"
      const sel = getSelection();
      if (!sel.rangeCount || !ta.contains(sel.anchorNode)) return null;
      const range = sel.getRangeAt(0);
      // caminho de texto desde o início do bloco atual até o caret
      const block = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const blk = block && (block.closest && (block.closest('#composer-input > div, #composer-input > ul, #composer-input > ol, #composer-input > .md-check') || block));
      if (!blk || !ta.contains(blk)) return null;
      const pre = document.createRange();
      pre.selectNodeContents(blk);
      pre.setEnd(range.startContainer, range.startOffset);
      const before = pre.toString();
      const m = before.match(/(?:^|\s)@([^\s@]{0,30})$/);
      if (!m) return null;
      // posição real do "@" dentro do bloco: reconstrói o range até o "@"
      const atRange = document.createRange();
      atRange.selectNodeContents(blk);
      atRange.setEnd(range.startContainer, range.startOffset);
      // recua o fim do range até depois do "@" (m[0].length trás "@query")
      let tail = m[0];
      const shrink = () => {
        const txt = atRange.toString();
        while (!txt.endsWith(tail) && (atRange.endContainer.nodeType !== 3 || atRange.endOffset > 0)) {
          // move o fim para trás caractere a caractere
          if (atRange.endContainer.nodeType === 3 && atRange.endOffset > 0) atRange.setEnd(atRange.endContainer, atRange.endOffset - 1);
          else break;
        }
      };
      shrink();
      return { query: m[1], atRange };
    },
    _initMentions(ta) {
      let dd = document.getElementById('mention-dd');
      if (!dd) {
        dd = document.createElement('div');
        dd.id = 'mention-dd';
        dd.className = 'mention-dd hidden';
        document.body.appendChild(dd);
      }
      const close = () => dd.classList.add('hidden');
      this._mentionClose = close;

      const render = (token) => {
        const q = token.query.toLowerCase();
        const list = Store.threadList()
          .filter((t) => !q || (t.name || '').toLowerCase().includes(q))
          .slice(0, 6);
        if (!list.length) { close(); return; }
        dd.innerHTML = list.map((t, i) =>
          `<button type="button" class="mention-opt${i === 0 ? ' sel' : ''}" data-tid="${t.id}" data-name="${esc(t.name)}">${esc(t.emoji || '💬')} ${esc(t.name)}</button>`
        ).join('');
        dd.classList.remove('hidden');
        const r = ta.getBoundingClientRect();
        dd.style.left = Math.max(8, r.left) + 'px';
        dd.style.bottom = (window.innerHeight - r.top + 6) + 'px';
        dd.style.top = 'auto';
        dd.querySelectorAll('.mention-opt').forEach((b) => b.addEventListener('mousedown', (e) => {
          e.preventDefault(); // evita blur do editor
          const token = this._mentionToken(ta);
          if (token) this._insertMention(ta, token, b.dataset.tid, b.dataset.name);
          close();
        }));
      };

      ta.addEventListener('input', () => {
        const token = this._mentionToken(ta);
        token ? render(token) : close();
      });
      ta.addEventListener('keydown', (e) => {
        if (dd.classList.contains('hidden')) return;
        const opts = Array.from(dd.querySelectorAll('.mention-opt'));
        let cur = opts.findIndex((o) => o.classList.contains('sel'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); e.stopImmediatePropagation();
          cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
          opts.forEach((o) => o.classList.remove('sel'));
          opts[cur].classList.add('sel');
        } else if (e.key === 'Enter') {
          e.preventDefault(); e.stopImmediatePropagation(); // não envia a nota
          const token = this._mentionToken(ta);
          const b = opts[Math.max(0, cur)];
          if (token) this._insertMention(ta, token, b.dataset.tid, b.dataset.name);
          close();
        } else if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      }, true); // capture: roda antes do handler de envio
      ta.addEventListener('blur', () => setTimeout(close, 120));
    },
    _insertMention(ta, token, tid, name) {
      // apaga "@query" (range do token) e insere o chip
      const r = token.atRange;
      r.deleteContents();
      const chip = document.createElement('span');
      chip.setAttribute('data-mention', ''); chip.setAttribute('data-tid', tid);
      chip.textContent = '@' + name;
      r.insertNode(chip);
      // espaço depois do chip para o caret continuar no fluxo
      const sp = document.createTextNode('\u00a0');
      chip.after(sp);
      const sel = getSelection();
      const range = document.createRange();
      range.setStart(sp, 1); range.collapse(true);
      sel.removeAllRanges(); sel.addRange(range);
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },

    // ---------- Lembretes (Notification API) ----------
    async _ensureNotifPermission() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const p = await Notification.requestPermission();
      return p === 'granted';
    },
};

