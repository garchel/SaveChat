// Composer da conversa — binding do campo, anexos/imagens e envio de texto.
// As partes especializados vivem em arquivos vizinhos e entram no UI
// pelo mesmo Object.assign (ver app.js).
import { Store } from '../store.js';
import { Sync, getSupa, USE_SUPABASE } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { uid, now, fmtTime, haptic, esc, $ } from '../utils.js';

export const ComposerMethods = {
    showSyncError() {
      const b = $('#sync-error-banner');
      if (b) b.classList.remove('hidden');
    },
    hideSyncError() {
      const b = $('#sync-error-banner');
      if (b) b.classList.add('hidden');
    },
    bindComposer() {
      const ta = $('#composer-input'), send = $('#btn-send');
      // auto-resize: cresce com o conteúdo até ~60vh, depois ativa scroll interno
      const MAX_VH = 0.60;
      const resize = () => {
        ta.style.height = 'auto';
        const maxH = Math.floor(window.innerHeight * MAX_VH);
        if (this._editorText(ta) === '') {
          ta.style.height = '';
          ta.style.overflowY = 'hidden';
          return;
        }
        const target = Math.min(ta.scrollHeight, maxH);
        ta.style.height = target + 'px';
        ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
      };
      // reset garantido do tamanho (após envio): zero estado inline, altura volta ao mínimo
      // e o overflowY NUNCA fica 'auto' no editor vazio (senão o fieldset não encolhe de volta)
      // também sincroniza o padding do #messages na hora (o RO pode atrasar 1 frame)
      this.resetComposerSize = () => {
        ta.style.height = '';
        ta.style.overflowY = 'hidden';
        // reflow para o browser recalcular a altura mínima antes do próximo input
        void ta.offsetHeight;
        if (this._syncComposerPad) this._syncComposerPad();
      };
      // padding inferior de #messages = altura REAL do composer flutuante (+ folga).
      // Garante: última mensagem nunca escondida atrás do input e rolagem "até" o composer.
      const composerEl = ta.closest('.composer');
      const msgBox = $('#messages');
      const syncComposerPad = () => {
        if (!composerEl || !msgBox) return;
        const h = Math.ceil(composerEl.getBoundingClientRect().height);
        msgBox.style.setProperty('--composer-pad', (h + 22) + 'px');
      };
      this._syncComposerPad = syncComposerPad;
      syncComposerPad();
      if (window.ResizeObserver && composerEl) new ResizeObserver(syncComposerPad).observe(composerEl);
      window.addEventListener('resize', syncComposerPad);
      // sync a cada render de mensagens (garante pad correto mesmo se o RO atrasar — aba 2º plano)
      const origRender = this.renderMessages;
      this.renderMessages = function (...a) { syncComposerPad(); return origRender.apply(this, a); };
      ta.addEventListener('input', () => { resize(); this._updateSendAudioState(ta, send); });
      // retry inline do banner de sync
      const retryBtn = $('#sync-retry');
      if (retryBtn) retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true; retryBtn.textContent = 'Conectando…';
        try { if (Sync.ws) Sync.ws.close(); } catch {}
        Sync.connect();
        setTimeout(() => { retryBtn.disabled = false; retryBtn.textContent = 'Tentar agora'; }, 2500);
      });
      // autocomplete de menções @ (registrado ANTES do keydown de envio p/ interceptar Enter)
      this._initMentions(ta);
      window.addEventListener('resize', () => resize());
      // inicializa com estado correto (evita scrollbar fantasma no carregamento)
      resize();
      ta.addEventListener('focus', () => {
        setTimeout(() => { ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 300);
      });
      // visualViewport: quando teclado virtual muda altura, mantém composer visível
      if (window.visualViewport) {
        let lastH = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', () => {
          const curH = window.visualViewport.height;
          if (curH < lastH - 80 && document.activeElement === ta) {
            setTimeout(() => ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
          }
          lastH = curH;
        });
      }
      // pull-to-refresh nos messages (puxar topo recarrega)
      this._initPullToRefresh();
      // colar markdown → converte para o editor WYSIWYG (listas, checklists,
      // **negrito**, *itálico*, `code`) em vez de colar texto puro com marcas
      ta.addEventListener('paste', (e) => {
        const cd = e.clipboardData;
        if (!cd) return; // deixa o native (inclui colar imagem)
        if ((cd.types || []).includes('text/html')) return; // já vem rico: nativo
        const txt = cd.getData('text/plain');
        if (!txt || !this._looksLikeMarkdown(txt)) return; // texto comum: nativo
        e.preventDefault();
        this._ensureSelection(ta);
        const frag = this._mdToFrag(txt);
        const sel = getSelection();
        if (sel.rangeCount) {
          const r = sel.getRangeAt(0);
          r.deleteContents();
          r.insertNode(frag);
          r.collapse(false);
          sel.removeAllRanges(); sel.addRange(r);
        } else {
          ta.appendChild(frag);
          this._caretEnd(ta);
        }
        resize();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      ta.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); this.applyFormat('bold'); }
        else if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); this.applyFormat('italic'); }
        else if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.applyFormat('code'); }
        else if (mod && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.applyFormat('checklist'); }
        else if (e.key === 'Tab') {
          // Tab/Shift+Tab dentro de lista: indentar/desindentar o item (sub-listas)
          if (!this._caretList(ta)) return; // fora de lista: Tab normal (foco)
          e.preventDefault();
          if (e.shiftKey) this._listOutdent(ta); else this._listIndent(ta);
        }
        else if (e.key === 'Enter' && !e.shiftKey) {
          // mobile: Enter também continua listas (desktop usa Shift+Enter p/ enviar)
          const isTouch = window.matchMedia('(hover: none)').matches;
          if (isTouch && this._listContinuation(ta)) { e.preventDefault(); return; }
          e.preventDefault(); this.sendNote();
        }
        else if (e.key === 'Enter' && e.shiftKey) {
          // Shift+Enter: quebra linha; se a linha atual é item de checklist, bullet
          // ou lista numerada, continua a lista na próxima linha
          e.preventDefault();
          this._listContinuation(ta);
        }
      });
      // barra de formatação
      document.querySelectorAll('.fmt-btn').forEach((b) => b.addEventListener('click', () => this.applyFormat(b.dataset.fmt)));
      // botões bold/italic refletem o estilo na posição do caret (setas/clique)
      document.addEventListener('selectionchange', () => {
        if (document.activeElement === ta) this._updateFmtToggleUI(ta);
      });
      // botão único send/áudio: em modo áudio grava; com texto envia
      send.addEventListener('click', () => {
        if (this._audioMode) { this._startAudioRecording(send); return; }
        if (this._recording) return;
        this.sendNote();
      });
      // estado inicial do botão (microfone quando vazio)
      this._updateSendAudioState(ta, send);
      // anexos
      const attach = this.dom.btnAttach, fileInput = this.dom.fileInput, prev = this.dom.attachPreview;
      attach.addEventListener('click', () => fileInput.click());
      // compressão client-side via canvas (1280px, 0.7) antes do upload
      const compressImage = (file) => new Promise((resolve) => {
        if (!file.type.startsWith('image/')) return resolve(file);
        const img = new Image();
        img.onload = () => {
          const max = 1280, q = 0.7;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            if (w > h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(img.src);
            resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file);
          }, 'image/jpeg', q);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      });
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { alert('Imagem muito grande (máx 5 MB).'); fileInput.value = ''; return; }
        send.disabled = true;
        const fileToUpload = await compressImage(f);
        if (USE_SUPABASE) {
          try {
            const supa = await getSupa();
            const { data: { session } } = await supa.auth.getSession();
            const uid = session && session.user ? session.user.id : null;
            if (uid) {
              const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const path = `${uid}/${Date.now()}-${safeName}`;
              const { error } = await supa.storage.from('note-images').upload(path, fileToUpload, { cacheControl: '3600', upsert: false });
              if (!error) {
                const { data } = supa.storage.from('note-images').getPublicUrl(path);
                this.pendingImages.push(data.publicUrl);
                this.renderAttachPreview();
                send.disabled = false;
                fileInput.value = '';
                return;
              }
            }
          } catch (e) { console.warn('[storage] upload fail, fallback base64', e); }
        }
        const reader = new FileReader();
        reader.onload = () => { this.pendingImages.push(reader.result); this.renderAttachPreview(); send.disabled = false; };
        reader.readAsDataURL(fileToUpload);
        fileInput.value = '';
      });
      this.attachPreview = prev;
      this.setupInfiniteScroll();
    },
    _initPullToRefresh() {
      const box = $('#messages'); if (!box) return;
      // cria indicador visual (ícone + texto) no topo do container
      let indicator = document.getElementById('pull-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'pull-indicator';
        indicator.className = 'pull-indicator hidden';
        indicator.innerHTML = '<div class="pull-spinner"></div><span class="pull-text">Puxe para atualizar</span>';
        box.prepend(indicator);
      }
      const spinner = indicator.querySelector('.pull-spinner');
      const text = indicator.querySelector('.pull-text');
      let startY = 0, pulling = false, threshold = 75, triggered = false;

      const reset = () => {
        box.style.transform = '';
        box.style.transition = 'transform .25s ease';
        indicator.classList.add('hidden');
        indicator.style.opacity = '0';
        if (spinner) spinner.style.transform = 'rotate(0deg)';
        startY = 0; pulling = false; triggered = false;
        if (text) text.textContent = 'Puxe para atualizar';
      };

      box.addEventListener('touchstart', (e) => {
        if (box.scrollTop <= 2) startY = e.touches[0].clientY;
      }, { passive: true });

      box.addEventListener('touchmove', (e) => {
        if (!startY || box.scrollTop > 2) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 10) return;
        // impede scroll nativo quando puxando no topo
        if (dy > 20) e.preventDefault();
        const pull = Math.min(80, Math.max(0, dy - 10));
        pulling = pull > 20;
        triggered = pull >= threshold;
        box.style.transform = `translateY(${pull / 2.2}px)`;
        box.style.transition = 'none';
        indicator.classList.remove('hidden');
        indicator.style.opacity = Math.min(1, pull / 50).toString();
        if (spinner) spinner.style.transform = `rotate(${pull * 4}deg)`;
        if (text) {
          text.textContent = triggered ? 'Solte para atualizar' : 'Puxe para atualizar';
          text.style.fontWeight = triggered ? '700' : '600';
          text.style.color = triggered ? 'var(--accent)' : 'var(--text-dim)';
        }
        if (triggered) indicator.classList.add('ready');
        else indicator.classList.remove('ready');
      }, { passive: false });

      const doRefresh = async () => {
        if (text) text.textContent = 'Atualizando…';
        if (spinner) spinner.classList.add('spinning');
        // tenta refresh suave via Supabase antes de recarregar a página
        try {
          if (Sync && Sync.connected && Sync.loadSnapshot) {
            await Sync.loadSnapshot();
            this.renderTree();
            if (this.activeThread) this.renderMessages(true);
            this.toast('Atualizado', { kind: 'success' });
          } else {
            location.reload();
            return;
          }
        } catch {
          location.reload();
          return;
        } finally {
          if (spinner) spinner.classList.remove('spinning');
        }
        reset();
      };

      box.addEventListener('touchend', () => {
        if (triggered) {
          box.style.transform = 'translateY(18px)';
          box.style.transition = 'transform .2s ease';
          doRefresh();
        } else {
          reset();
        }
      }, { passive: true });
      box.addEventListener('touchcancel', reset, { passive: true });
    },
    renderAttachPreview() {
      const prev = this.dom.attachPreview;
      if (!((this.pendingImages||[]).length)) { prev.classList.add('hidden'); prev.innerHTML = ''; return; }
      prev.innerHTML = this.pendingImages.map((src, i) =>
        `<div class="attach-thumb"><img src="${src}" alt="anexo"/><button class="attach-rm" data-i="${i}" title="Remover">×</button></div>`
      ).join('');
      prev.classList.remove('hidden');
      prev.querySelectorAll('.attach-rm').forEach((b) => b.addEventListener('click', () => {
        this.pendingImages.splice(+b.dataset.i, 1); this.renderAttachPreview();
      }));
    },

