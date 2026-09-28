import { uid, now, fmtTime, haptic, $, esc } from '../utils.js';
import { Store } from '../store.js';
import { Sync, getSupa, USE_SUPABASE } from '../sync-supabase.js';
import { Sound } from '../sound.js';

export const ComposerMethods = {
    // ---------- Banner de erro de sync no composer (retry inline) ----------
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
    _editorText(el) {
      const out = [];
      // depth = nível de aninhamento da lista (sub-listas com Tab): cada nível
      // vira 2 espaços antes do marcador — o renderizador e o parser do editor
      // entendem esse recuo de volta
      // inLi: caminhando o CONTEÚDO de um <li> — uma lista aninhada aí deve
      // fechar a linha do texto do pai antes de começar (e não repetir o \n)
      const walk = (node, depth, inLi) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 3) { out.push(c.textContent); continue; }
          if (c.tagName === 'BR') { out.push('\n'); continue; }
          if (c.tagName === 'LI') {
            const list = c.parentElement;
            const cb = c.querySelector(':scope > input[type=checkbox]');
            const ind = '  '.repeat(depth);
            if (list.classList.contains('md-checklist')) out.push(ind + (cb && cb.checked ? '[x] ' : '[ ] '));
            else if (list.tagName === 'UL') out.push(ind + '- ');
            else out.push(ind + ([...list.children].indexOf(c) + 1) + '. ');
            // conteúdo do li: listas aninhadas dentro dele valem +1 nível
            walk(c, depth + 1, true);
            // a linha só termina aqui se a sub-lista ainda não a terminou
            if (out.length && out[out.length - 1] !== '\n') out.push('\n');
            continue;
          }
          if (c.tagName === 'CODE') { out.push('`' + c.textContent + '`'); continue; }
          // chip de menção → token markdown @[Nome](t:id) (a nota guarda o token;
          // sem isto o sendNote serializava só "@Nome" e o backlink se perdia)
          if (c.hasAttribute && c.hasAttribute('data-mention')) { out.push('@[' + (c.textContent || '').replace(/^@/, '') + '](t:' + (c.getAttribute('data-tid') || '') + ')'); continue; }
          // negrito/itálico do editor → marcadores markdown (a nota guarda **/*)
          if (/^(STRONG|B)$/.test(c.tagName)) { out.push('**'); walk(c, depth, inLi); out.push('**'); continue; }
          if (/^(EM|I)$/.test(c.tagName)) { out.push('*'); walk(c, depth, inLi); out.push('*'); continue; }
          const isBlock = /^(DIV|P|UL|OL|H[1-6]|BLOCKQUOTE)$/.test(c.tagName);
          if (isBlock) {
            if (c.tagName === 'UL' || c.tagName === 'OL') {
              // sub-lista dentro de um li: fecha a linha do pai antes de abrir
              if (inLi && out.length && out[out.length - 1] !== '\n') out.push('\n');
              walk(c, depth);
              continue; // o último item da lista já terminou a linha
            }
            walk(c, depth);
            out.push('\n');
          } else {
            walk(c, depth);
          }
        }
      };
      walk(el, 0, false);
      return out.join('').replace(/\u200B/g, '').replace(/\n+$/, '');
    },

    // HTML do editor → markdown (para enviar a nota)
    _serialize() {
      return this._editorText($('#composer-input'));
    },

    // **bold**, *itálico*, `code`, @[Nome](t:id) → nós DOM dentro de parent
    _pushInline(parent, text) {
      const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|@\[([^\]]+)\]\(t:([a-z0-9]+)\)/g;
      let last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
        if (m[1] !== undefined) { const b = document.createElement('strong'); b.textContent = m[1]; parent.appendChild(b); }
        else if (m[2] !== undefined) { const i2 = document.createElement('em'); i2.textContent = m[2]; parent.appendChild(i2); }
        else if (m[3] !== undefined) { const c = document.createElement('code'); c.textContent = m[3]; parent.appendChild(c); }
        else {
          const chip = document.createElement('span');
          chip.setAttribute('data-mention', ''); chip.setAttribute('data-tid', m[5]);
          chip.textContent = '@' + m[4];
          parent.appendChild(chip);
        }
        last = re.lastIndex;
      }
      if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    },

    // markdown → nós DOM para o editor (menções viram chip, **/* viram strong/em)
    _renderMdInto(el, md) {
      el.innerHTML = '';
      if (!md) return;
      const frag = this._mdToFrag(md);
      el.appendChild(frag);
    },

    _mdToFrag(md) {
      const frag = document.createDocumentFragment();
      const lines = String(md).split('\n');
      // pilha de listas abertas: recuo de 2 espaços = 1 nível de sub-lista,
      // aninhada dentro do último <li> da lista pai (espelha o DOM do editor)
      let stack = []; // { type:'ul'|'ol'|'chk', el, depth }
      const lastLi = (el) => (el.lastElementChild && el.lastElementChild.tagName === 'LI') ? el.lastElementChild : null;
      const holder = () => (stack.length ? (lastLi(stack[stack.length - 1].el) || stack[stack.length - 1].el) : frag);
      const openList = (type, depth) => {
        const el = document.createElement(type === 'ol' ? 'ol' : 'ul');
        if (type === 'chk') el.className = 'md-checklist';
        holder().appendChild(el);
        stack.push({ type, el, depth });
      };
      // fecha níveis mais fundos ou de outro tipo; abre novo se preciso
      const ensureList = (type, depth) => {
        while (stack.length && (stack[stack.length - 1].depth > depth || stack[stack.length - 1].type !== type)) stack.pop();
        if (!stack.length || stack[stack.length - 1].depth < depth) openList(type, depth);
        return stack[stack.length - 1].el;
      };
      for (const raw of lines) {
        let m;
        if ((m = raw.match(/^(\s*)\[( |x)\]\s+(.*)$/i))) {
          const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
          const el = ensureList('chk', depth);
          const li = document.createElement('li');
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = m[2].toLowerCase() === 'x';
          li.appendChild(cb);
          const sp = document.createElement('span'); this._pushInline(sp, m[3]);
          li.appendChild(sp);
          el.appendChild(li);
        } else if ((m = raw.match(/^([ \t]*)-\s+(.*)$/))) {
          const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
          const el = ensureList('ul', depth);
          const li = document.createElement('li'); this._pushInline(li, m[2]); el.appendChild(li);
        } else if ((m = raw.match(/^([ \t]*)(\d+)[.)]\s+(.*)$/))) {
          const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
          const el = ensureList('ol', depth);
          const li = document.createElement('li'); this._pushInline(li, m[3]); el.appendChild(li);
        } else {
          stack = [];
          if (raw === '') { frag.appendChild(document.createElement('br')); }
          else { const d = document.createElement('div'); this._pushInline(d, raw); frag.appendChild(d); }
        }
      }
      return frag;
    },

    // detecta "isso parece markdown?" — evita converter texto comum colado
    // (traço de diálogo, asterisco solto) quando não há estrutura de verdade
    _looksLikeMarkdown(txt) {
      return /^[ \t]*(\[[ xX]\]\s|[-*]\s+|\d+[.)]\s+)/m.test(txt)
        || /\*\*[^*\n]+\*\*/.test(txt)
        || /`[^`\n]+`/.test(txt)
        || /(^|\n)@\[[^\]\n]+\]\(t:[a-z0-9]+\)/.test(txt)
        || [...txt].some((ch) => window.NoteThread && window.NoteThread.UI && window.NoteThread.UI.REACTIONS.includes(ch));
    },

    // caret no fim do editor (uso: após programa clear/focus)
    _caretEnd(el) {
      el.focus();
      const sel = getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    },

    // cmd do execCommand com foco preservado no editor
    _exec(cmd, val) {
      const el = $('#composer-input');
      el.focus();
      document.execCommand(cmd, false, val);
    },

    applyFormat(kind) {
      const ta = $('#composer-input'); if (ta.getAttribute('contenteditable') === 'false') return;
      // bold/italic: WYSIWYG — toggle de estilo no texto ( seleção = aplica na seleção;
      // sem seleção = modo "ligado" para as próximas palavras digitadas)
      if (kind === 'bold' || kind === 'italic') {
        const sel = getSelection();
        const hasSelection = sel && !sel.isCollapsed && ta.contains(sel.anchorNode);
        if (hasSelection) {
          this._exec(kind === 'bold' ? 'bold' : 'italic');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        // modo contínuo: queryCommandState diz se o PRÓXIMO caractere sai formatado
        this._exec(kind === 'bold' ? 'bold' : 'italic');
        const nowOn = document.queryCommandState(kind === 'bold' ? 'bold' : 'italic');
        this.toast(nowOn
          ? (kind === 'bold' ? 'Negrito ligado — as próximas palavras sairão em negrito' : 'Itálico ligado — as próximas palavras sairão em itálico')
          : (kind === 'bold' ? 'Negrito desligado' : 'Itálico desligado'), { kind: 'info', duration: 1500 });
        this._updateFmtToggleUI(ta);
        return;
      }
      if (kind === 'code') {
        const sel = getSelection();
        const hasSelection = sel && !sel.isCollapsed && ta.contains(sel.anchorNode);
        if (hasSelection) {
          // toggle <code> na seleção
          const n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
          if (n && ta.contains(n) && n.closest('code')) {
            this._unwrap(n.closest('code'));
          } else {
            const txt = sel.toString();
            this._exec('insertHTML', '<code>' + txt.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</code>');
          }
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        // sem seleção: insere bloco de código vazio destacado
        this._exec('insertHTML', '<code>\u200b</code>');
        // posiciona cursor dentro do code
        const codes = ta.querySelectorAll('code');
        const last = codes[codes.length - 1];
        if (last) { const r = document.createRange(); r.selectNodeContents(last); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
        return;
      }
      if (kind === 'checklist' || kind === 'list' || kind === 'ordered-list') {
        this._ensureSelection(ta);
        if (kind === 'ordered-list') {
          this._exec('insertOrderedList'); // nativo: cria, converte ul↔ol e sai da lista
        } else if (kind === 'list') {
          this._exec('insertUnorderedList');
        } else {
          // checklist: ul nativa + classe + checkbox por item
          let list = this._caretList(ta);
          if (list && list.tagName === 'OL') { this._exec('insertOrderedList'); this._exec('insertUnorderedList'); list = this._caretList(ta); }
          else if (!list) { this._exec('insertUnorderedList'); list = this._caretList(ta); }
          if (list && list.tagName === 'UL') {
            if (list.classList.contains('md-checklist')) {
              list.classList.remove('md-checklist');
              list.querySelectorAll(':scope > li > input[type=checkbox]').forEach((i) => i.remove());
            } else {
              list.classList.add('md-checklist');
              [...list.children].forEach((li) => { const cb = document.createElement('input'); cb.type = 'checkbox'; li.insertBefore(cb, li.firstChild); });
            }
          }
        }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        this._updateFmtToggleUI(ta);
        return;
      }
    },

    // desfaz <code> mantendo o texto
    _unwrap(codeEl) {
      const parent = codeEl.parentNode;
      while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
      parent.removeChild(codeEl);
      parent.normalize();
      $('#composer-input').dispatchEvent(new Event('input', { bubbles: true }));
    },

    // garante que existe um range DENTRO do editor (webviews podem focar sem seleção;
    // e um clique em botão externo deixa um range fora — ex.: dentro do próprio botão)
    _ensureSelection(ta) {
      const sel = getSelection();
      if (sel.rangeCount) {
        const r = sel.getRangeAt(0);
        const host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
        if (host && ta.contains(host)) return r;
      }
      const r = document.createRange();
      r.selectNodeContents(ta); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
      return r;
    },

    // ul/ol que contém o caret (ou null)
    _caretList(ta) {
      const sel = getSelection();
      if (!sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node || !ta.contains(node)) return null;
      const l = node.closest && node.closest('ul, ol');
      return (l && ta.contains(l)) ? l : null;
    },

    // Enter em lista: dividimos no caret e continuamos a lista no novo item
    // (shift+enter no composer tem preventDefault — o nativo não roda). Comportamento
    // de apps de nota: "Enter em item vazio = sair da lista"
    _listContinuation(ta) {
      // checklist: continuação CUSTOM — o nativo cria o novo item SEM o input
      // de checkbox; aqui dividimos no caret e inserimos a próxima checkbox
      if (this._checklistContinuation(ta)) return true;
      const list = this._caretList(ta);
      if (!list) return false;
      const sel = getSelection();
      const sc = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
      const li = sc ? (sc.nodeType === 1 ? (sc.closest && sc.closest('li')) : (sc.parentElement && sc.parentElement.closest('li'))) : null;
      const text = li ? li.textContent.replace(/\u200B/g, '') : '';
      if (li && text.trim() === '') {
        // item vazio: sai da lista — remove o li (e a lista, se esvaziar) e
        // posiciona o caret no fim do item anterior (ou onde a lista estava).
        // DOM direto em vez de execCommand: determinístico e sem dependência de foco
        const prev = li.previousElementSibling;
        const next = li.nextElementSibling;
        li.remove();
        let anchor = null;
        if (!list.querySelector('li')) {
          anchor = document.createTextNode('');
          list.parentNode.insertBefore(anchor, list);
          list.remove();
        }
        const r = document.createRange();
        if (anchor) r.setStart(anchor, 0); // lista esvaziou e foi removida: prev/next estão órfãos
        else if (prev) { r.selectNodeContents(prev); r.collapse(false); }
        else if (next) { r.selectNodeContents(next); r.collapse(true); }
        else { r.selectNodeContents(ta); r.collapse(false); }
        sel.removeAllRanges(); sel.addRange(r);
        return true;
      }
      // item com conteúdo: divide no caret e cria o próximo item da lista
      return this._splitListItem(list, li, sel);
    },

    // divide o <li> no caret: conteúdo após o caret migra para um novo <li>
    // vazio logo abaixo; caret fica no novo item (continuação de ul/ol)
    _splitListItem(list, li, sel) {
      const range = sel.getRangeAt(0);
      const tail = range.cloneRange();
      tail.selectNodeContents(li);
      tail.setStart(range.endContainer, range.endOffset);
      const frag = tail.extractContents(); // conteúdo após o caret muda de item
      const nli = document.createElement('li');
      if (frag) nli.appendChild(frag);
      if (!nli.hasChildNodes()) nli.appendChild(document.createTextNode(''));
      list.insertBefore(nli, li.nextSibling);
      const nr = document.createRange();
      nr.selectNodeContents(nli); nr.collapse(true); // caret no início do novo item
      sel.removeAllRanges(); sel.addRange(nr);
      return nli;
    },

    // Shift+Enter em checklist: cria o próximo item COM checkbox (unchecked),
    // movendo o conteúdo após o caret para ele. Item vazio → sai da checklist
    _checklistContinuation(ta) {
      const sel = getSelection(); if (!sel.rangeCount) return false;
      const sc = sel.getRangeAt(0).startContainer;
      const li = sc.nodeType === 1 ? (sc.closest && sc.closest('li')) : (sc.parentElement && sc.parentElement.closest('li'));
      const list = li ? li.parentElement : null;
      if (!li || !list || list.tagName !== 'UL' || !list.classList.contains('md-checklist') || !ta.contains(li)) return false;
      // item vazio: cai no fluxo existente (toggle nativo = sai da lista)
      if (li.textContent.replace(/\u200B/g, '').trim() === '') return false;
      const range = sel.getRangeAt(0);
      const tail = range.cloneRange();
      tail.selectNodeContents(li);
      tail.setStart(range.endContainer, range.endOffset);
      const frag = tail.extractContents(); // conteúdo após o caret muda de item
      const nli = document.createElement('li');
      const cb = document.createElement('input'); cb.type = 'checkbox';
      nli.appendChild(cb);
      if (frag) nli.appendChild(frag);
      // caret nunca antes de um checkbox extraído de volta: se a extração pegou
      // o input do item original (caret no início), devolve
      if (frag && frag.querySelector) {
        const stray = frag.querySelector('input[type=checkbox]');
        if (stray) { stray.remove(); li.insertBefore(stray, li.firstChild); }
      }
      if (!nli.hasChildNodes() || nli.lastChild === cb) nli.appendChild(document.createTextNode(''));
      list.insertBefore(nli, li.nextSibling);
      const nr = document.createRange();
      nr.setStart(nli, 1); nr.collapse(true); // caret após a checkbox do novo item
      sel.removeAllRanges(); sel.addRange(nr);
      return true;
    },

    // ---------- Sub-listas: Tab / Shift+Tab indentam o item atual ----------
    _caretItem(ta) {
      const sel = getSelection();
      if (!sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node || !ta.contains(node)) return null;
      const li = node.closest && node.closest('li');
      return (li && ta.contains(li)) ? li : null;
    },
    // reconstrói o markdown do editor quando a estrutura de listas muda
    // (Tab/Shift+Tab) — o DOM aninhado é a fonte, então nada se perde
    _rebuildEditorFromMarkdown(ta) {
      const md = this._editorText(ta);
      this._renderMdInto(ta, md);
      const r = document.createRange();
      r.selectNodeContents(ta); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },
    // Tab: se o item anterior é irmão, vira sub-item dele (recua 1 nível)
    _listIndent(ta) {
      const li = this._caretItem(ta); if (!li) return false;
      const list = li.parentElement;
      if (!list || !/^(UL|OL)$/.test(list.tagName)) return false;
      const prev = li.previousElementSibling;
      if (!prev || prev.tagName !== 'LI') return false; // 1º item não tem pai — Tab normal
      // lista aninhada do prev: reaproveita; senão cria do tipo certo
      const prevCb = prev.querySelector(':scope > input[type=checkbox]');
      let sub = null;
      for (const c of prev.children) { if (/^(UL|OL)$/.test(c.tagName)) { sub = c; break; } }
      if (!sub) {
        sub = document.createElement(list.tagName);
        if (list.classList.contains('md-checklist')) sub.className = 'md-checklist';
        prev.appendChild(sub);
      }
      // a checkbox do item migrado deve corresponder ao tipo da sub-lista de destino
      const cb = li.querySelector(':scope > input[type=checkbox]');
      const targetIsChk = sub.classList.contains('md-checklist');
      if (targetIsChk && !cb) { const ncb = document.createElement('input'); ncb.type = 'checkbox'; li.insertBefore(ncb, li.firstChild); }
      else if (!targetIsChk && cb) cb.remove();
      sub.appendChild(li);
      this._rebuildEditorFromMarkdown(ta);
      return true;
    },
    // Shift+Tab: se o item está aninhado, sobe 1 nível (para depois do pai)
    _listOutdent(ta) {
      const li = this._caretItem(ta); if (!li) return false;
      const list = li.parentElement;
      if (!list || !/^(UL|OL)$/.test(list.tagName)) return false;
      const parentLi = list.parentElement && list.parentElement.closest ? list.parentElement.closest('li') : null;
      if (!parentLi || !ta.contains(parentLi)) return false; // já está no topo
      const grand = parentLi.parentElement;
      // ao esvaziar a sub-lista, ela some; o pai permanece
      grand.insertBefore(li, parentLi.nextSibling);
      if (!list.querySelector('li')) list.remove();
      this._rebuildEditorFromMarkdown(ta);
      return true;
    },

    // atualiza estado visual dos botões da barra: toggle (bold/italic) reflete o
    // estilo no caret; botões de lista refletem o tipo de lista sob o caret
    _updateFmtToggleUI(ta) {
      let bold = false, italic = false, ul = false, ol = false;
      try { bold = document.queryCommandState('bold'); } catch {}
      try { italic = document.queryCommandState('italic'); } catch {}
      try { ul = document.queryCommandState('insertUnorderedList'); } catch {}
      try { ol = document.queryCommandState('insertOrderedList'); } catch {}
      const list = this._caretList(ta);
      const chk = !!(list && list.classList && list.classList.contains('md-checklist'));
      let inCode = false;
      if (getSelection().rangeCount) {
        const n = getSelection().getRangeAt(0).startContainer;
        const el = n.nodeType === 1 ? n : n.parentElement;
        inCode = !!(el && el.closest && ta.contains(el) && el.closest('code'));
      }
      document.querySelectorAll('.fmt-btn').forEach((b) => {
        const k = b.dataset.fmt;
        if (!k) return;
        let active;
        if (k === 'bold') active = bold;
        else if (k === 'italic') active = italic;
        else if (k === 'code') active = inCode;
        else if (k === 'checklist') active = chk;
        else if (k === 'list') active = ul && !chk;
        else if (k === 'ordered-list') active = ol;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    },

    // botão único send/áudio: com texto (ou anexo) mostra ✈ enviar; vazio mostra 🎤 gravar
    _updateSendAudioState(ta, send) {
      const hasContent = this._editorText(ta).replace(/\u200B/g, '').trim() !== '' || ((this.pendingImages || []).length > 0);
      this._audioMode = !hasContent;
      send.classList.toggle('audio-mode', this._audioMode);
      send.disabled = false; // áudio está sempre disponível
      const micSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      const sendSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
      const want = this._audioMode ? micSvg : sendSvg;
      if (!send.innerHTML.includes(this._audioMode ? 'M12 1a3' : 'x1="22"')) {
        send.innerHTML = want;
        send.setAttribute('aria-label', this._audioMode ? 'Gravar áudio' : 'Enviar');
        send.title = this._audioMode ? 'Gravar áudio' : 'Enviar';
      }
    },

    // gravação de áudio via MediaRecorder; envia como anexo de áudio na nota
    async _startAudioRecording(send) {
      if (this._recording) {
        // parar e enviar
        this._mediaRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const duration = Math.round((Date.now() - this._recStart) / 1000);
          this._recording = false;
          clearInterval(this._recTimer);
          send.classList.remove('recording');
          if (duration < 1) { this.toast('Gravação muito curta', { kind: 'info' }); return; }
          const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
          (this.pendingImages = this.pendingImages || []).push(file);
          this.renderAttachPreview();
          this.toast(`Áudio de ${duration}s anexado`, { kind: 'success' });
        };
        this._mediaRecorder = rec;
        this._recStart = Date.now();
        this._recording = true;
        rec.start();
        send.classList.add('recording');
        let secs = 0;
        this._recTimer = setInterval(() => { secs++; send.title = `Gravando… ${secs}s (clique para parar)`; }, 1000);
        this.toast('Gravando áudio — clique novamente para parar', { kind: 'info', duration: 2500 });
      } catch (err) {
        this.toast('Não foi possível acessar o microfone', { kind: 'error' });
      }
    },

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
