import { $ } from '../utils.js';
import { Store } from '../store.js';
import { USE_SUPABASE, getSupa, Sync } from '../sync-supabase.js';
import { setPetals } from '../petals.js';

export const AuthMethods = {
_getSupa() {
      if (Sync && Sync.supa) return Sync.supa;
      return null;
    },

    // Traduz erros de auth para PT-BR, acionável e sem jargão técnico
    _mapAuthError(msg) {
      const raw = String(msg || '');
      const m = (re) => re.test(raw);
      if (m(/invalid login credentials/i))
        return 'E-mail ou senha incorretos. Verifique e tente de novo, ou use “Esqueci a senha”.';
      if (m(/email not confirmed/i))
        return 'Confirme seu e-mail antes de entrar — enviamos um link de confirmação quando você criou a conta. Reenvie em “Esqueci a senha” se não encontrar.';
      if (m(/user already registered/i))
        return 'Já existe uma conta com este e-mail. Use “Entrar” em vez de “Criar conta”.';
      if (m(/Password should be at least/i) || m(/at least 6 characters/i))
        return 'A senha precisa ter pelo menos 6 caracteres.';
      if (m(/rate limit/i) || m(/too many requests/i))
        return 'Muitas tentativas em pouco tempo. Aguarde um minuto antes de tentar de novo.';
      if (m(/signups not allowed/i))
        return 'Cadastro de novos usuários está desativado neste momento.';
      if (m(/failed to fetch/i) || m(/networkerror/i) || m(/load failed/i))
        return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
      return raw || 'Não foi possível entrar. Tente novamente.';
    },

async _ensureSupa() {
      if (this._getSupa()) return this._getSupa();
      if (!USE_SUPABASE) return null;
      const c = await getSupa();
      if (Sync) Sync.supa = c;
      return c;
    },

_showAuthMsg(text, kind) {
      const el = $('#auth-msg'); if (!el) return;
      el.textContent = text; el.className = 'auth-msg ' + (kind || 'info'); el.classList.remove('hidden');
    },

_clearAuthMsg() { const el = $('#auth-msg'); if (el) { el.textContent = ''; el.classList.add('hidden'); } },

    // Aguarda a sessão criada pela janela popup (mesmo localStorage) e entra no app
    _waitPopupSession(supa, popup) {
      const started = Date.now();
      const stop = () => { clearInterval(timer); this._googleBtnLoading(false); };
      const timer = setInterval(async () => {
        let session = null;
        try { session = (await supa.auth.getSession()).data.session; } catch {}
        if (session && session.user) {
          Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
          this.renderAuthOrApp();
          // fecha o popup pela janela original — window.close() de dentro do
          // próprio popup costuma ser bloqueado pelo navegador
          try { if (popup && !popup.closed) popup.close(); } catch {}
          stop();
          return;
        }
        // popup fechou sem logar (usuário cancelou) → para de esperar
        if (popup && popup.closed && Date.now() - started > 4000) { stop(); return; }
        if (Date.now() - started > 180000) { stop(); return; }
      }, 700);
    },

    // Esta janela é o retorno do OAuth em popup? O marcador na URL basta:
    // window.opener pode ser anulado pelo navegador (COOP) em cadeias de redirect.
    _isOAuthPopupReturn() {
      try {
        return new URLSearchParams(location.search).has('oauth_popup');
      } catch { return false; }
    },

    // Retorno do popup: garante o código PKCE trocado, avisa a janela original
    // e se fecha — o app NUNCA deve renderizar dentro do popup.
    async _finishOAuthPopup() {
      if (this._popupFinishing) return;
      this._popupFinishing = true;
      const supa = await this._ensureSupa();
      const deadline = Date.now() + 12000;
      const tick = async () => {
        let session = null;
        try { if (supa) session = (await supa.auth.getSession()).data.session; } catch {}
        if (session && session.user) {
          try { window.opener && window.opener.postMessage({ type: 'oauth_popup_done' }, location.origin); } catch {}
          try { window.close(); } catch {}
          // se o navegador impedir o close, mostra recado em vez do app
          setTimeout(() => { try { location.replace(location.origin + '/?popup_done=1'); } catch {} }, 600);
          return;
        }
        if (Date.now() < deadline) { setTimeout(tick, 500); return; }
        // sem sessão (código expirado/cancelado): volta ao login limpo
        try { location.replace(location.origin + '/'); } catch {}
      };
      tick();
    },

    // Loading no botão Google: spinner + label "Abrindo Google…", botão bloqueado
    _googleBtnLoading(on) {
      const btn = $('#btn-google'); if (!btn) return;
      const label = $('#google-label'), spinner = $('#google-spinner'), arrow = btn.querySelector('.g-arrow');
      btn.disabled = !!on;
      btn.classList.toggle('is-loading', !!on);
      if (label) label.textContent = on ? 'Abrindo Google…' : 'Entrar com Google';
      if (spinner) spinner.classList.toggle('hidden', !on);
      if (arrow) arrow.classList.toggle('hidden', !!on);
    },    bindAuth() {
      const emailInput = $('#email-input'), passInput = $('#password-input'), passField = $('#password-field');
      // retorno do redirect mobile com erro (?autherr=…): mensagem + URL limpa
      try {
        if (new URLSearchParams(location.search).has('autherr')) {
          this._showAuthMsg('Não foi possível concluir o login com o Google. Tente novamente.', 'error');
          try { history.replaceState(null, '', location.pathname); } catch {}
        }
      } catch {}
      const submitBtn = $('#email-submit'), links = $('#auth-links'), switchBtn = $('#btn-switch-mode');
      const toggleBtn = $('#toggle-pass'), forgotBtn = $('#btn-forgot');
      let mode = 'login'; // login | signup
      const setMode = (m) => {
        mode = m;
        if (switchBtn) switchBtn.textContent = m === 'login' ? 'Criar conta' : 'Já tenho conta';
        if (submitBtn) submitBtn.textContent = m === 'login' ? 'Entrar' : 'Criar conta';
      };
      setMode('login');
      const revealPassword = () => {
        if (passField) passField.classList.remove('hidden');
        if (links) links.classList.remove('hidden');
        if ($('#remember-row')) $('#remember-row').classList.remove('hidden');
        if (passInput) { passInput.required = true; passInput.focus(); }
      };
      // aplica "lembrar-me": unchecked → não auto-loga na próxima visita
      const applyRemember = () => {
        const rm = $('#remember-me');
        Store.data.ui = Store.data.ui || {};
        Store.data.ui.rememberMe = rm ? !!rm.checked : true;
        Store.save();
      };

      // toggle senha — alterna entre ícones de olho aberto/fechado (feather)
      const eyeOn = toggleBtn ? toggleBtn.querySelector('.ic-eye') : null;
      const eyeOff = toggleBtn ? toggleBtn.querySelector('.ic-eye-off') : null;
      if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
          const isPass = passInput.type === 'password';
          passInput.type = isPass ? 'text' : 'password';
          if (eyeOn) eyeOn.classList.toggle('hidden', isPass);
          if (eyeOff) eyeOff.classList.toggle('hidden', !isPass);
          toggleBtn.setAttribute('aria-label', isPass ? 'Ocultar senha' : 'Mostrar senha');
          toggleBtn.setAttribute('title', isPass ? 'Ocultar senha' : 'Mostrar senha');
          toggleBtn.setAttribute('aria-pressed', String(isPass));
        });
      }
      // validação em tempo real — limpa o estado de erro ao digitar (WCAG 3.3.3)
      if (emailInput) emailInput.addEventListener('input', () => emailInput.classList.remove('input-error'));
      if (passInput) passInput.addEventListener('input', () => passInput.classList.remove('input-error'));
      // foco volta no campo após o popup do Google fechar sem login
      window.addEventListener('focus', () => {
        if (this._googlePopupOpening) { this._googlePopupOpening = false; this._googleBtnLoading(false); }
      }, { passive: true });
      // popup do Google concluiu → fecha o popup e segue para o app AQUI,
      // na janela original (BroadcastChannel + postMessage, duas vias)
      const _onOAuthDone = (detail) => {
        this._googlePopupOpening = false;
        this._googleBtnLoading(false);
        try { if (detail && detail.ok === false) this._showAuthMsg(this._mapAuthError(detail.msg), 'error'); } catch {}
        // a sessão no localStorage já dispara a entrada pelo fluxo normal;
        // por garantia, checa de novo em seguida
        setTimeout(() => { try { this.renderAuthOrApp(); } catch {} }, 250);
      };
      try {
        if ('BroadcastChannel' in window) {
          const bcDone = new BroadcastChannel('savechat-oauth');
          bcDone.onmessage = (e) => { if (e.data && e.data.type === 'oauth_popup_done') _onOAuthDone(e.data); };
        }
      } catch {}
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.type === 'oauth_popup_done') { _onOAuthDone(e.data); try { e.source && e.source.close && e.source.close(); } catch {} }
      });
      if (switchBtn) switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
      if (forgotBtn) forgotBtn.addEventListener('click', async () => {
        const mail = emailInput.value.trim();
        if (!mail) { emailInput.classList.add('input-error'); emailInput.focus(); this._showAuthMsg('Digite seu e-mail primeiro para receber o link.', 'error'); return; }
        const supa = await this._ensureSupa(); if (!supa) { this._showAuthMsg('Recuperação indisponível offline', 'error'); return; }
        const { error } = await supa.auth.resetPasswordForEmail(mail, { redirectTo: location.origin });
        this._showAuthMsg(error ? this._mapAuthError(error.message) : 'Link de recuperação enviado — verifique seu e-mail', error ? 'error' : 'success');
      });

      $('#btn-google').addEventListener('click', async () => {
        if (USE_SUPABASE) {
          const supa = await this._ensureSupa();
          if (!supa) { this._showAuthMsg('Login indisponível no momento. Verifique sua conexão.', 'error'); return; }
          this._clearAuthMsg();
          this._googleBtnLoading(true);
          this._googlePopupOpening = true;
          // Celular/tablet: SEM popup — redirect na MESMA aba (UX correta no
          // mobile; em PWA standalone popup nem deve existir). O retorno vai
          // para a callback dedicada, que troca o código e abre o app aqui mesmo.
          const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
          if (isMobile) {
            try {
              const { error } = await supa.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: location.origin + '/oauth-callback.html?cb=page',
                  queryParams: { prompt: 'select_account' },
                },
              });
              if (error) throw error;
              // sucesso → o navegador inteiro navega para o Google (sem retorno)
            } catch (err) {
              this._googlePopupOpening = false;
              this._googleBtnLoading(false);
              this._showAuthMsg(this._mapAuthError(err && err.message), 'error');
            }
            return;
          }
          try {
            // Obtém a URL do Google sem navegar; abre em janela popup dedicada.
            // Se o navegador bloquear o popup, cai para redirect na mesma aba.
            // - redirectTo → página DEDICADA de callback (oauth-callback.html):
            //   ela troca o código PKCE, avisa esta janela e se fecha. O app
            //   NUNCA renderiza dentro do popup, por construção.
            // - prompt=select_account: o Google SEMPRE mostra a escolha de conta,
            //   em vez de autorizar silenciosamente a conta já conectada.
            const { data, error } = await supa.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: location.origin + '/oauth-callback.html?cb=popup',
                skipBrowserRedirect: true,
                queryParams: { prompt: 'select_account' },
              },
            });
            if (error) throw error;
            const url = data && data.url;
            if (!url) throw new Error('Não foi possível iniciar o login com Google.');
            const popup = window.open(url, 'google_oauth', 'popup=true,width=480,height=640');
            if (!popup) {
              // popup bloqueado → redirect completo na mesma aba (fluxo clássico)
              this._googlePopupOpening = false;
              location.href = url;
              return;
            }
            // popup aberto: a própria janela troca o código e se fecha;
            // aqui apenas aguardamos a sessão aparecer no storage compartilhado
            this._googlePopupOpening = false;
            this._waitPopupSession(supa, popup);
          } catch (err) {
            this._googlePopupOpening = false;
            this._googleBtnLoading(false);
            this._showAuthMsg(this._mapAuthError(err && err.message), 'error');
          }
          return;
        }
        Store.setUser({ name: 'Google User', mail: 'voce@gmail.com', provider: 'google' });
        this.renderAuthOrApp();
      });

      $('#email-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const mail = emailInput.value.trim();
        if (!mail) {
          emailInput.classList.add('input-error'); emailInput.focus();
          this._showAuthMsg('Digite seu e-mail para continuar.', 'error'); return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
          emailInput.classList.add('input-error'); emailInput.focus();
          this._showAuthMsg('Este e-mail parece incompleto — confira se escreveu certo (ex.: nome@email.com).', 'error'); return;
        }
        // passo 1: revela senha se ainda escondida (sem mensagem — o foco no campo já guia o usuário)
        if (passField && passField.classList.contains('hidden')) {
          revealPassword();
          return;
        }
        const pass = passInput ? passInput.value : '';
        if (!pass) {
          if (passInput) { passInput.classList.add('input-error'); passInput.focus(); }
          this._showAuthMsg(mode === 'login' ? 'Digite sua senha para entrar.' : 'Crie uma senha para continuar.', 'error'); return;
        }
        if (pass.length < 6) {
          if (passInput) { passInput.classList.add('input-error'); passInput.focus(); }
          this._showAuthMsg('A senha precisa ter pelo menos 6 caracteres.', 'error'); return;
        }
        this._clearAuthMsg();
        emailInput.classList.remove('input-error');
        if (passInput) passInput.classList.remove('input-error');
        submitBtn.disabled = true; submitBtn.textContent = 'Aguarde…';
        try {
          if (USE_SUPABASE) {
            const supa = await this._ensureSupa();
            if (mode === 'signup') {
              const { error } = await supa.auth.signUp({ email: mail, password: pass, options: { emailRedirectTo: location.origin } });
              if (error) throw error;
              this._showAuthMsg('Conta criada! Confirme seu e-mail — depois volte e entre com a senha', 'success');
              setMode('login');
            } else {
              const { error } = await supa.auth.signInWithPassword({ email: mail, password: pass });
              if (error) throw error;
              applyRemember();
              const { data: { session } } = await supa.auth.getSession();
              if (session && session.user) {
                Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
                this.renderAuthOrApp();
                return;
              }
            }
          } else {
            Store.setUser({ name: mail.split('@')[0], mail, provider: 'email' });
            this.renderAuthOrApp();
          }
        } catch (err) {
          this._showAuthMsg(this._mapAuthError(err && err.message), 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
        }
      });

      const logoutBtn = $('#profile-logout') || $('#btn-logout');
      if (logoutBtn) logoutBtn.addEventListener('click', async () => {
        const supa = this._getSupa();
        if (supa) try { await supa.auth.signOut(); } catch {}
        Store.setUser(null); this.renderAuthOrApp();
        if (passField) passField.classList.add('hidden');
        if (links) links.classList.add('hidden');
        if (passInput) { passInput.value = ''; passInput.required = false; }
        this._clearAuthMsg(); setMode('login');
      });

      // se já há sessão Supabase, sincroniza — apenas 1 listener global
      if (USE_SUPABASE) {
        this._ensureSupa().then(supa => {
          if (!supa || supa._bound) return;
          supa._bound = true; // marca para não duplicar onAuthStateChange
          supa.auth.getSession().then(({ data: { session } }) => {
            if (session && session.user) {
              // "lembrar-me" desmarcado → encerra a sessão local (não auto-loga)
              if (Store.data.ui && Store.data.ui.rememberMe === false) { supa.auth.signOut(); return; }
              applyRemember();
              // A conta da sessão pode ser DIFERENTE da que ficou no storage
              // (ex.: criou conta nova, verificou o e-mail e reabriu o app).
              // O Store troca o bucket de dados; a UI precisa ser remontada.
              if (this._applySessionUser(session.user)) this.renderAuthOrApp();
            }
          });
          supa.auth.onAuthStateChange((_ev, sess) => {
            if (sess && sess.user && this._applySessionUser(sess.user)) this.renderAuthOrApp();
          });
        });
      }
    },

    // Aplica o usuário da sessão ao Store. Devolve true quando a conta mudou
    // (nova sessão logada no lugar de outra), para o caller remontar a UI.
    _applySessionUser(u) {
      const next = { name: (u.email || 'u').split('@')[0], mail: u.email, provider: 'supabase', id: u.id };
      const cur = Store.user;
      const changed = !cur || cur.id !== next.id || cur.mail !== next.mail;
      if (changed) {
        // conta diferente: zera o estado de UI que é por-conta (thread aberta,
        // pins, diário, chat da IA) antes de o Store trocar o bucket
        this.activeThread = null;
        this.renderedClientIds = new Set();
        this.oldestTs = null;
        this._workspaceTab = 'conversations';
        const msgs = document.getElementById('messages');
        if (msgs) msgs.querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
        const empty = document.getElementById('empty-state');
        if (empty) empty.classList.remove('hidden');
        const aiList = document.getElementById('ai-messages');
        if (aiList) aiList.innerHTML = '';
        this.dom && this.dom.btnPin && this.dom.btnPin.classList.add('hidden');
      }
      Store.setUser(next);
      return changed;
    },

