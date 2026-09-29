import { PAGE_SIZE, esc, fmtTime, now, haptic, $, hideWithExit } from '../utils.js';
import { ICON, wrapSvg } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { burstConfetti } from '../confetti.js';

export const MessagesMethods = {
    openThread(id) {
      if (this.activeThread === id) return;
      this.activeThread = id;
      this.renderedClientIds = new Set();
      this.oldestTs = null; this.loading = false;
      Sound.play('open');
      $('#app').classList.add('show-chat');
      const t = Store.getThread(id);
      $('#chat-name').textContent = t ? t.name : 'Conversa';
      const ci = $('#composer-input');
      ci.setAttribute('contenteditable', 'true'); ci.classList.remove('composer-disabled');
      $('#btn-send').disabled = false;
      this.dom.pinPopover.classList.add('hidden');
      this.updatePinButton();
      // esconde páginas Busca/Lembretes/Pendências/IA/Diária se abertas
      document.getElementById('search-page')?.classList.add('hidden');
      document.getElementById('reminders-page')?.classList.add('hidden');
      document.getElementById('tasks-page')?.classList.add('hidden');
      document.getElementById('ai-page')?.classList.add('hidden');
      document.getElementById('daily-page')?.classList.add('hidden');
      // volta o seletor para Cadernos + restaura cabeçalho da conversa
      this._workspaceTab = 'conversations';
      document.querySelectorAll('.page-switch').forEach((b) => {
        const active = b.dataset.page === 'notes';
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      document.getElementById('btn-thread-menu')?.classList.remove('hidden');
      document.getElementById('ai-info-btn')?.classList.add('hidden');
      document.getElementById('ai-info-tip')?.classList.remove('open');
      this.syncExplorerChrome(); // volta pra conversa → desliga Pendências/Lembretes
      document.getElementById('messages').classList.remove('hidden');
      document.querySelectorAll('.tnode.active').forEach((el) => el.classList.remove('active'));
      document.querySelectorAll(`.tnode[data-tid="${id}"]`).forEach((el) => el.classList.add('active'));
      this.renderMessages(true);
      this.renderBacklinks(id);
      this.setChatActiveUi(true);
    },
    renderBacklinks(threadId) {
      const container = document.getElementById('backlinks');
      if (!container) return;
      const pattern = new RegExp(`@\\[.*?\\]\\(t:${threadId}\\)`, 'i');
      const backlinks = [];
      Object.entries(Store.data.notes).forEach(([tid, notes]) => {
        if (tid === threadId) return;
        const th = Store.getThread(tid);
        notes.forEach(n => {
          if (pattern.test(n.text)) backlinks.push({ tid, th, n });
        });
      });
      if (!backlinks.length) { container.classList.add('hidden'); container.innerHTML = ''; return; }
      // backlinks agora vivem no dropdown do nome da nota
      container.classList.remove('hidden');
      const countEl = document.getElementById('menu-backlinks-count');
      const menuItem = document.getElementById('menu-backlinks');
      if (countEl) countEl.textContent = backlinks.length;
      if (menuItem) {
        menuItem.classList.remove('hidden');
        if (!menuItem.dataset.bound) {
          menuItem.addEventListener('click', () => {
            document.getElementById('chat-title-menu').classList.add('hidden');
            this.toggleBacklinksPopover(backlinks);
          });
          menuItem.dataset.bound = '1';
        }
      }
    },
    toggleBacklinksPopover(backlinks) {
      let pop = document.getElementById('backlinks-popover');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'backlinks-popover';
        pop.className = 'popover backlinks-popover hidden';
        pop.setAttribute('role', 'dialog');
        document.body.appendChild(pop);
      }
      // toggle: se aberto, fecha
      if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
      pop.innerHTML = `<div class="bl-title">Mencionado em ${backlinks.length} nota${backlinks.length !== 1 ? 's' : ''}</div>` +
        backlinks.map(b => `<div class="bl-item" data-tid="${b.tid}" data-cid="${b.n.clientId}"><span class="backlink-thread">${esc(b.th ? b.th.name : 'Conversa')}</span><span class="backlink-snippet">${esc(b.n.text.slice(0, 60))}</span></div>`).join('');
      pop.classList.remove('hidden');
      const anchor = document.getElementById('backlinks-badge').getBoundingClientRect();
      const pw = Math.min(320, window.innerWidth - 24);
      pop.style.width = pw + 'px';
      let left = anchor.right + 10;
      if (left + pw > window.innerWidth - 8) left = Math.max(8, anchor.left - pw - 10);
      pop.style.left = left + 'px';
      pop.style.top = Math.max(8, Math.min(anchor.top, window.innerHeight - 220)) + 'px';
      pop.querySelectorAll('.bl-item').forEach(el => el.addEventListener('click', () => {
        pop.classList.add('hidden');
        this.openThread(el.dataset.tid);
        setTimeout(() => this.scrollToNote(el.dataset.cid), 300);
      }));
    },
    setChatActiveUi(show) {
      const el = $('#chat-active-ui');
      if (!el) return;
      el.classList.toggle('visible', show);
      // placeholder "nenhuma conversa selecionada": visível exatamente quando
      // a UI de conversa está oculta (boot, excluir conversa, apagar tudo)
      document.getElementById('no-thread')?.classList.toggle('hidden', !!show);
      // CTAs do placeholder: novo modal unificado e abrir a Diária
      const ntNew = document.getElementById('nt-new');
      if (ntNew && !ntNew.dataset.bound) { ntNew.dataset.bound = '1'; ntNew.addEventListener('click', () => this.createItem()); }
      const ntAi = document.getElementById('nt-open-ai');
      if (ntAi && !ntAi.dataset.bound) { ntAi.dataset.bound = '1'; ntAi.addEventListener('click', () => this.showWorkspaceTab('ai')); }
      if (show) this._bindChatTitleMenu();
    },

    // ---------- Popover de opções da nota (botão ⋮ do banner) ----------
    _bindChatTitleMenu() {
      const nameEl = document.getElementById('chat-name');
      const trigger = document.getElementById('btn-thread-menu');
      const menu = document.getElementById('chat-title-menu');
      if (!trigger || !menu || trigger.dataset.menuBound) return;
      trigger.dataset.menuBound = '1';
      // IMPORTANTE: move o menu para o <body>. Dentro de .chat-active-ui ele é
      // cortado (overflow:hidden) e deslocado (transform quebra position:fixed).
      if (menu.parentElement !== document.body) document.body.appendChild(menu);
      const openMenu = () => {
        if (!this.activeThread) return;
        if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
        menu.classList.remove('hidden');
        menu.style.visibility = 'hidden';
        const r = trigger.getBoundingClientRect();
        const mw = menu.offsetWidth || 220, mh = menu.offsetHeight || 180;
        // alinha a DIREITA do menu com a direita do botão, depois clamp para dentro da tela
        let left = r.right - mw + 8;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        let top = r.bottom + 6;
        top = Math.max(8, Math.min(top, window.innerHeight - mh - 8));
        // M7: popover nasce do gatilho — origem relativa ao ponto do botão
        const originX = r.right - left;
        const originY = r.top - top;
        menu.style.transformOrigin = Math.max(0, Math.min(originX, mw)) + 'px ' + Math.max(0, Math.min(originY, mh)) + 'px';
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.visibility = '';
      };
      trigger.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
      document.addEventListener('click', (e) => {
        if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !trigger.contains(e.target)) {
          menu.classList.add('hidden');
        }
      });
      // Renomear
      const renameBtn = menu.querySelector('[data-act="rename"]');
      if (renameBtn && !renameBtn.dataset.bound) {
        renameBtn.addEventListener('click', () => {
          menu.classList.add('hidden');
          const th = Store.getThread(this.activeThread);
          if (!th) return;
          this.showModal('Renomear conversa', `<input id="rename-input" type="text" value="${esc(th.name)}" maxlength="60" style="width:100%" />`, () => {
            const v = ($('#rename-input') || {}).value?.trim();
            if (v && v !== th.name) {
              Store.upsertThread({ id: th.id, name: v, updatedAt: Date.now() });
              Sync.send('thread:rename', { id: th.id, name: v });
              $('#chat-name').textContent = v;
              this.queueRenderTree();
              this.toast('Conversa renomeada ✓', { kind: 'success' });
            }
          });
          setTimeout(() => { const inp = $('#rename-input'); if (inp) { inp.focus(); inp.select(); } }, 50);
        });
        renameBtn.dataset.bound = '1';
      }
      // Excluir
      const deleteBtn = menu.querySelector('[data-act="delete"]');
      if (deleteBtn && !deleteBtn.dataset.bound) {
        deleteBtn.addEventListener('click', () => {
          menu.classList.add('hidden');
          if (this.activeThread) this.confirmDeleteThread(this.activeThread);
        });
        deleteBtn.dataset.bound = '1';
      }
      // Convidar (multiusuário) — placeholder até a feature de compartilhamento
      const inviteBtn = menu.querySelector('[data-act="invite"]');
      if (inviteBtn && !inviteBtn.dataset.bound) {
        inviteBtn.addEventListener('click', () => {
          menu.classList.add('hidden');
          this.toast('Convidar pessoas para uma conversa — em breve!', { kind: 'info', duration: 3000 });
        });
        inviteBtn.dataset.bound = '1';
      }
    },

    // aplica (ou limpa) a cor do caderno no cabeçalho banner, conforme o setting headerMatchColor
    applyThreadHeaderColor(threadId) {
      const hdr = document.getElementById('chat-header');
      if (!hdr) return;
      const on = !!(Store.data.ui && Store.data.ui.headerMatchColor);
      const t = threadId && Store.getThread(threadId);
      if (on && t) {
        // cor escolhida pelo usuário tem prioridade; senão hash determinístico
        const col = this._cadernoColor(t);
        hdr.classList.add('thread-colored');
        hdr.style.background = col.bg;
        // contraste WCAG: se o fundo for claro, usa texto escuro em vez de branco
        const fg = this._readableTextColor(col.bg);
        hdr.style.color = fg;
        const nameEl = hdr.querySelector('.chat-name');
        if (nameEl) nameEl.style.color = fg;
      } else {
        hdr.classList.remove('thread-colored');
        hdr.style.background = '';
        hdr.style.color = '';
        const nameEl = hdr.querySelector('.chat-name');
        if (nameEl) nameEl.style.color = '';
      }
    },

    // escolhe preto ou branco conforme a luminância do fundo (WCAG)
    _readableTextColor(hexBg) {
      const h = hexBg.replace('#', '');
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const [r, g, b] = [0, 2, 4].map((i) => {
        let v = parseInt(full.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return L > 0.4 ? '#1f1a17' : '#ffffff';
    },

    // CTA do empty state removido — o fluxo de criar conversa vive na sidebar
    // (e no menu de contexto do caderno); nada mais a vincular aqui
    _bindEmptyCta() {},

    renderMessages(reset) {
      // último anel de defesa: cura gêmeas ANTES de renderizar (double-send local:
      // texto idêntico + mesmo autor + ts quase igual, client_id diferentes)
      if (this.activeThread) {
        const removedHere = Store.dedupeIdentical(this.activeThread);
        removedHere.forEach((r) => Sync.send('note:delete', { threadId: this.activeThread, clientId: r.clientId }));
      }
      const box = $('#messages');
      const empty = $('#empty-state');
      const notes = Store.notesFor(this.activeThread);
      if (!notes.length) {
        empty.classList.remove('hidden');
        $('#load-older').classList.add('hidden');
        box.querySelectorAll('.bubble, .day-sep').forEach((n) => n.remove());
        this._applyCozyEmptyCopy(empty);
        this._bindEmptyCta();
        return;
      }
      empty.classList.add('hidden');
      const { items, hasMore } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
      if (reset) { box.querySelectorAll('.bubble, .day-sep').forEach((n) => n.remove()); this.renderedClientIds.clear(); this.oldestTs = items.length ? items[0].ts : null; }
      const loader = $('#load-older');
      loader.classList.toggle('hidden', !hasMore);
      const frag = document.createDocumentFragment();
      const before = box.querySelector('.bubble, .day-sep');
      // Em load-older (não reset), sincroniza o dia-base com a bolha já existente
      // para que o separador certo apareça entre notas novas (mais antigas) e as já renderizadas.
      let lastDay = before && !reset ? before.dataset.day || null : null;
      items.forEach((n) => {
        if (this.renderedClientIds.has(n.clientId)) return;
        this.renderedClientIds.add(n.clientId);
        const dayKey = new Date(n.ts).toDateString();
        if (lastDay !== null && dayKey !== lastDay) {
          frag.appendChild(this.daySepEl(dayKey));
        }
        lastDay = dayKey;
        frag.appendChild(this.bubbleEl(n));
      });
      box.insertBefore(frag, reset ? loader.nextSibling : (before || loader));
      if (reset) box.scrollTop = box.scrollHeight;
      // M1 fix: animação de entrada só em bolhas novas; classe removida após animar
      // (no reset inicial da thread NENHUMA bolha anima — a thread aparece pronta)
      if (!reset) {
        box.querySelectorAll('.bubble.is-new').forEach((el) => {
          el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true });
        });
      } else {
        box.querySelectorAll('.bubble.is-new').forEach((el) => el.classList.remove('is-new'));
      }
    },

    // rede de segurança de DOM: nunca mais de 1 bolha por nota (qualquer caminho
    // futuro que renderize 2x deixa apenas a primeira; retorna quantas removeu)
    dedupeBubblesDom() {
      const box = $('#messages'); if (!box) return 0;
      const seen = new Set(); let removed = 0;
      box.querySelectorAll('.bubble[data-client-id]').forEach((el) => {
        const id = el.dataset.clientId;
        if (seen.has(id)) { el.remove(); removed++; }
        else seen.add(id);
      });
      return removed;
    },

    bubbleEl(n, opts) {
      const div = document.createElement('div');
      const clientId = n.clientId; // escopo p/ os handlers abaixo
      // minha nota: flag local OU userId = email OU userId = uuid auth (o eco do
      // realtime entrega user_id como UUID — sem isso a nota própria era "remota")
      const me = Store.user || {};
      const mine = !!n.local || n.userId === me.mail || (!!me.id && n.userId === me.id);
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === n.clientId;
      let cozyExtra = '';
      if (n.text && /ideia:/i.test(n.text)) cozyExtra = ' bubble-idea';
      // M1 fix: .is-new anima só bolhas novas (classe removida no animationend)
      div.className = 'bubble' + (mine ? '' : ' remote') + (n.pending ? ' pending' : '') + (isPinned ? ' pinned' : '') + cozyExtra
        + (opts && opts.isNew ? ' is-new' : '');
      div.dataset.clientId = n.clientId;
      div.dataset.day = new Date(n.ts).toDateString();
      div.setAttribute('draggable', 'true');
      // seleção de texto: arrastar o mouse DESLIGA o drag nativo (que rouba a seleção)
      div.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY;
        let off = false;
        const mv = (ev) => {
          if (!off && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) {
            off = true;
            div.setAttribute('draggable', 'false'); // browser assume seleção
          }
        };
        const up = () => {
          window.removeEventListener('mousemove', mv);
          window.removeEventListener('mouseup', up);
          // restaura o drag depois que a seleção termina
          setTimeout(() => { if (!el_isEditing()) div.setAttribute('draggable', 'true'); }, 60);
        };
        const el_isEditing = () => div.isContentEditable || div.classList.contains('editing');
        window.addEventListener('mousemove', mv);
        window.addEventListener('mouseup', up);
      });

      const editedMark = n.edited ? '<span class="edited">editada</span>' : '';
      const meta = `<span class="meta">${editedMark}${n.pending ? 'enviando…' : fmtTime(n.ts)}</span>`;
      const pinBadge = isPinned ? `<span class="pin-badge" title="Mensagem fixada">${wrapSvg(ICON.pin, 12)}</span>` : '';
      const toggle = `<button class="msg-toggle" title="Ações" aria-label="Ações">${wrapSvg(ICON.chevron, 12)}</button>`;
      const tags = (n.tags && n.tags.length) ? `<div class="bubble-tags">${n.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : '';
      const imgs = (n.images && n.images.length) ? `<div class="bubble-images">${n.images.map((src) => `<img class="bubble-img" src="${src}" alt="anexo" loading="lazy"/>`).join('')}</div>` : '';

      const hideDone = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
      const rxRow = this._reactionsHtml(n);
      div.innerHTML = `${pinBadge}${imgs}${renderMarkdown(n.text, hideDone)}${tags}${rxRow}${meta}${toggle}`;

      // Seta ▾ → popover
      div.querySelector('.msg-toggle').addEventListener('click', (e) => { e.stopPropagation(); this.openMsgPopover(div, n); });
      // pills de reação: clique alterna a reação do usuário
      div.querySelectorAll('.rx-pill').forEach((pill) => {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleReaction(n.clientId, pill.dataset.rx);
        });
      });
      // Long-press (mobile)
      div.addEventListener('touchstart', (e) => this.onTouchStart(e, div, n), { passive: true });
      div.addEventListener('touchend', () => this.onTouchEnd());
      div.addEventListener('touchmove', () => this.onTouchEnd(), { passive: true });
      // Drag-and-drop desktop
      div.addEventListener('dragstart', (e) => this.onDragStart(e, n));
      div.addEventListener('dragover', (e) => this.onDragOver(e, div));
      div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
      div.addEventListener('drop', (e) => this.onDrop(e, n));
      div.addEventListener('dragend', () => this.onDragEnd());
      // Lightbox: clicar na imagem abre em tela cheia
      div.querySelectorAll('.bubble-img').forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', (e) => { e.stopPropagation(); this.openLightbox(img.src); });
      });
      // Checkboxes clicáveis: marcar/desmarcar persiste no texto da nota
      div.querySelectorAll('.md-check input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => {
          try { this.toggleNoteCheckbox(clientId, +cb.dataset.chk, cb.checked); }
          catch (err) { console.error('[checklist] falha ao alternar:', err); }
        });
      });
      // Menções @: 1 clique = preview popover; 2 cliques = abre a nota
      div.querySelectorAll('.mention').forEach((m) => {
        m.addEventListener('click', (e) => {
          e.stopPropagation();
          const now = Date.now();
          const last = this._mentionLastClick || 0;
          if (now - last < 350) {
            // duplo clique → abre a nota direto
            clearTimeout(this._mentionTimer);
            this._mentionLastClick = 0;
            this.closeNotePreview();
            this.openThread(m.dataset.tid);
            return;
          }
          // clique simples → preview (com delay para permitir o segundo clique)
          this._mentionLastClick = now;
          clearTimeout(this._mentionTimer);
          this._mentionTimer = setTimeout(() => {
            this._mentionLastClick = 0;
            this.showNotePreview(m.dataset.tid);
          }, 260);
        });
      });

      return div;
    },

    // ---------- Copy cozy: frases variadas no empty state ----------
    // troca o texto do estado vazio com uma fala diferente a cada conversa nova criada
    _applyCozyEmptyCopy(empty) {
      if (!empty) return;
      const hint = empty.querySelector('.es-hint');
      const sub = hint && hint.nextElementSibling;
      if (!hint || !sub) return;
      const pool = [
        ['Página em branco, ideias à solta ✨', 'Salve sua primeira ideia como uma mensagem — ela fica guardadinha aqui.'],
        ['Tudo tranquilo por aqui 🌷', 'Crie sua primeira conversa e comece a guardar suas ideias como mensagens.'],
        ['Um cantinho só seu ☁️', 'Anote aquela ideia que apareceu no banho — aqui ela não se perde.'],
        ['Prontinho para começar ⭐', 'Despeje o que está na cabeça: listas, lembretes, pensamentos soltos.'],
        ['Suas ideias moram aqui 🏡', 'Escreva a primeira mensagem e deixe o cantinho aconchegante.'],
        ['Respire, anote, floresça 🌸', 'Uma mensagem de cada vez — o resto a gente guarda.'],
      ];
      const pick = pool[(Math.random() * pool.length) | 0];
      hint.textContent = pick[0];
      sub.textContent = pick[1];
    },

    // marca/desmarca o N-ésimo checkbox do texto ([ ] ↔ [x]) e sincroniza
    toggleNoteCheckbox(clientId, index, checked) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      let i = -1;
      const lines = (n.text || '').split('\n');
      const newLines = lines.map((l) => {
        const m = l.match(/^(\s*)\[( |x)\]\s*(.*)$/i);
        if (!m) return l;
        i += 1;
        if (i !== index) return l;
        return `${m[1]}[${checked ? 'x' : ' '}] ${m[3]}`;
      });
      if (i < index) return; // índice inválido
      n.text = newLines.join('\n'); n.editedAt = now(); n.rev = (n.rev || 0) + 1; Store.save();
      Sync.send('note:edit', { threadId: this.activeThread, clientId, text: n.text, edited: !!n.edited, editedAt: n.editedAt, rev: n.rev });
      const hideDone = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
      if (hideDone && checked) {
        // fade out suave e remoção DIRETA do nó (reflow automático do flex/gap)
        const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
        const input = el && el.querySelector(`.md-check input[data-chk="${index}"]`);
        const wrap = input && input.closest('.md-check');
        if (wrap) {
          wrap.style.maxHeight = wrap.scrollHeight + 'px'; // fixa altura atual p/ animar colapso
          requestAnimationFrame(() => {
            wrap.classList.add('chk-out');
            const remove = () => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
            wrap.addEventListener('transitionend', remove, { once: true });
            setTimeout(remove, 350); // fallback
          });
          return;
        }
      }
      this._replaceBubble(clientId, n);
      // aviso quando todas as checkboxes estão marcadas
      this._checkListComplete(clientId, n);
    },
    _checkListComplete(clientId, n) {
      const lines = (n.text || '').split('\n').filter((l) => /^\s*\[( |x)\]/i.test(l));
      if (!lines.length) return;
      const allDone = lines.every((l) => /\[\s*x\s*\]/i.test(l));
      if (allDone) {
        const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
        if (el && !el.querySelector('.chk-complete')) {
          const badge = document.createElement('div');
          badge.className = 'chk-complete';
          badge.textContent = '✓ Lista completa!';
          el.appendChild(badge);
          setTimeout(() => badge.remove(), 3000);
        }
        burstConfetti(el || document.body); // estrelinhas e pétalas ao concluir
        Sound.playName('sparkle');
        this.toast('✓ Lista completa!', { kind: 'success', duration: 2500 });
      }
    },

    openLightbox(src) {
      let ov = document.getElementById('lightbox');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'lightbox';
        ov.className = 'lightbox hidden';
        ov.innerHTML = '<img class="lightbox-img" alt="imagem ampliada"/><button class="lightbox-close" aria-label="Fechar">×</button>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov || e.target.classList.contains('lightbox-close')) { ov.classList.add('hidden'); const img = ov.querySelector('.lightbox-img'); img.style.transform = ''; img.dataset.scale = '1'; } });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.classList.contains('hidden')) { ov.classList.add('hidden'); const img = ov.querySelector('.lightbox-img'); img.style.transform = ''; img.dataset.scale = '1'; } });
        // pinch-to-zoom
        const img = ov.querySelector('.lightbox-img');
        let startDist = 0, startScale = 1, curScale = 1;
        img.addEventListener('touchstart', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            startDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            startScale = curScale;
          }
        }, { passive: false });
        img.addEventListener('touchmove', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            curScale = Math.min(4, Math.max(1, startScale * (dist / startDist)));
            img.style.transform = `scale(${curScale})`;
            img.style.transformOrigin = 'center center';
          }
        }, { passive: false });
        img.addEventListener('touchend', (e) => {
          if (e.touches.length < 2) { if (curScale <= 1.1) { curScale = 1; img.style.transform = ''; } }
        });
        // double-tap to reset/zoom
        let lastTap = 0;
        img.addEventListener('touchend', (e) => {
          const now = Date.now();
          if (now - lastTap < 300 && e.touches.length === 0) {
            curScale = curScale > 1 ? 1 : 2;
            img.style.transform = curScale === 1 ? '' : `scale(${curScale})`;
          }
          lastTap = now;
        });
      }
      const img = ov.querySelector('.lightbox-img');
      img.style.transform = ''; img.dataset.scale = '1';
      img.src = src;
      ov.classList.remove('hidden');
    },

    daySepEl(dayKey) {
      // "Hoje", "Ontem" ou data por extenso
      const d = new Date();
      const today = d.toDateString();
      const yest = new Date(d.getTime() - 864e5).toDateString();
      let label;
      const resolved = dayKey || today;
      if (resolved === today) label = 'Hoje';
      else if (resolved === yest) label = 'Ontem';
      else label = new Date(resolved).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const wrap = document.createElement('div');
      wrap.className = 'day-sep-wrap';
      wrap.innerHTML = `<span class="day-sep">${esc(label)}</span>`;
      return wrap;
    },

    // ---------- Reações rápidas ----------
    // catálogo completo: afetivas + úteis para marcar as próprias mensagens
    REACTIONS: ['❤️', '✨', '🌸', '😊', '👍', '🙏', '🔥', '⭐', '✅', '❌', '❗', '❓', '💡', '🎯', '📌', '⏰', '👀', '💯', '😂', '🥰', '😮', '😢', '🤔', '🫶'],
    // reações "funcionais" — emoji fixo independente do tema
    _RX_EMOJI_ONLY: true,
    // + do quick row: abre a vista picker; a linha mostra as MAIS USADAS (4)
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
    onTouchStart(e, bubbleEl, note) {
      this.onTouchEnd();
      this.longPressTimer = setTimeout(() => {
        this.openMsgPopover(bubbleEl, note);
      }, 500);
    },
    onTouchEnd() {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    },

    // ---------- Drag-and-drop ----------
    onDragStart(e, note) {
      this.dragClientId = note.clientId;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', note.clientId); } catch (_) {}
      // sem ghost image (1px transparente)
      try {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);
      } catch (_) {}
      e.target.classList.add('dragging');
    },
    onDragOver(e, div) {
      if (!this.dragClientId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
    },
    onDrop(e, targetNote) {
      e.preventDefault();
      e.target.closest('.bubble').classList.remove('drag-over');
      const srcId = this.dragClientId; if (!srcId || srcId === targetNote.clientId) return;
      const arr = Store.notesFor(this.activeThread);
      const from = arr.findIndex((x) => x.clientId === srcId);
      const to = arr.findIndex((x) => x.clientId === targetNote.clientId);
      if (from < 0 || to < 0) return;
      Store.reorderNote(this.activeThread, srcId, to);
      Sync.send('note:reorder', { threadId: this.activeThread, clientId: srcId, newIndex: to });
      // re-render completo da thread atual (simples e correto)
      this.oldestTs = null;
      this.renderedClientIds = new Set();
      this.renderMessages(true);
    },
    onDragEnd() {
      this.dragClientId = null;
      document.querySelectorAll('.bubble.dragging').forEach((b) => b.classList.remove('dragging'));
      document.querySelectorAll('.bubble.drag-over').forEach((b) => b.classList.remove('drag-over'));
    },

    // ---------- Ações de nota: editar (in-line) / pin / excluir ----------
    // substitui a bolha preservando listeners (outerHTML perde eventos → arrow morta)
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

    // indicador de carregamento do load-older: SLOT RESERVADO no topo do fluxo
    // (#load-slot, no HTML) — o espaço existe SEMPRE (como o pull-indicator);
    // mostrar/esconder só liga/desliga a classe .loading. Layout idêntico nos
    // dois estados = flick de layout impossível, e as mensagens nunca alcançam
    // nem ficam sob o indicador
    _showLoadSkeleton() {
      const slot = document.getElementById('load-slot');
      if (slot) slot.classList.add('loading');
      return slot || null;
    },
    _hideLoadSkeleton() {
      const slot = document.getElementById('load-slot');
      if (slot) slot.classList.remove('loading');
    },

    setupInfiniteScroll() {
      const box = $('#messages');
      box.addEventListener('scroll', async () => {
        if (box.scrollTop >= 60 || this.loading || !this.activeThread) return;
        const local = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
        if (local.hasMore) {
          this.loading = true;
          const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
          const { items } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
          this.oldestTs = items.length ? items[0].ts : this.oldestTs;
          const frag = document.createDocumentFragment();
          const loader = $('#load-older');
          items.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
          box.insertBefore(frag, loader.nextSibling);
          box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          this.loading = false;
          return;
        }
        // local esgotado → tenta buscar no servidor (Supabase .range) — com faixa fina
        if (!Sync.fetchNotesPage) return;
        this.loading = true;
        // âncoras ANTES da faixa: o scrollTop final é calculado por distância-do-pé,
        // então a faixa precisa entrar DEPOIS da captura e sair ANTES da aplicação
        const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
        const skel = this._showLoadSkeleton();
        try {
          const serverItems = await Sync.fetchNotesPage(this.activeThread, this.oldestTs, PAGE_SIZE);
          if (!serverItems.length) return;
          serverItems.forEach(n => Store.upsertNote(n));
          // cura de double-send: gêmeas (texto idêntico + ts quase igual) vindas do
          // servidor nas páginas antigas são descartadas e apagadas lá
          Store.dedupeIdentical(this.activeThread).forEach((r) => Sync.send('note:delete', { threadId: this.activeThread, clientId: r.clientId }));
          // pega do Store o que acabou de inserir (garante sortOrder)
          const { items } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
          // fallback: se pageNotes não retornou os recém-inseridos (ex: beforeTs null), usa serverItems
          const toRender = items.length ? items : serverItems;
          if (!toRender.length) return;
          this.oldestTs = toRender[0].ts;
          const frag = document.createDocumentFragment();
          const loader = $('#load-older');
          toRender.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
          box.insertBefore(frag, loader.nextSibling);
        } catch (e) { console.warn('fetch page fail', e); }
        finally {
          this._hideLoadSkeleton(skel); // faixa sai ANTES da âncora (não sobra espaço fantasma)
          box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          this.loading = false;
        }
      });
    },
};

