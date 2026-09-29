// NoteThread — entry point (ES Modules, sem build step)
import { haptic, $, uid, esc, fmtTime, now, hideWithExit } from './js/utils.js';
import { ICON, wrapSvg } from './js/icons.js';
import { renderMarkdown } from './js/markdown.js';
import { Store } from './js/store.js';
import { CUELUME_SOUNDS, Sound } from './js/sound.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_SUPABASE, getSupa, Sync } from './js/sync-supabase.js';
import { Updater } from './js/updater.js';
import { PickerMethods } from './js/ui/picker.js';
import { NavigationMethods } from './js/ui/navigation.js';
import { MessagesMethods } from './js/ui/messages.js';
import { MessagesBubbleMethods } from './js/ui/messages-bubble.js';
import { MessagesReactionsMethods } from './js/ui/messages-reactions.js';
import { MessagesEditMethods } from './js/ui/messages-edit.js';
import { MessagesScrollMethods } from './js/ui/messages-scroll.js';
import { MentionMethods } from './js/ui/mentions.js';
import { ReminderMethods } from './js/ui/reminders.js';
import { TasksMethods } from './js/ui/tasks.js';
import { WorkspaceMethods } from './js/ui/workspace.js';
import { SettingsMethods } from './js/ui/settings.js';
import { AuthMethods } from './js/ui/auth.js';
import { TreeMethods } from './js/ui/tree.js';
import { ComposerMethods } from './js/ui/composer.js';
import { ComposerAudioMethods } from './js/ui/composer-audio.js';
import { ComposerMarkdownMethods } from './js/ui/composer-markdown.js';
import { ComposerListsMethods } from './js/ui/composer-lists.js';
import { SyncEventsMethods } from './js/ui/sync-events.js';
import { injectPartials } from './js/partials.js';

// bundle ES Modules carregado

