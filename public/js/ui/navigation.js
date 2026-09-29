import { PAGE_SIZE, esc, fmtTime, $ } from '../utils.js';
import { ICON, wrapSvg } from '../icons.js';
import { Store } from '../store.js';

export const NavigationMethods = {
    // Estado ligado dos botões do cabeçalho do explorador (Pendências,
    // Lembretes, Notificações) — mesma linguagem da lupa, que fica sólida
    // quando a busca está aberta.
    // Deriva do DOM em vez de guardar flag: qualquer caminho que abre/fecha uma
    // página (page-switcher, atalho, notificação, clique-fora) fica coerente
    // sem precisar lembrar de "desligar" o botão anterior.
    syncExplorerChrome() {
      const isOpen = (id) => {
        const el = document.getElementById(id);
        return !!el && !el.classList.contains('hidden');
      };
      const set = (id, on) => {
        const b = document.getElementById(id);
        if (!b) return;
        b.classList.toggle('active', !!on);
        b.setAttribute('aria-pressed', String(!!on));
      };
      set('explorer-tasks', isOpen('tasks-page'));
      set('explorer-reminders', isOpen('reminders-page'));
      set('btn-notifications', isOpen('notif-popover'));
    },

    showSearchPage(q) {
      const page = document.getElementById('search-page');
      const label = document.getElementById('search-query-label');
      const results = document.getElementById('search-page-results');
      if (!page) return;
      document.getElementById('messages').classList.add('hidden');
      document.getElementById('backlinks').classList.add('hidden');
      document.getElementById('live-region').classList.add('hidden');
      page.classList.remove('hidden');
      document.getElementById('reminders-page')?.classList.add('hidden');
      document.getElementById('tasks-page')?.classList.add('hidden');
      document.getElementById('ai-page')?.classList.add('hidden');
      document.getElementById('daily-page')?.classList.add('hidden');
      if (label) label.textContent = q ? `"${q}"` : '';
      // reutiliza runSearch para popular a página completa
      const tmpClear = { classList: { add(){}, remove(){} } };
      this.runSearch(q, results, tmpClear);
      history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
      this.syncExplorerChrome();
    },
    hideSearchPage() {
      const page = document.getElementById('search-page');
      if (page) page.classList.add('hidden');
      document.getElementById('messages').classList.remove('hidden');
      document.getElementById('backlinks').classList.remove('hidden');
      history.replaceState(null, '', location.pathname);
      this.syncExplorerChrome();
    },
    bindSearch() {
      const input = this.dom.searchInput, clear = this.dom.searchClear, results = this.dom.searchResults;
      const run = () => {
        const q = input.value.trim();
        // se tem filtro, Enter abre página cheia no canvas
        if (q && (q.includes('in:') || q.includes('#') || q.includes('rx:') || q.includes('depois:') || q.includes('antes:'))) {
          // mostra preview rápido ainda, mas Enter levará para página
        }
        this.runSearch(q, results, clear);
      };
      input.addEventListener('input', run);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { input.value = ''; run(); input.blur(); this.hideSearchPage(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = Array.from(results.querySelectorAll('.search-result'));
          if (!items.length) return;
          const cur = items.indexOf(document.activeElement);
          let next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
          if (next < 0) next = items.length - 1; if (next >= items.length) next = 0;
          items[next].focus();
        } else if (e.key === 'Enter') {
          const q = input.value.trim();
          if (q && (q.includes('in:') || q.includes('#') || q.includes('rx:') || q.includes('depois:') || q.includes('antes:'))) {
            e.preventDefault();
            this.showSearchPage(q);
            return;
          }
          const first = results.querySelector('.search-result'); if (first) first.click();
        }
      });
      clear.addEventListener('click', () => { input.value = ''; input.focus(); run(); });
      // fecha resultados ao clicar fora
      document.addEventListener('click', (e) => {
        if (!results.classList.contains('hidden') && !results.contains(e.target) && e.target !== input && e.target !== clear) {
          results.classList.add('hidden');
        }
      });
    },
    _parseSearch(q) {
      const tokens = q.trim().split(/\s+/);
      let textParts = [], inFilter = null, tagFilter = null, rxFilter = null, depois = null, antes = null;
      for (const tok of tokens) {
        const low = tok.toLowerCase();
        if (low.startsWith('rx:') && tok.length > 3) {
          // filtro por reação: rx:🔥 ou rx:fire (sinônimos em pt para as principais)
          const w = tok.slice(3);
          const alias = { coracao: '❤️', coração: '❤️', amor: '❤️', brilho: '✨', flor: '🌸', sorriso: '😊', joinha: '👍', obrigado: '🙏', fogo: '🔥', estrela: '⭐', ok: '✅', erro: '❌', importante: '❗', pergunta: '❓', ideia: '💡', alvo: '🎯', pino: '📌', olho: '👀', top: '💯', risada: '😂', duvida: '🤔', dúvida: '🤔' };
          const direct = [...w].find((ch) => this.REACTIONS.includes(ch));
          rxFilter = direct || alias[w] || w;
        }
        else if (low.startsWith('in:') && low.length > 3) inFilter = tok.slice(3);
        else if (low.startsWith('#') && low.length > 1) tagFilter = tok.slice(1);
        else if (low.startsWith('depois:') && low.length > 7) {
          const d = new Date(tok.slice(7)); if (!isNaN(d)) depois = d;
        } else if (low.startsWith('antes:') && low.length > 6) {
          const d = new Date(tok.slice(6)); if (!isNaN(d)) antes = d;
        } else textParts.push(tok);
      }
      return { text: textParts.join(' ').trim(), textLower: textParts.join(' ').toLowerCase(), inFilter: inFilter ? inFilter.toLowerCase() : null, tagFilter: tagFilter ? tagFilter.toLowerCase() : null, rxFilter, depois, antes };
    },
    runSearch(q, results, clear) {
      if (!q) { this._searchShowAll = false; results.classList.add('hidden'); results.innerHTML = ''; clear.classList.add('hidden'); return; }
      clear.classList.remove('hidden');
      const p = this._parseSearch(q);
      const hits = [];
      Object.entries(Store.data.notes).forEach(([tid, arr]) => {
        const th = Store.getThread(tid); if (!th) return;
        // in: filtro por nome da thread
        if (p.inFilter && !th.name.toLowerCase().includes(p.inFilter)) return;
        arr.forEach((n) => {
          if (p.depois && n.ts < p.depois.getTime()) return;
          if (p.antes && n.ts > p.antes.getTime()) return;
          if (p.tagFilter) {
            if (!n.tags || !n.tags.some((t) => t.toLowerCase().includes(p.tagFilter))) return;
          }
          // filtro por reação (rx:🔥): nota deve ter o emoji com ≥1 usuário
          if (p.rxFilter && !(n.reactions && n.reactions[p.rxFilter] && n.reactions[p.rxFilter].length)) return;
          // texto livre (se vazio, já passou pelos filtros)
          if (p.text) {
            const inText = n.text && n.text.toLowerCase().includes(p.textLower);
            if (!inText) return;
          }
          hits.push({ tid, th, n });
        });
      });
      Store.threadList().forEach((th) => {
        if (p.tagFilter || p.depois || p.antes) return; // filtros de nota não aplicam a thread vazia
        if (p.inFilter && !th.name.toLowerCase().includes(p.inFilter)) return;
        if (p.text && !th.name.toLowerCase().includes(p.textLower)) return;
        if (!p.text && !p.inFilter) return;
        hits.push({ tid: th.id, th, n: null });
      });
      // ordena: nota mais recente primeiro
      hits.sort((a, b) => (b.n ? b.n.ts : 0) - (a.n ? a.n.ts : 0));
      if (!hits.length) {
        // dica contextual conforme o filtro usado
        let hint = 'Tente outras palavras ou remova filtros.';
        if (p.tagFilter) hint = 'Nenhuma mensagem com #' + esc(p.tagFilter) + '. Verifique a grafia da tag.';
        else if (p.rxFilter) hint = 'Nenhuma nota reagida com ' + p.rxFilter + '. Tente rx: + outro emoji (ex.: rx:🔥).';
        else if (p.inFilter) hint = 'Nenhuma conversa com esse nome. Verifique a grafia ou crie uma nova.';
        else if (p.depois || p.antes) hint = 'Nenhuma mensagem nesse período. Tente ampliar as datas.';
        results.innerHTML = '<div class="sr-empty"><div class="sr-empty-title">Nenhum resultado para "' + esc(q) + '"</div><div class="sr-empty-hint">' + hint + '</div></div>';
        results.classList.remove('hidden');
        return;
      }
      const max = 30;
      const showAll = this._searchShowAll;
      const visible = showAll ? hits : hits.slice(0, max);
      const extra = hits.length - visible.length;
      const hl = p.text || p.tagFilter || p.inFilter || '';
      const itemHtml = visible.map((h) => {
        if (h.n) {
          let snippet = h.n.text.slice(0, 80);
          if (p.text) {
            const idx = h.n.text.toLowerCase().indexOf(p.textLower);
            const start = Math.max(0, idx - 24);
            snippet = (start > 0 ? '…' : '') + h.n.text.slice(start, start + 80);
          }
          const escSnippet = esc(snippet);
          const highlighted = hl ? escSnippet.replace(new RegExp('(' + hl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>') : escSnippet;
          const tagLine = h.n.tags && h.n.tags.length ? `<div class="sr-tags">${h.n.tags.map(t=>`#${esc(t)}`).join(' ')}</div>` : '';
          return `<button class="search-result" data-tid="${h.tid}" data-cid="${h.n.clientId}">
            <div class="sr-thread">${wrapSvg(ICON.bubble, 13)} ${esc(h.th.name || 'Sem título')}</div>
            <div class="sr-text">${highlighted}</div>${tagLine}
            <div class="sr-meta">${fmtTime(h.n.ts)}${h.n.edited ? ' · editada' : ''}</div>
          </button>`;
        }
        return `<button class="search-result" data-tid="${h.tid}">
          <div class="sr-thread">${wrapSvg(ICON.bubble, 13)} ${esc(h.th.name || 'Sem título')}</div>
          <div class="sr-meta">Conversa</div>
        </button>`;
      }).join('');
      const extraHtml = (extra > 0)
        ? `<button class="search-more" id="sr-more">+${extra} resultado${extra !== 1 ? 's' : ''} — mostrar tudo</button>`
        : '';
      const filterChips = [];
      if (p.rxFilter) filterChips.push(`reação: ${p.rxFilter}`);
      if (p.inFilter) filterChips.push(`em: ${esc(p.inFilter)}`);
      if (p.tagFilter) filterChips.push(`#${esc(p.tagFilter)}`);
      if (p.depois) filterChips.push(`depois: ${p.depois.toLocaleDateString('pt-BR')}`);
      if (p.antes) filterChips.push(`antes: ${p.antes.toLocaleDateString('pt-BR')}`);
      const countHtml = `<div class="sr-count">${hits.length} resultado${hits.length !== 1 ? 's' : ''}${filterChips.length ? ` · filtros: ${filterChips.join(', ')}` : ''}</div>`;
      results.innerHTML = countHtml + itemHtml + extraHtml;
      results.querySelectorAll('.search-result').forEach((b) => b.addEventListener('click', () => {
        const tid = b.dataset.tid, cid = b.dataset.cid;
        results.classList.add('hidden');
        this.openThread(tid);
        if (cid) setTimeout(() => this.scrollToNote(cid), 250);
      }));
      const moreBtn = results.querySelector('#sr-more');
      if (moreBtn) moreBtn.addEventListener('click', () => { this._searchShowAll = true; this.runSearch(q, results, clear); });
      results.classList.remove('hidden');
    },
    scrollToNote(cid) {
      // garante que a nota está renderizada (carrega páginas antigas se preciso)
      const el = document.querySelector(`.bubble[data-client-id="${cid}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); return; }
      // não está na tela: pagina até encontrar
      let guard = 0;
      const tryMore = () => {
        const found = document.querySelector(`.bubble[data-client-id="${cid}"]`);
        if (found) { found.scrollIntoView({ behavior: 'smooth', block: 'center' }); found.classList.remove('flash'); void found.offsetWidth; found.classList.add('flash'); return; }
        if (guard++ > 20) return;
        const { hasMore } = Store.pageNotes(this.activeThread, this.oldestTs, 25);
        if (hasMore) { this.oldestTs = Store.notesFor(this.activeThread).slice(-1)[0] ? this.oldestTs : this.oldestTs; this.renderMessages(true); setTimeout(tryMore, 60); }
      };
      tryMore();
    },

    // ---------- Atalhos de teclado ----------
    bindShortcuts() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
        const mod = e.ctrlKey || e.metaKey;

        // Ctrl/Cmd+K → foca a busca (mesmo digitando, rouba o foco)
        if (mod && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          const s = this.dom.searchInput; if (s) { s.focus(); s.select(); }
          return;
        }
        // Ctrl/Cmd+N → nova conversa
        if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) {
          e.preventDefault(); if (Store.user) this.createThread(); return;
        }
        // Ctrl/Cmd+Shift+F → nova pasta
        if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
          e.preventDefault(); if (Store.user) this.createFolder(); return;
        }
        // Ctrl/Cmd+[ e Ctrl/Cmd+] → conversa anterior/próxima na sidebar
        if (mod && !e.shiftKey && (e.key === '[' || e.key === ']')) {
          e.preventDefault(); this.navThreads(e.key === ']' ? 1 : -1); return;
        }
        // ? → painel de atalhos (fora de input)
        if (e.key === '?' && !typing) {
          e.preventDefault(); this.showShortcutsHelp(); return;
        }
        // Esc → fecha popovers/modal ou limpa busca com filtros
        if (e.key === 'Escape') {
          // modal aberto: ele mesmo já tratou (focus trap) — não processar aqui
          if (this.dom.modal && !this.dom.modal.classList.contains('hidden')) return;
          const searchHasValue = this.dom.searchInput && this.dom.searchInput.value.trim();
          if (searchHasValue && !typing) {
            this.dom.searchInput.value = '';
            this.runSearch('', this.dom.searchResults, this.dom.searchClear);
            return;
          }
          ['msgPopover', 'pinPopover', 'settingsPopover', 'searchResults'].forEach((k) => {
            if (this.dom[k]) this.dom[k].classList.add('hidden');
          });
          if (this.dom.ctx) this.dom.ctx.classList.add('hidden');
          if (this.dom.modal && !this.dom.modal.classList.contains('hidden')) this.closeModal();
        }
      });
    },
    // navega entre as conversas visíveis na sidebar (favoritas + soltas + dentro de pastas)
    navThreads(dir) {
      const els = Array.from(document.querySelectorAll('.tnode')).filter((el) => !el.classList.contains('children') && el.dataset && el.dataset.tid);
      if (!els.length) return;
      const ids = els.map((el) => el.dataset.tid);
      let idx = this.activeThread ? ids.indexOf(this.activeThread) : -1;
      idx = (idx + dir + ids.length) % ids.length;
      const next = ids[idx];
      if (next) { this.openThread(next); els.find((el) => el.dataset.tid === next).scrollIntoView({ block: 'nearest' }); }
    },
    showShortcutsHelp() {
      const rows = [
        ['Ctrl/⌘ + K', 'Buscar notas e conversas'],
        ['in:trabalho', 'Filtrar por conversa'],
        ['#urgente', 'Filtrar por tag'],
        ['rx:🔥', 'Notas reagidas com 🔥'],
        ['depois:2026-01-01', 'Após data'],
        ['antes:2026-12-31', 'Antes de data'],
        ['Ctrl/⌘ + N', 'Nova conversa'],
        ['Ctrl/⌘ + Shift + F', 'Nova pasta'],
        ['Ctrl/⌘ + L', 'Checklist'],
        ['@', 'Mencionar thread'],
        ['Ctrl/⌘ + [ / ]', 'Conversa anterior / próxima'],
        ['Enter', 'Enviar nota (no composer)'],
        ['Shift + Enter', 'Quebra de linha (no composer)'],
        ['Esc', 'Fechar popovers / limpar busca'],
        ['?', 'Abrir este painel'],
      ];
      const body = '<div style="display:flex;flex-direction:column;gap:8px">' + rows.map(([k, v]) =>
        `<div style="display:flex;justify-content:space-between;gap:16px;font-size:14px"><span style="font-weight:700;color:var(--accent)">${k}</span><span style="color:var(--text-dim)">${v}</span></div>`
      ).join('') + '</div>';
      this.showModal('Atalhos de teclado', body, () => this.closeModal());
    },

    // ---------- Swipe (mobile) ----------
    bindSwipe() {
      let sx = 0, sy = 0, st = 0;
      const app = $('#app');
      const SWIPE_THRESH = 60; // px mínimo para considerar swipe
      const SWIPE_TIME = 400;  // ms máximo para considerar swipe rápido
      const VERTICAL_SLOP = 80; // tolerância vertical

      document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        sx = t.clientX; sy = t.clientY; st = Date.now();
      }, { passive: true });

      document.addEventListener('touchend', (e) => {
        if (!sx && !sy) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        const dt = Date.now() - st;
        sx = sy = st = 0;

        if (dt > SWIPE_TIME || Math.abs(dy) > VERTICAL_SLOP) return;
        if (Math.abs(dx) < SWIPE_THRESH) return;

        // arrastar para a DIREITA = voltar, em qualquer tela
        if (dx > 0) { this.goBack(); return; }
        // arrastar para a ESQUERDA = entrar na conversa (só no explorador)
        if (dx < 0 && app && !app.classList.contains('show-chat')) app.classList.add('show-chat');
      }, { passive: true });
    },

    // Fecha a camada mais alta aberta (modal, seletor de reações, menu de
    // ações da mensagem, popover da conversa, preview da nota, lightbox).
    // Retorna true SE fechou algo — o chamador consome o gesto e não navega.
    dismissTopLayer() {
      const hide = (id) => { const el = document.getElementById(id); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); return true; } return false; };
      // modal: closeModal (restaura o foco no gatilho), nunca .hidden cru
      const modal = this.dom && this.dom.modal;
      if (modal && !modal.classList.contains('hidden')) { this.closeModal(); return true; }
      // o seletor de reações é uma VISTA dentro do popover de mensagens:
      // fecha ela primeiro, e só no gesto seguinte o popover inteiro
      const pop = (this.dom && this.dom.msgPopover) || document.getElementById('msg-popover');
      if (pop && !pop.classList.contains('hidden')) {
        const picker = pop.querySelector('.rp-view[data-rp-view="picker"]');
        if (picker && !picker.classList.contains('hidden')) { this._showRpView(pop, 'menu'); return true; }
        pop.classList.add('hidden');
        return true;
      }
      if (hide('chat-title-menu')) { this.syncExplorerChrome(); return true; }
      if (hide('note-preview')) return true;
      if (hide('lightbox')) return true;
      if (hide('pin-popover')) return true;
      if (hide('ctx-menu')) return true;
      if (hide('search-results')) return true;
      if (hide('notif-popover')) { this.syncExplorerChrome(); return true; }
      if (hide('rem-popover')) { this.syncExplorerChrome(); return true; }
      if (hide('settings-popover')) return true;
      return false;
    },

    // "Voltar" único do celular — usado pelo botão ‹ E pelo arrasto lateral.
    goBack() {
      // nível 1: fecha a camada aberta
      if (this.dismissTopLayer()) return 'dismissed';
      const app = $('#app');
      if (!app) return false;
      // nível 2: página de workspace (IA/Diária/Lembretes/Pendências/Busca)
      // volta para a lista de conversas ANTES do explorador
      if (this._workspaceTab && this._workspaceTab !== 'conversations') {
        this.showWorkspaceTab('conversations');
        return 'workspace';
      }
      // nível 2: conversa aberta → explorador de conversas e pastas
      if (app.classList.contains('show-chat')) {
        app.classList.remove('show-chat');
        this.closeNotePreview();
        return 'explorer';
      }
      // nível 3: já no explorador → minimiza o app
      return this.minimizeApp() ? 'minimized' : 'nothing';
    },

    // Minimizar o app. Existe API real numa WebView (Capacitor/Cordova). Numa
    // PWA instalada o navegador NÃO expõe minimize, e window.close() é
    // ignorado fora de janelas abertas por script — chamar isso aqui fecharia
    // o app de vez e perderia o estado. Nesse caso devolvemos false para o
    // chamador avisar o usuário, em vez de fingir que minimizou.
    minimizeApp() {
      const win = window;
      if (win.Capacitor && win.Capacitor.Plugins && win.Capacitor.Plugins.MinimizeApp) {
        win.Capacitor.Plugins.MinimizeApp.minimize();
        return true;
      }
      if (win.navigator && win.navigator.app && win.navigator.app.minimize) {
        win.navigator.app.minimize();
        return true;
      }
      return false;
    },
};

