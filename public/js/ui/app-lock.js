// Bloqueio do app: tela de código de 4 dígitos na abertura.
//
// É SEPARADO da criptografia. A criptografia protege os dados no servidor e
// abre sozinha neste aparelho (chave do aparelho). Este bloqueio só impede que
// alguém que pegue o aparelho já destravado veja as notas — por isso o código é
// guardado como hash local, e não é a chave de nada.
import { Store } from '../store.js';
import { $ } from '../utils.js';

const SALT = 'notethread:app-lock:v1';

async function hashCode(code) {
  const bytes = new TextEncoder().encode(SALT + ':' + String(code));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const AppLockMethods = {
  _appUnlocked: false,
  _lockEl: null,

  appLockHash() {
    return (Store.data.ui && Store.data.ui.appLock && Store.data.ui.appLock.hash) || null;
  },

  appLockEnabled() {
    return !!this.appLockHash();
  },

  // bloqueado = existe código e esta sessão ainda não destravou
  appLockActive() {
    return this.appLockEnabled() && !this._appUnlocked;
  },

  async setAppLock() {
    this.showModal('Bloqueio do app',
      '<p class="modal-hint">Pede um código de 4 dígitos ao abrir o app. É independente da criptografia.</p>'
      + '<input id="alock-1" type="password" inputmode="numeric" maxlength="4" placeholder="Código de 4 dígitos" style="width:100%" />'
      + '<input id="alock-2" type="password" inputmode="numeric" maxlength="4" placeholder="Repita o código" style="width:100%;margin-top:8px" />',
      async () => {
        const a = ($('#alock-1') || {}).value || '';
        const b = ($('#alock-2') || {}).value || '';
        if (!/^\d{4}$/.test(a)) return this.toast('O código precisa ter 4 dígitos', { kind: 'error' });
        if (a !== b) return this.toast('Os códigos não são iguais', { kind: 'error' });
        Store.data.ui = Store.data.ui || {};
        Store.data.ui.appLock = { hash: await hashCode(a) };
        Store.save();
        this._appUnlocked = true;
        this.toast('Bloqueio do app ativado', { kind: 'success' });
      });
  },

  removeAppLock() {
    if (!this.appLockEnabled()) return;
    delete Store.data.ui.appLock;
    Store.save();
    this._appUnlocked = false;
    this.toast('Bloqueio do app desligado', { kind: 'success' });
  },

  bindAppLock() {
    const cb = $('#app-lock-enabled');
    if (cb && !cb.dataset.bound) {
      cb.dataset.bound = '1';
      cb.checked = this.appLockEnabled();
      cb.addEventListener('change', () => {
        if (cb.checked) this.setAppLock();
        else this.removeAppLock();
        const btn = $('#app-lock-change');
        if (btn) btn.classList.toggle('hidden', !this.appLockEnabled());
      });
    }
    const btn = $('#app-lock-change');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.classList.toggle('hidden', !this.appLockEnabled());
      btn.addEventListener('click', () => this.setAppLock());
    }
  },

  showAppLock() {
    if (this._lockEl || !this.appLockActive()) return;
    const el = document.createElement('div');
    el.id = 'app-lock';
    el.className = 'app-lock';
    el.innerHTML =
      '<div class="app-lock-card">'
      + '<div class="app-lock-lock" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg></div>'
      + '<h2>App bloqueado</h2>'
      + '<p class="app-lock-hint">Digite o código de 4 dígitos.</p>'
      + '<input id="app-lock-code" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" />'
      + '<button id="app-lock-ok" class="btn primary" type="button">Desbloquear</button>'
      + '<p id="app-lock-msg" class="auth-msg hidden" role="status"></p>'
      + '</div>';
    document.body.appendChild(el);
    this._lockEl = el;
    const input = el.querySelector('#app-lock-code');
    const ok = el.querySelector('#app-lock-ok');
    const msg = el.querySelector('#app-lock-msg');
    const erro = (t) => { msg.textContent = t; msg.classList.remove('hidden'); };
    const tentar = async () => {
      const v = input.value || '';
      if ((await hashCode(v)) !== this.appLockHash()) {
        input.value = '';
        erro('Código incorreto.');
        return;
      }
      this._appUnlocked = true;
      el.remove();
      this._lockEl = null;
    };
    ok.addEventListener('click', tentar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tentar(); });
    setTimeout(() => input.focus(), 50);
  },
};