(async () => {
  'use strict';

  // UI / CONTROLLER
  // ===================================================================
  const UI = {
async init() {
      this.dom = {
        tree: $('#tree'), favSection: $('#fav-section'), favList: $('#fav-list'),
        ctx: $('#ctx-menu'), modal: $('#modal'), modalTitle: $('#modal-title'),
        modalBody: $('#modal-body'), modalOk: $('#modal-ok'), modalCancel: $('#modal-cancel'),
        msgPopover: $('#msg-popover'), pinPopover: $('#pin-popover'),
        pinBody: $('#pin-body'), btnPin: $('#btn-pin'),
        settingsPopover: $('#settings-popover'), btnSettings: $('#btn-settings'), navSettings: $('#nav-settings'),
        searchInput: $('#search-input'), searchClear: $('#search-clear'), searchResults: $('#search-results'),
        btnAttach: $('#btn-attach'), fileInput: $('#file-input'), attachPreview: $('#attach-preview'),
      };
      this.longPressTimer = null;
      this.tnodeLongPressTimer = null;
      this.bindAuth();
      this.bindTreeActions();
      this.bindTreeDnd();
      this.bindComposer();
      this.bindThreadTitle();
      this.bindSync();
      this.bindContextMenu();
      // Explorer: lembretes + pendências no header
        const expRem = document.getElementById('explorer-reminders');
      if (expRem) {
        // Lembretes é aba do workspace (a lista é a mesma); alterna como a lupa
        expRem.addEventListener('click', () => {
          if (this._workspaceTab === 'reminders') { this.showWorkspaceTab('conversations'); this._mobileBackToExplorer(); return; }
          this.showWorkspaceTab('reminders');
          this._mobileRevealCanvas();
        });
        const backRem = document.getElementById('reminders-back');
        if (backRem) backRem.addEventListener('click', () => this.showWorkspaceTab('conversations'));
        this.updateRemBadge();
      }
      const expTasks = document.getElementById('explorer-tasks');
      if (expTasks) {
        // alterna como a lupa: clicar com a página já aberta fecha (volta às conversas)
        expTasks.addEventListener('click', () => {
          const open = document.getElementById('tasks-page') && !document.getElementById('tasks-page').classList.contains('hidden');
          if (open) { this.hideTasksPage(); this._mobileBackToExplorer(); return; }
          this.showTasksPage();
          this._mobileRevealCanvas();
        });
        const backTasks = document.getElementById('tasks-back');
        if (backTasks) backTasks.addEventListener('click', () => { this.hideTasksPage(); this._mobileBackToExplorer(); });
        this.updateTasksBadge();
      }
      const notifBtn = document.getElementById('btn-notifications');
      if (notifBtn) {
        notifBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleNotifPopover(); });
        document.addEventListener('click', (e) => {
          const p = document.getElementById('notif-popover');
          if (p && !p.classList.contains('hidden') && !p.contains(e.target) && !notifBtn.contains(e.target)) {
            p.classList.add('hidden');
            this.syncExplorerChrome(); // desliga o estado do sino
          }
        });
        // Esc fecha o popover de notificações (e desliga o botão)
        document.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          const p = document.getElementById('notif-popover');
          if (p && !p.classList.contains('hidden')) { p.classList.add('hidden'); this.syncExplorerChrome(); }
        });
        this.updateNotifBadge();
        // atualiza badge quando lembretes mudam
        const origCheck = this._checkReminders.bind(this);
        this._checkReminders = () => { origCheck(); this.updateNotifBadge(); };
        // "Marcar todas como lidas" no centro de notificações
        document.getElementById('notif-clear')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.markAllNotifsRead();
        });
      }
      const backSearch = document.getElementById('search-back');
      if (backSearch) backSearch.addEventListener('click', () => this.hideSearchPage());
      // Seletor de páginas do explorador: binding no bindWorkspace() (ui/workspace.js)
      // Perfil popover
      const profileBtn = document.getElementById('profile-btn');
      const profilePop = document.getElementById('profile-popover');
      if (profileBtn && profilePop) {
        profileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          profilePop.classList.toggle('hidden');
          if (profilePop.classList.contains('hidden')) return;
          // posiciona INTEIRAMENTE acima do botão: mede a altura REAL do
          // popover (estimativa hardcoded cobria o nome/avatar do login)
          const r = profileBtn.getBoundingClientRect();
          const pw = profilePop.offsetWidth || 200;
          const ph = profilePop.offsetHeight || 100;
          let top = r.top - ph - 8;
          if (top < 8) top = r.bottom + 8;
          let left = Math.min(r.left, window.innerWidth - pw - 8);
          profilePop.style.left = Math.max(8, left) + 'px';
          profilePop.style.top = top + 'px';
        });
        document.addEventListener('click', (e) => {
          if (!profilePop.contains(e.target) && !profileBtn.contains(e.target)) profilePop.classList.add('hidden');
        });
        document.getElementById('profile-config')?.addEventListener('click', (e) => {
          e.stopPropagation();
          profilePop.classList.add('hidden');
          // pequeno delay para não ser fechado pelo handler global do settings popover
          setTimeout(() => this.toggleSettingsPopover(), 10);
        });
        // Como usar: abre o guia de uso em nova aba (página estática, não o app)
        document.getElementById('profile-help')?.addEventListener('click', (e) => {
          e.stopPropagation();
          profilePop.classList.add('hidden');
          window.open('help.html', '_blank', 'noopener');
        });
        // Atualizar app: clique = instalar a versão nova (SW waiting assume + reload)
        document.getElementById('profile-update')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const done = (lc) => {
            if (lc && lc.state === 'update') Updater.applyUpdate();
            else if (lc && lc.state === 'current') this.toast('Você já está na versão mais recente', { kind: 'success', duration: 3000 });
          };
          const lc = Updater.lastCheck;
          if (!lc || ['offline', 'error', 'checking'].includes(lc.state)) {
            // estado velho/sem resposta: verifica de novo antes de decidir
            Updater.check().then(() => done(Updater.lastCheck));
            return;
          }
          if (lc.state === 'update') Updater.applyUpdate();
          else Updater.check().then(() => done(Updater.lastCheck)); // revalida e avisa
        });
        // Instalar app: prompt nativo de instalação do PWA (beforeinstallprompt).
        // Fica escondido por padrão — só aparece quando o browser sinaliza que
        // pode instalar (Chrome/Android/Edge; Safari iOS usa "Adicionar à Tela").
        const installBtn = document.getElementById('profile-install');
        const installLabel = document.getElementById('install-label');
        if (installBtn) {
          let deferredPrompt = null;
          // o browser só dispara beforeinstallprompt quando o app NÃO está
          // instalado — exibir incondicionalmente (flag persistida ficava
          // presa após desinstalar: dados do site sobrevivem ao uninstall)
          window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.classList.remove('hidden');
          });
          // aceitou o prompt agora → esconde já (antes do reload)
          window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            installBtn.classList.add('hidden');
          });
          // já rodando instalado (standalone) → nunca oferecer de novo
          if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            installBtn.classList.add('hidden');
          }
          installBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            try {
              const { outcome } = await deferredPrompt.userChoice;
              if (outcome === 'accepted' && installLabel) installLabel.textContent = 'Instalando…';
            } catch {}
            deferredPrompt = null;
            installBtn.classList.add('hidden');
          });
        }
        document.getElementById('profile-logout')?.addEventListener('click', async () => {
          const supa = this._getSupa && this._getSupa();
          if (supa) try { await supa.auth.signOut(); } catch {}
          Store.setUser(null); this.renderAuthOrApp();
          profilePop.classList.add('hidden');
        });
      }
      // (o toggle do popover de configurações é ligado em bindSettings, ancorado no #nav-settings)
      this.bindModal();
      this.bindMsgPopover();
      this.bindPinPopover();
      this.bindPinButton();
      this.bindSettings();
      this.bindFooter();
      this.bindSearch();
      this.bindShortcuts();
      this.bindSwipe();
      this.bindWorkspace();
      this.initReminders();
      // persistência de login: restaura sessão Supabase antes do primeiro render
      if (USE_SUPABASE) {
        try {
          // timeout 3s: se esm.sh/Supabase não responder, renderiza offline mesmo assim
          const supa = await Promise.race([
            this._ensureSupa(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
          ]);
          if (supa) {
            const { data: { session } } = await supa.auth.getSession();
            if (session && session.user) {
              // lembrar-me desmarcado na última sessão → não restaura login
              if (Store.data.ui && Store.data.ui.rememberMe === false) { try { await supa.auth.signOut(); } catch {} Store.setUser(null); }
              else Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id, photo: (session.user.user_metadata && session.user.user_metadata.picture) || null });
            }
          }
        } catch (e) { /* offline/timeout, mantém Store.user local */ }
      }
      this.removeSplash();
      this.renderAuthOrApp();
      // estado inicial dos botões do cabeçalho do explorador (nada aberto)
      this.syncExplorerChrome();
      // check de atualização na abertura do app (indicador no popover do perfil)
      Updater.check({ silent: true });
      // atualiza o rótulo de "última sincronização" a cada 15s
      setInterval(() => this.updateSyncLabel(), 15000);
    },