bindThreadTitle() {
      const name = $('#chat-name');
      name.addEventListener('click', () => this.editThreadTitleInline());
      name.setAttribute('title', 'Clique para renomear');
      name.style.cursor = 'text';
    },    bindTreeDnd() {
      const tree = this.dom.tree;
      this._dragId = null; // { type:'thread'|'folder', id }
      const clearMarks = () => tree.querySelectorAll('.dnd-over,.dnd-over-folder,.dnd-above,.dnd-below').forEach((e) => e.classList.remove('dnd-over', 'dnd-over-folder', 'dnd-above', 'dnd-below'));
      // chip flutuante que segue o cursor mostrando ONDE a nota vai cair
      const chip = document.createElement('div');
      chip.className = 'dnd-chip hidden';
      document.body.appendChild(chip);
      const setChip = (html, x, y) => {
        if (html === null) { chip.classList.add('hidden'); return; }
        if (chip.innerHTML !== html) chip.innerHTML = html;
        chip.classList.remove('hidden');
        chip.style.left = x + 'px';
        chip.style.top = y + 'px';
      };
      const icoInto = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>';
      const icoAbove = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/></svg>';
      const icoBelow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
      const dragend = () => { clearMarks(); setChip(null, 0, 0); };
      tree.addEventListener('dragstart', (e) => {
        const node = e.target.closest('.tnode'); if (!node) return;
        if (node.dataset.tid) { this._dragId = { type: 'thread', id: node.dataset.tid }; e.dataTransfer.effectAllowed = 'move'; }
        else if (node.dataset.fid) { this._dragId = { type: 'folder', id: node.dataset.fid }; e.dataTransfer.effectAllowed = 'move'; }
        else return;
        node.classList.add('dnd-dragging');
        e.dataTransfer.setData('text/plain', this._dragId.id);
      });
      tree.addEventListener('dragend', () => {
        tree.querySelectorAll('.dnd-dragging').forEach((e) => e.classList.remove('dnd-dragging'));
        dragend();
      });
      tree.addEventListener('dragover', (e) => {
        if (!this._dragId) return;
        e.preventDefault();
        clearMarks();
        const folder = e.target.closest('.folder-node');
        const tnode = e.target.closest('.tnode:not(.folder-node)');
        const name = (el) => el.querySelector('.label') ? el.querySelector('.label').textContent : el.textContent.trim().slice(0, 24);
        if (folder && folder.dataset.fid !== this._dragId.id) {
          folder.classList.add('dnd-over-folder');
          setChip(`${icoInto} Mover para “${esc(name(folder))}”`, e.clientX, e.clientY);
        } else if (tnode && tnode.dataset.tid && tnode.dataset.tid !== this._dragId.id) {
          const r = tnode.getBoundingClientRect();
          const before = (e.clientY < r.top + r.height / 2);
          tnode.classList.add(before ? 'dnd-above' : 'dnd-below');
          const nm = esc(name(tnode));
          setChip(before ? `${icoAbove} Antes de “${nm}”` : `${icoBelow} Depois de “${nm}”`, e.clientX, e.clientY);
        } else if (e.target === tree || (e.target.classList && e.target.classList.contains('tree'))) {
          setChip(`${icoBelow} Soltar na raiz`, e.clientX, e.clientY);
        } else {
          setChip(null, 0, 0);
        }
      });
      tree.addEventListener('dragleave', (e) => {
        // só limpa o chip se o cursor saiu da árvore de verdade (não trocou de filho)
        if (!tree.contains(e.relatedTarget)) setChip(null, 0, 0);
      });
      tree.addEventListener('drop', (e) => {
        if (!this._dragId) return;
        e.preventDefault();
        const folder = e.target.closest('.folder-node');
        const tnode = e.target.closest('.tnode:not(.folder-node)');
        clearMarks();
        setChip(null, 0, 0);
        const drag = this._dragId; this._dragId = null;

        // mover PASTA
        if (drag.type === 'folder') {
          // (reordenação de pastas é simplificada: não implementada nesta etapa)
          return;
        }
        // mover THREAD
        if (folder && folder.dataset.fid !== drag.id) {
          Store.moveThread(drag.id, folder.dataset.fid, null);
          this.setManualSort();
          Sync.send('thread:move', { threadId: drag.id, folderId: folder.dataset.fid, beforeId: null });
          this.renderTree();
          Sound.play('move');
        } else if (tnode && tnode.dataset.tid && tnode.dataset.tid !== drag.id) {
          const targetT = Store.getThread(tnode.dataset.tid);
          const r = tnode.getBoundingClientRect();
          const before = (e.clientY < r.top + r.height / 2);
          const beforeId = before ? tnode.dataset.tid : this.nextSiblingTid(tnode);
          Store.moveThread(drag.id, targetT.folderId || null, beforeId);
          this.setManualSort();
          Sync.send('thread:move', { threadId: drag.id, folderId: targetT.folderId || null, beforeId });
          this.renderTree();
          Sound.play('move');
        } else {
          // solto na raiz (área vazia da árvore)
          const onRoot = e.target === tree || e.target.classList.contains('tree');
          if (onRoot) {
            Store.moveThread(drag.id, null, null);
            this.setManualSort();
            Sync.send('thread:move', { threadId: drag.id, folderId: null, beforeId: null });
            this.renderTree();
            Sound.play('move');
          }
        }
      });
    },