renderAuthOrApp() {
      // Popup sobrevivente (navegador bloqueou o fechamento): mostra recado,
      // NUNCA o app — evita "app dentro do popup".
      try {
        if (new URLSearchParams(location.search).has('popup_done')) {
          $('#auth-screen').classList.remove('hidden'); $('#app').classList.add('hidden');
          this._showAuthMsg('Login concluído! Pode fechar esta janela e voltar para a anterior.', 'success');
          try { history.replaceState(null, '', location.pathname); } catch {}
          return;
        }
      } catch {}
      // Janela popup do OAuth voltando do Google: troca o código, avisa a
      // janela original e se fecha — nunca renderiza o app dentro do popup.
      if (this._isOAuthPopupReturn() || (window.name === 'google_oauth' && window.opener)) {
        this._finishOAuthPopup();
        return;
      }
      if (Store.user) {
        $('#auth-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        setPetals(!!(Store.data.ui && Store.data.ui.petals)); // ambiente cozy
        this.renderMe();
        this.renderTree();
        // conecta apenas 1× — evita channel duplicado a cada onAuthStateChange
        if (!Sync.connected && !Sync._connecting) Sync.connect();
        this.setChatActiveUi(false);
      } else {
        $('#auth-screen').classList.remove('hidden');
        $('#app').classList.add('hidden');
      }
    },

renderMe() {
      const u = Store.user;
      $('#me-name').textContent = u.name || 'Usuário';
      $('#me-mail').textContent = u.mail || '';
      $('#me-avatar').textContent = (u.name || 'U').charAt(0).toUpperCase();
    },
};
