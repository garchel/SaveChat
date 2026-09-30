// Edição, exclusão, cópia, etiquetas, pin e preview de nota citada.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { fmtTime, haptic, esc, $, hideWithExit } from '../utils.js';

export const MessagesEditMethods = {
    _replaceBubble(clientId, note) {
      const fresh = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (fresh) fresh.replaceWith(this.bubbleEl(note));
    },
    editNoteInline(clientId) {
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (!el || el.isContentEditable) return;
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const meta = el.querySelector('.meta'); const toggle = el.querySelector('.msg-toggle');
      const pinBadge = el.querySelector('.pin-badge');
      // guarda meta/toggle/badge FORA da bolha durante a edição — assim só o corpo é editável
      this._editDetached = [];
      [meta, toggle, pinBadge].forEach((x) => { if (x) { this._editDetached.push(x); x.remove(); } });
      el.setAttribute('contenteditable', 'true');
      el.classList.add('editing');
      el.textContent = n.text;
      if (pinBadge) { this._editDetached.unshift(pinBadge); }

      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);

      let done = false;
      const finish = (save) => {
        if (done) return; done = true; // Enter + blur disparavam 2× (timer duplicado)
        el.removeAttribute('contenteditable');
        el.classList.remove('editing');
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('blur', onBlur);
        // recoloca meta/toggle/badge que foram guardados fora durante a edição
        // (só se a bolha não for substituída — _replaceBubble re-renderiza tudo)
        if (this._editDetached && this._editDetached.length) {
          this._editDetached.forEach((x) => { if (x && !el.contains(x)) { if (x.classList.contains('pin-badge')) el.insertBefore(x, el.firstChild); else el.appendChild(x); } });
          this._editDetached = null;
        }
        if (save) {
          // serializa o CLONE (meta/toggle/badge removidos) — o elemento vivo teve os
          // meta re-anexados acima, e serializá-los corrompia a nota com a hora dentro
          const clone = el.cloneNode(true);
          clone.querySelectorAll('.meta,.msg-toggle,.pin-badge').forEach((r) => r.remove());
          // serializa via _editorText (markdown): preserva quebras, **bold**, listas
          // e os prefixos [ ]/[x] — antes textContent destruíam checklists na edição
          const v = this._editorText(clone);
          if (v && v !== n.text) {
            const updated = Store.editNote(this.activeThread, clientId, v);
            if (updated) {
              Sync.send('note:edit', { threadId: this.activeThread, clientId, text: updated.text, edited: updated.edited, editedAt: updated.editedAt, rev: updated.rev });
              this.renderedClientIds.delete(clientId);
              this._editDetached = null; // bolha será re-renderizada do zero
              this._replaceBubble(clientId, Store.notesFor(this.activeThread).find((x) => x.clientId === clientId) || updated);
              return;
            }
          }
        }
        this.renderedClientIds.delete(clientId);
        this._replaceBubble(clientId, n);
      };
      const onKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && e.shiftKey) {
          // Shift+Enter na edição: continua a lista da linha atual — checklist
          // ([ ] automático), bullet (- ) ou numerada (n+1.); fora de lista, quebra simples
          e.preventDefault();
          const sel = getSelection();
          if (!sel.rangeCount) return;
          const cr = sel.getRangeAt(0).cloneRange();
          cr.selectNodeContents(el);
          cr.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
          // range.toString() ignora <br> — converte via cloneContents para a
          // detecção de linha funcionar após continuações seguidas
          const fragTxt = (node) => {
            let s = '';
            for (const c of node.childNodes) {
              if (c.nodeType === 3) s += c.textContent;
              else if (c.tagName === 'BR') s += '\n';
              else s += fragTxt(c);
            }
            return s;
          };
          const upto = fragTxt(cr.cloneContents());
          const nl = upto.lastIndexOf('\n');
          const lineStart = nl >= 0 ? upto.slice(nl + 1) : upto;
          let prefix = null;
          let m;
          if ((m = lineStart.match(/^\s*\[( |x)\]\s/i))) prefix = '[ ] ';
          else if ((m = lineStart.match(/^\s*(\d+)([.)])\s/))) prefix = (parseInt(m[1], 10) + 1) + m[2] + ' ';
          else if (/^\s*-\s+/.test(lineStart)) prefix = '- ';
          // insere <br> + prefixo via Range: determinístico, sem depender de execCommand/foco
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement('br');
          range.insertNode(br);
          range.setStartAfter(br);
          if (prefix) {
            const t = document.createTextNode(prefix);
            range.insertNode(t);
            range.setStart(t, prefix.length);
          }
          range.collapse(true);
          sel.removeAllRanges(); sel.addRange(range);
        }
      };
      const onBlur = () => finish(true);
      el.addEventListener('keydown', onKey);
      el.addEventListener('blur', onBlur);
      setTimeout(() => el.focus(), 20);
    },
    confirmDeleteNote(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const body = `<p class="del-note-hint">A nota será excluída permanentemente. Você poderá desfazer por 10 segundos após excluir.</p>`;
      this.showModal('Excluir nota', body, () => {
        this.closeModal();
        this.deleteNote(clientId);
        Sound.play('delete'); haptic('delete');
      });
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
    },
    async copyNote(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const text = n.text || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
        else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        this.toast('Nota copiada', { kind: 'success' });
        Sound.play('copy');
      } catch (e) {
        this.toast('Não foi possível copiar', { kind: 'info' });
      }
    },
    editTags(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const cur = (n.tags || []).join(', ');
      const body = `<label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Etiquetas (separadas por vírgula)</label>
        <input id="tag-input" type="text" placeholder="ex: trabalho, urgente, ideia" value="${esc(cur)}" autofocus />
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px">Use <b>#tag</b> na busca para filtrar.</div>`;
      this.showModal('Etiquetas da nota', body, () => {
        const val = ($('#tag-input').value || '').split(',').map((s) => s.trim()).filter(Boolean);
        const updated = Store.setTags(this.activeThread, clientId, val);
        if (updated) {
          Sync.send('note:tags', { threadId: this.activeThread, clientId, tags: updated.tags });
          this.renderedClientIds.delete(clientId);
          this._replaceBubble(clientId, updated);
        }
        this.closeModal();
      });
    },
    togglePin(clientId) {
      const th = Store.getThread(this.activeThread); if (!th) return;
      const newPin = Store.setPinned(this.activeThread, clientId);
      // envia estado EXPLÍCITO (evita recomputar errado após flip local)
      Sync.send('note:pin', { threadId: this.activeThread, clientId, pinned: newPin != null });
      // re-render mensagens (para atualizar borda dourada + badge) + header
      this.renderedClientIds = new Set();
      this.renderMessages(true);
      this.updatePinButton();
      // A3 delight: badge dourado popa com ease-out-back ao fixar
      if (newPin != null) {
        const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
        if (el) { el.classList.add('pin-anim'); setTimeout(() => el.classList.remove('pin-anim'), 400); }
      }
      Sound.play('pin'); haptic('medium');
    },

    // ---------- Botão de pin no header ----------
    bindPinButton() {
      this.dom.btnPin.addEventListener('click', (e) => { e.stopPropagation(); this.togglePinPopover(); });
      document.addEventListener('click', (e) => {
        if (!this.dom.pinPopover.classList.contains('hidden')) {
          if (!this.dom.pinPopover.contains(e.target) && e.target !== this.dom.btnPin) {
            this.dom.pinPopover.classList.add('hidden');
          }
        }
      });
    },
    updatePinButton() {
      const th = Store.getThread(this.activeThread);
      const pinned = th ? Store.getPinned(this.activeThread) : null;
      this.dom.btnPin.classList.toggle('hidden', !th);
      this.dom.btnPin.classList.toggle('has-pin', !!pinned);
      // sem pin: botão fica esmaecido (indisponível), mas clicável p/ mostrar aviso no mobile
      this.dom.btnPin.classList.toggle('no-pin', !pinned);
      // tooltip nativo no desktop; no mobile o aviso vem via toast no clique
      this.dom.btnPin.title = pinned
        ? 'Mensagem fixada'
        : 'Nenhuma mensagem fixada ainda — use o menu ⋮ de uma nota para fixá-la';
    },
    togglePinPopover() {
      const th = Store.getThread(this.activeThread);
      const pinned = th ? Store.getPinned(this.activeThread) : null;
      if (!pinned) {
        this.dom.pinPopover.classList.add('hidden');
        // desktop: tooltip nativo; mobile: toast explicativo
        if (window.matchMedia('(hover: none)').matches) {
          this.toast('📌 Nenhuma mensagem fixada ainda. Pine uma mensagem pelo menu ⋮ da nota.', { kind: 'info', duration: 3500 });
        }
        return;
      }
      // fecha o preview de nota se aberto
      this.closeNotePreview();
      // toggle: se já está aberto, fecha (M2: com animação de saída)
      if (!this.dom.pinPopover.classList.contains('hidden')) { hideWithExit(this.dom.pinPopover); return; }
      // preenche conteúdo
      this.dom.pinBody.innerHTML = `<div>${esc(pinned.text)}</div><span class="ts">${fmtTime(pinned.ts)}${pinned.edited ? ' · editada' : ''}</span>`;
      this.dom.pinPopover.dataset.clientId = pinned.clientId;
      this.dom.pinPopover.classList.remove('hidden');
      // posiciona na coluna esquerda do fluxo (abaixo do botão pin), até 30% da largura
      const r = this.dom.btnPin.getBoundingClientRect();
      const pw = Math.min(Math.max(280, window.innerWidth * 0.3), window.innerWidth - 24);
      let left = r.left;
      let top = r.bottom + 8;
      if (left < 8) left = 8;
      if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
      this.dom.pinPopover.style.left = left + 'px';
      this.dom.pinPopover.style.top = top + 'px';
      this.dom.pinPopover.style.width = pw + 'px';
    },
    // ---------- Preview de nota linkada (@[...](t:id)) ----------
    // card estilo pin popover, fixo na coluna esquerda, SEM botão "abrir" (abre por duplo clique)
    showNotePreview(threadId) {
      const th = Store.getThread(threadId);
      if (!th) return;
      const notes = Store.notesFor(threadId) || [];
      const last = notes.length ? notes[notes.length - 1] : null;
      const pop = document.getElementById('note-preview');
      if (!pop) return;
      document.getElementById('np-thread').textContent = th.name || 'Nota';
      const body = last
        ? esc((last.text || '').replace(/^(\s*)\[( |x)\]\s*/gm, '').slice(0, 260))
        : '<em>Conversa vazia — nenhuma mensagem ainda.</em>';
      document.getElementById('np-body').innerHTML = `<div>${body}</div>`;
      const closeBtn = document.getElementById('np-close');
      if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.addEventListener('click', () => this.closeNotePreview());
        closeBtn.dataset.bound = '1';
      }
      // botão "Abrir nota" do preview → abre a thread da menção
      pop.dataset.tid = threadId;
      const openBtn = document.getElementById('np-open');
      if (openBtn && !openBtn.dataset.bound) {
        openBtn.addEventListener('click', () => {
          const tid = document.getElementById('note-preview').dataset.tid;
          this.closeNotePreview();
          if (tid) this.openThread(tid);
        });
        openBtn.dataset.bound = '1';
      }
      pop.classList.remove('hidden');
    },
    closeNotePreview() {
      const pop = document.getElementById('note-preview');
      if (pop) pop.classList.add('hidden');
    },
    bindPinPopover() {
      this.dom.pinPopover.querySelector('#pin-jump').addEventListener('click', () => {
        const cid = this.dom.pinPopover.dataset.clientId;
        this.dom.pinPopover.classList.add('hidden');
        if (!cid) return;
        const el = document.querySelector(`.bubble[data-client-id="${cid}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      });
      this.dom.pinPopover.querySelector('#pin-edit').addEventListener('click', () => {
        const cid = this.dom.pinPopover.dataset.clientId;
        this.dom.pinPopover.classList.add('hidden');
        this.editNoteInline(cid);
      });
      this.dom.pinPopover.querySelector('#pin-unpin').addEventListener('click', () => {
        const cid = this.dom.pinPopover.dataset.clientId;
        this.dom.pinPopover.classList.add('hidden');
        this.togglePin(cid);
      });
    },

    // indicador de carregamento: SLOT RESERVADO no topo do fluxo
    // (#load-slot, no HTML) — o espaço existe SEMPRE (como o pull-indicator);
    // mostrar/esconder só liga/desliga a classe .loading. Layout idêntico nos
    // dois estados = flick de layout impossível, e as mensagens nunca alcançam
    // nem ficam sob o indicador
};