nextSiblingTid(node) {
      let sib = node.nextElementSibling;
      while (sib && (!sib.dataset || !sib.dataset.tid)) sib = sib.nextElementSibling;
      return sib ? sib.dataset.tid : null;
    },

setManualSort() {
      Store.data.ui = Store.data.ui || {};
      Store.data.ui.sort = 'manual';
      Store.save();
      // atualiza UI de ordenação ativa no settings (se aberto)
      document.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === 'manual'));
    },

editThreadTitleInline() {
      if (!this.activeThread) return;
      const t = Store.getThread(this.activeThread); if (!t) return;
      const el = $('#chat-name');
      if (el.isContentEditable) return;
      el.setAttribute('contenteditable', 'true');
      el.classList.add('editing');
      el.textContent = t.name;
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
      el.focus();
      const finish = (save) => {
        el.removeAttribute('contenteditable');
        el.classList.remove('editing');
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('blur', onBlur);
        if (save) {
          const v = el.textContent.trim();
          if (v && v !== t.name) {
            t.name = v; t.updatedAt = now(); Store.upsertThread(t);
            Sync.send('thread:upsert', t); this.renderTree();
            Sound.play('rename');
          } else { el.textContent = t.name; }
        } else { el.textContent = t.name; }
      };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      const onBlur = () => finish(true);
      el.addEventListener('keydown', onKey);
      el.addEventListener('blur', onBlur);
    },

    // ---------- Primitivas do editor WYSIWYG (contenteditable) ----------
    // Conteúdo do editor como markdown: listas viram "- "/"1. ", checklist "[ ] "/"[x] ",
    // código inline vira `...`, quebras de bloco viram \n
    sendNote() {
      const ta = $('#composer-input');
      const text = this._serialize().replace(/\u200B/g, '').trim();
      if ((!text && !(this.pendingImages && this.pendingImages.length)) || !this.activeThread) return;
      // trava anti-disparo múltiplo: o mesmo texto na mesma thread em janela de 2s
      // é descartado (Enter + clique no botão, re-binding do handler, webviews que
      // repetem o keydown) — é a causa clássica de duplicação NA HORA do envio
      const sig = this.activeThread + '\u0000' + text;
      this._lastSend = this._lastSend || { sig: '', t: 0 };
      if (sig === this._lastSend.sig && Date.now() - this._lastSend.t < 2000) {
        console.warn('[sendNote] envio duplicado bloqueado (mesmo texto em <2s)');
        return;
      }
      this._lastSend = { sig, t: Date.now() };
      const clientId = uid();
      const note = {
        clientId, threadId: this.activeThread, text,
        images: (this.pendingImages || []).slice(), ts: now(),
        userId: Store.user ? Store.user.mail : 'anon', pending: true, local: true
      };
      const eff = Store.upsertNote(note) || note;
      this.appendNoteRealtime(eff);
      // memória de criações recentes deste dispositivo: o echo do realtime da
      // própria nota não deve reprocessar o merge (evita qualquer corrida)
      this._recentLocalCids = this._recentLocalCids || new Map();
      this._recentLocalCids.set(eff.clientId, Date.now());
      if (this._recentLocalCids.size > 50) this._recentLocalCids.delete(this._recentLocalCids.keys().next().value);
      // limpa composer + anexos
      ta.innerHTML = ''; $('#btn-send').disabled = true;
      // reset robusto do tamanho: estado inline zerado + overflowY 'hidden'
      // (o 'auto' herdado de mensagem >60vh impedia o fieldset de encolher de volta)
      this.resetComposerSize();
      this._updateSendAudioState(ta, $('#btn-send')); // volta ao modo microfone
      this.pendingImages = []; this.renderAttachPreview();
      // garante a mensagem recém-enviada totalmente visível, acima do composer:
      // scrollTop = scrollHeight limita ao máximo → a zona de padding (composer-safe)
      // fica no pé da área visível e a última bolha fica sempre acima do input
      const box = $('#messages');
      box.scrollTop = box.scrollHeight;
      // tenta enviar; independente do resultado, limpa o estado "enviando"
      // (modo offline-first: a nota já está salva localmente e será reconciliada no reconnect)
      // envia a nota CANÔNICA do Store (com sortOrder atribuído pelo upsert) —
      // enviar a cópia pré-upsert deixava sort_order null/0 no servidor e o eco
      // do realtime sobrescrevia a ordenação local
      const stored = (Store.notesFor(this.activeThread) || []).find((x) => x.clientId === eff.clientId);
      Sync.send('note:upsert', Object.assign({}, stored || eff, { pending: false }));
      // marca como enviada localmente (remove o "enviando…" da tela)
      this.markSent(eff.clientId);
      this.updateNoteCount();
      Sound.play('send'); haptic('light');
    },

