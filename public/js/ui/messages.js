// Fluxo de mensagens: abrir/fechar conversa, cabeçalho, backlinks e
// a renderização da thread (com paginação real).
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { now, esc, $, PAGE_SIZE } from '../utils.js';

export const MessagesMethods = {
    openThread(id) {
      if (this.activeThread === id) return;
      this.activeThread = id;
      this.renderedClientIds = new Set();
      this.oldestTs = null; this.oldestKey = null; this.loading = false;
      // cada conversa tem sua própria história de servidor: abrir outra
      // reabre a busca (o fim da lista anterior não vale para a nova)
      this.serverExhaustedUntil = 0;
      // abre a conversa SEM o indicador aceso: o fetch só começa no scroll, e
      // um slot herdado de uma conversa anterior piscaria "Carregando
      // mensagens…" sobre a nova sem que nada esteja carregando.
      this._hideLoadSkeleton();
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

    // O elemento real do separador de dia é o WRAPPER (.day-sep-wrap); o
    // .day-sep é o span DENTRO dele. Todo cleanup precisa mirar no wrapper —
    // mirar só no .day-sep não removia nada, e os separadores órfãos
    // acumulavam a cada re-render da conversa.
    _daySepNodes(box) {
      const out = [];
      box.querySelectorAll('.day-sep-wrap, .day-sep').forEach((n) => {
        if (n.classList.contains('day-sep-wrap')) out.push(n);
        else if (!n.closest('.day-sep-wrap')) out.push(n);
      });
      return out;
    },

    // Um separador só faz sentido se o dia dele tem mensagem ABAIXO dele.
    // Depois de apagar todas as mensagens de um dia ele ficava sozinho no
    // fluxo (39px de espaço morto) — aqui some com animação e sai do DOM.
    _pruneOrphanDaySeps(box) {
      const nodes = this._daySepNodes(box);
      let removed = 0;
      nodes.forEach((wrap) => {
        // a bubble imediatamente seguinte (ignorando nós de altura 0) é a
        // mensagem dona do dia; sem ela, o separador é órfão
        let sib = wrap.nextElementSibling;
        while (sib && sib.getBoundingClientRect().height === 0) sib = sib.nextElementSibling;
        if (sib && sib.classList.contains('bubble')) return;
        removed += 1;
        this._fadeOutDaySep(wrap);
      });
      return removed;
    },

    // Saída do separador: colapsa a altura reservada e dissolve o pill.
    _fadeOutDaySep(wrap) {
      if (!wrap || wrap._sepOut) return;
      wrap._sepOut = true;
      const h = wrap.getBoundingClientRect().height;
      const done = () => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
      wrap.style.maxHeight = h + 'px';
      wrap.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        wrap.classList.add('day-sep-out');
        wrap.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 420); // fallback (reduced-motion / transição cortada)
      });
    },

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
        this._hideLoadSkeleton();
        this._daySepNodes(box).forEach((n) => n.remove());
        this._syncScrollMetrics();
        this._applyCozyEmptyCopy(empty);
        this._bindEmptyCta();
        return;
      }
      empty.classList.add('hidden');
      const { items, hasMore, cursor, oldestTs } = Store.pageNotes(this.activeThread, this.oldestKey, PAGE_SIZE);
      const frag = document.createDocumentFragment();
      if (reset) {
        this._daySepNodes(box).forEach((n) => n.remove());
        this.renderedClientIds.clear();
        // O reset tem que ESVAZIAR o fluxo, não só o conjunto de ids.
        //
        // Limpar `renderedClientIds` sozinho não remove nada do DOM: as bolhas
        // da conversa anterior continuavam dentro de #messages, e a página nova
        // era inserida logo abaixo do #load-slot — ou seja, ACIMA delas. O
        // resultado era o fluxo mostrando as duas conversas misturadas.
        //
        // Só saem as BOLHAS e os separadores. Os elementos de interface que
        // vivem dentro de #messages por posição no DOM (o #load-slot, que
        // segura o indicador, e o #empty-state, o estado "nada por aqui") são
        // preservados: removê-los quebrava o render seguinte, que.ENCONTRAVA o
        // #empty-state como null e morria antes de pintar a conversa nova —
        // o que devolvia o sintoma original (a anterior ficava na tela).
        box.querySelectorAll('.bubble, .day-sep-wrap, .day-sep').forEach((el) => el.remove());
        // A âncora NÃO é gravada aqui de propósito.
        //
        // `pageNotes` devolve `cursor` = a chave da primeira nota desta
        // página, e o corte da próxima chamada é `>=` — ou seja, o cursor
        // aponta para a PRIMEIRA nota, que o `findIndex` reencontra como
        // início da página seguinte. Deixar `oldestKey` em `null` faz o
        // primeiro scroll do usuário paginar a partir do fim da lista, que é
        // exatamente o que ainda não foi pintado.
        //
        // Gravar aqui consumia essa página duas vezes: o boot pintava 25
        // notas e deixava a âncora no início delas, então o primeiro scroll
        // recebia de novo as mesmas 25, o filtro de idempotência descartava
        // tudo, e a âncora saltava para a página seguinte sem renderizar
        // nada. Medido: 60 notas, 25 apareciam, e o botão de carregar mais
        // ficava visível sem efeito.
        this.oldestTs = oldestTs;
      }
      const before = box.querySelector('.bubble, .day-sep-wrap');
      // No load-older (não reset), sincroniza o dia-base com a bolha já existente
      // para que o separador certo apareça entre notas novas (mais antigas) e as já renderizadas.
      // O separador é o WRAPPER, que não tem data-day: usa a da bolha que vem depois.
      let lastDay = before && !reset
        ? (before.dataset.day || (before.nextElementSibling && before.nextElementSibling.dataset ? before.nextElementSibling.dataset.day : null))
        : null;
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
      // o ponto de inserção é o SLOT, que fica no topo do fluxo e sempre
      // presente — as mensagens entram logo abaixo dele
      const slot = $('#load-slot');
      box.insertBefore(frag, reset ? slot.nextSibling : (before || slot));
      // separadores que ficaram sem mensagem do seu dia saem com animação
      this._pruneOrphanDaySeps(box);
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
      // métricas de scroll coerentes com o DOM final (a barra de rolagem
      // representava a altura anterior quando os nós saíam sem re-render)
      this._syncScrollMetrics();
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
};