removeSplash() {
      // tira o boot splash (primeira carga no mobile/PWA): fade rápido + remoção
      const sp = document.getElementById('boot-splash');
      if (!sp) return;
      sp.classList.add('boot-done');
      setTimeout(() => sp.remove(), 400);
    },

    // Pendências/Lembretes/Busca são páginas do canvas: no mobile a sidebar
    // cobre o canvas até o primeiro .show-chat — sem isso o clique "não faz nada"
    _mobileRevealCanvas() {
      if (window.matchMedia('(max-width: 760px)').matches) document.getElementById('app').classList.add('show-chat');
    },
    _mobileBackToExplorer() {
      if (window.matchMedia('(max-width: 760px)').matches) document.getElementById('app').classList.remove('show-chat');
    },

updateSyncLabel() {
      const el = $('#sync-status'); if (!el) return;
      const state = el.dataset.state;
      const base = el.dataset.status || 'Sincronizado';
      if (state === 'online' && Sync.lastSync) {
        const secs = Math.round((Date.now() - Sync.lastSync) / 1000);
        let rel;
        if (secs < 5) rel = 'agora';
        else if (secs < 60) rel = `há ${secs}s`;
        else if (secs < 3600) rel = `há ${Math.floor(secs / 60)}min`;
        else rel = `há ${Math.floor(secs / 3600)}h`;
        el.title = `${base} ${rel}`;
      } else {
        el.title = base;
      }
    },

bindFooter() {
      const st = $('#sync-status');
      if (st) st.addEventListener('click', (e) => {
        e.stopPropagation();
        const label = st.dataset.status || 'Status';
        // toast leve no mobile (desktop já tem title no hover)
        const t = document.createElement('div');
        t.textContent = label;
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:#fff;padding:8px 16px;border-radius:10px;font-size:13px;z-index:999;box-shadow:var(--shadow-md);opacity:0;transition:opacity .2s';
        document.body.appendChild(t);
        requestAnimationFrame(() => { t.style.opacity = '1'; });
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 1600);
      });
    },