markSent(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId);
      if (n && n.pending) { n.pending = false; Store.save(); }
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (el) {
        el.classList.remove('pending');
        const meta = el.querySelector('.meta'); if (meta) meta.textContent = fmtTime((n && n.ts) || now());
      }
    },

appendNoteRealtime(n, fromRemote) {
      const box = $('#messages');
      $('#empty-state').classList.add('hidden');
      // echo guard 1: se a bolha já está no DOM (enviada por ESTE dispositivo), não duplica
      const existing = box.querySelector(`.bubble[data-client-id="${n.clientId}"]`);
      if (existing) { existing.classList.remove('pending'); return; }
      // echo guard 2: nota criada há pouco NESTE dispositivo — o Store já tem tudo
      // (o chamador já fez o merge); ignora o eco sem re-render, sem pop
      if (this._recentLocalCids && this._recentLocalCids.has(n.clientId)) {
        const t0 = this._recentLocalCids.get(n.clientId);
        if (Date.now() - t0 < 15000) return;
        this._recentLocalCids.delete(n.clientId);
      }
      // UMA animação por bolha: remota → entrada suave (is-new); local → pop spring
      // (is-new + just-sent juntos trocavam a `animation` no mesmo frame — a entrada
      // reiniciava e virava o "piscar 2-3x" em TODO envio)
      const el = this.bubbleEl(n, { isNew: !!fromRemote });
      if (!fromRemote) el.classList.add('just-sent');
      box.appendChild(el);
      // registra no conjunto de renderização: sem isso qualquer re-render de
      // renderMessages/loadOlder recriaria a bolha desta nota (duplicada)
      this.renderedClientIds = this.renderedClientIds || new Set();
      this.renderedClientIds.add(n.clientId);
      // rede de segurança: garante 1 bolha por clientId no DOM, venha de onde vier
      if (this.dedupeBubblesDom()) console.warn('[render] bolha duplicada removida do DOM');
      box.scrollTop = box.scrollHeight;
      const meta = el.querySelector('.meta'); if (meta) meta.textContent = fmtTime(n.ts);
      el.classList.remove('pending');
      // M1 fix: limpa .is-new após a entrada para não re-animar em renders futuros
      el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true });
      setTimeout(() => { if (!fromRemote) el.classList.remove('just-sent'); }, 320);
    },

deleteNote(clientId) {
      if (!this.activeThread) return;
      const arr = Store.notesFor(this.activeThread);
      const n = arr.find((x) => x.clientId === clientId);
      Store.deleteNote(this.activeThread, clientId);
      Sync.send('note:delete', { threadId: this.activeThread, clientId });
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`); if (el) el.remove();
      this.renderedClientIds.delete(clientId);
      this.updateNoteCount();
      // oferece desfazer (buffer em memória por 10s)
      if (n) {
        const backup = Object.assign({}, n);
        this._undoBuffer = { threadId: this.activeThread, note: backup, timer: null };
        const undo = () => {
          if (this._undoBuffer && this._undoBuffer.note === backup) this.undoDelete();
        };
        const t = setTimeout(() => { if (this._undoBuffer && this._undoBuffer.note === backup) this._undoBuffer = null; }, 10000);
        this._undoBuffer.timer = t;
        this.toast('Nota excluída', {
          kind: 'info',
          action: { label: 'Desfazer', fn: undo }
        });
      }
    },

undoDelete() {
      if (!this._undoBuffer) return;
      const { threadId, note } = this._undoBuffer;
      this._undoBuffer = null;
      Store.upsertNote(note);
      Sync.send('note:upsert', Object.assign({}, note, { pending: false }));
      if (this.activeThread === threadId) {
        this.renderedClientIds.delete(note.clientId);
        this.renderMessages(true);
      }
      this.updateNoteCount();
      Sound.play('create');
    },
};