toast(msg, opts) {
      opts = opts || {};
      const t = document.createElement('div');
      t.className = 'app-toast' + (opts.kind ? ' ' + opts.kind : '');
      const span = document.createElement('span');
      span.className = 'toast-msg';
      span.textContent = msg;
      t.appendChild(span);
      let hideTimer = null;
      const hide = () => {
        if (hideTimer) clearTimeout(hideTimer);
        if (t._leaving) return;
        t._leaving = true;
        // animação de saída: desliza para cima + fade antes de remover
        t.classList.remove('show');
        t.classList.add('leaving');
        setTimeout(() => t.remove(), 180);
      };
      if (opts.action && opts.action.fn) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = opts.action.label || 'Desfazer';
        btn.addEventListener('click', (e) => { e.stopPropagation(); opts.action.fn(); hide(); });
        t.appendChild(btn);
      }
      document.body.appendChild(t);
      requestAnimationFrame(() => { t.classList.add('show'); });
      hideTimer = setTimeout(hide, opts.duration || 2600);
    },    bindModal() {
      this.dom.modalCancel.addEventListener('click', () => this.closeModal());
      this.dom.modalOk.addEventListener('click', () => {
        if (!this.modalOkHandler) return;
        try { this.modalOkHandler(); }
        // exceção num handler não pode deixar modal-fantasma preso na tela
        // (trava o app inteiro); fecha e registra para diagnóstico
        catch (err) { console.error('[modal] handler falhou', err); this.closeModal(); }
      });
      // Focus trap (a11y): Tab circula só dentro do modal; Esc fecha
      this.dom.modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); this.closeModal(); return; }
        if (e.key !== 'Tab') return;
        const focusables = this.dom.modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...focusables].filter((el) => !el.disabled && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    },

closeModal() {
      // M2: saída animada antes de esconder
      hideWithExit(this.dom.modal);
      this.modalOkHandler = null;
      this.dom.modalOk.classList.remove('btn-danger', 'danger');
      this.dom.modalOk.classList.add('primary');
      this.dom.modalOk.textContent = 'OK';
      // devolve o foco ao gatilho que abriu o modal
      if (this._modalTrigger && document.contains(this._modalTrigger)) {
        try { this._modalTrigger.focus({ preventScroll: true }); } catch { this._modalTrigger.focus(); }
      }
      this._modalTrigger = null;
    },

showModal(title, bodyHtml, onOk) {
      // lembra quem abriu para devolver o foco no fecho
      const ae = document.activeElement;
      this._modalTrigger = (ae && ae !== document.body && !this.dom.modal.contains(ae)) ? ae : null;
      this.dom.modalTitle.textContent = title;
      this.dom.modalBody.innerHTML = bodyHtml;
      this.modalOkHandler = onOk;
      // se o modal está saindo (leaving), marca reabertura p/ o hideWithExit abortar
      if (this.dom.modal._leaving) this.dom.modal._reopenRequested = true;
      this.dom.modal.classList.remove('hidden');
      // foco inicial no primeiro controle focável do modal
      requestAnimationFrame(() => {
        const f = this.dom.modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (f) f.focus();
      });
    },
  };

  // mescla os grupos de métodos extraídos
  // o composer e' um mixin de 4 partes (campo/anexos, áudio, markdown, listas):
  // todas entram no mesmo UI plano, entao a ordem aqui nao muda comportamento
  Object.assign(UI, PickerMethods, NavigationMethods, MessagesMethods, MentionMethods, ReminderMethods,
    SettingsMethods, AuthMethods, TreeMethods, SyncEventsMethods, TasksMethods, WorkspaceMethods,
    ComposerMethods, ComposerAudioMethods, ComposerMarkdownMethods, ComposerListsMethods,
    MessagesBubbleMethods, MessagesReactionsMethods, MessagesEditMethods, MessagesScrollMethods);

  // DEV: o index.html traz marcadores <!--#include partials/x.html--> em vez do
  // markup. Em producao o build ja os inlineou e isto sai em seguida sem
  // fazer fetch nenhum. Precisa rodar ANTES de Store.load()/UI.init(), porque
  // o app procura elementos que moram nesses partials (#auth-screen, #sidebar...).
  await injectPartials();

  Store.load();
  // aplica tema salvo antes de montar a UI
  const savedTheme = (Store.data.ui && Store.data.ui.theme) || 'peach';
  document.documentElement.dataset.theme = savedTheme;
  UI.init();

  // diagnose: anel de 200 entradas dos eventos de sincronização/envio. Com isso
  // qualquer duplicação fica rastreável no console (window.NoteThread.debugLog())
  const dbg = [];
  const origEmit = Sync.emit.bind(Sync);
  Sync.emit = (ev, d) => { dbg.push({ t: Date.now(), kind: 'emit:' + ev, cid: d && d.clientId }); if (dbg.length > 200) dbg.shift(); return origEmit(ev, d); };
  // captura também os envios (para contar execuções de sendNote no log)
  const origSend = Sync.send.bind(Sync);
  Sync.send = async (type, payload) => {
    dbg.push({ t: UI.activeThread, kind: 'send:' + type, cid: payload && payload.clientId });
    if (dbg.length > 200) dbg.shift();
    return origSend(type, payload);
  };
  // expõe para debugging/inspeção no console
  window.NoteThread = { Store, Sync, UI, Sound };
  window.NoteThread.debugLog = () => dbg.slice(-50);
  // marcador de build: torna óbvio no console se o navegador rodou o build novo
  // (lê o número do cache direto do sw.js para nunca mais destoar da versão real)
  fetch('./sw.js').then((r) => r.text()).then((t) => {
    const m = t.match(/notethread-v(\d+)/);
    console.log('%cSaveChat build v' + (m ? m[1] : '?') + ' — ' + (window.APP_VERSION || '?'), 'background:#0ea5e9;color:#fff;padding:2px 8px;border-radius:4px');
  }).catch(() => {});

  // registra o Service Worker (PWA / offline)
  // kill-switch: adicione ?nosw=1 à URL para desregistrar todos os SWs e limpar caches
  const url = new URL(location.href);
  if (url.searchParams.has('nosw')) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    }
    if (window.caches && caches.keys) {
      caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
    }
    console.warn('[NoteThread] SW desregistrado e caches limpos (?nosw=1). Recarregue sem o parâmetro.');
  } else if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          try { reg.update(); } catch {}
          // SW waiting pronto (check na abertura achou novidade e o fetch network-first
          // já baixou) → o chip já sinaliza; instalação acontece no clique em Atualizar app.
          // Fallback: se o browser baixou ANTES do check (aba aberta há dias), o toast
          // clássico com botão Recarregar continua existindo.
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                // só avisa via toast se o check do CHANGELOG ainda não sinalizou
                const lc = Updater.lastCheck;
                if (lc && lc.state === 'update') return;
                UI.toast('Nova versão disponível', { kind: 'info', duration: 8000, action: { label: 'Recarregar', fn: () => location.reload() } });
              }
            });
          });
        })
        .catch(() => { /* SW opcional */ });
    });
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return; refreshed = true; location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notethread-sync' && Sync.flushQueue) Sync.flushQueue();
      // clique numa notificação de lembrete → abre o caderno
      if (e.data && e.data.type === 'notethread-open-thread' && e.data.threadId) {
        if (Store.getThread(e.data.threadId)) UI.openThread(e.data.threadId);
      }
    });
    // deep links do launcher (?new=1 ?tasks=1 ?reminders=1): dispara a ação
    // depois do boot da UI e limpa a query (reload não refaz a ação)
    const p = new URL(location.href).searchParams;
    const bootAction =
      p.has('new') ? () => UI.createThread() :
      p.has('tasks') ? () => UI.showTasksPage() :
      p.has('reminders') ? () => UI.showRemindersPage() :
      null;
    if (bootAction) {
      setTimeout(bootAction, 300);
      history.replaceState(null, '', location.pathname);
    }
    // abertura via notificação com app fechado (?thread=<id>)
    const bootUrl = new URL(location.href);
    const bootThread = bootUrl.searchParams.get('thread');
    if (bootThread && Store.getThread(bootThread)) {
      UI.openThread(bootThread);
      history.replaceState(null, '', location.pathname);
    }
    window.addEventListener('online', () => { if (Sync.flushQueue) Sync.flushQueue(); });
  }
})();

