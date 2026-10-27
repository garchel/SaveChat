import { $ } from './utils.js';
import {
  createAndSaveKeys,
  unlockKeys,
  unlockKeysWithRecovery,
  loadKeyBundle,
  isUnlocked,
} from './keyring.js';
import { formatRecoveryCode } from './keys.js';

const MIN_PASS = 8;

export const CryptoGate = {
  _pending: null,
  _resolve: null,
  _uid: null,
  _mode: 'unlock',
  _bound: false,

  async ensure(supa, user) {
    if (!supa || !user || !user.id) return false;
    if (isUnlocked(user.id)) return true;
    if (this._pending && this._uid === user.id) return this._pending;

    this._uid = user.id;
    this._supa = supa;
    this._detached = false;
    this._pending = (async () => {
      try {
        const bundle = await loadKeyBundle(supa, user.id);
        this._open(!!bundle);
        return await new Promise((resolve) => { this._resolve = resolve; });
      } catch (e) {
        this._pending = null;
        throw e;
      }
    })();
    return this._pending;
  },

  fail(message, user) {
    if (user && user.id) this._uid = user.id;
    this._detached = true;
    if (!this._pending) {
      this._pending = new Promise((resolve) => { this._resolve = resolve; });
    }
    this._mode = 'unlock';
    this._open(true);
    this._msg(message || 'Não foi possível desbloquear.', 'error');
  },

  _open(hasKeys) {
    this._mode = hasKeys ? 'unlock' : 'setup';
    const gate = $('#crypto-gate');
    const auth = $('#auth-screen');
    const app = $('#app');
    if (auth) auth.classList.add('hidden');
    if (app) app.classList.add('hidden');
    if (gate) gate.classList.remove('hidden');
    this._renderMode();
    this._bind();
    const first = this._mode === 'setup' ? $('#crypto-pass') : $('#crypto-pass-unlock');
    if (first) setTimeout(() => first.focus(), 60);
  },

  _bind() {
    if (this._bound) return;
    this._bound = true;
    $('#crypto-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submit();
    });
    $('#crypto-switch')?.addEventListener('click', () => {
      this._mode = this._mode === 'recovery' ? (this._hasBundle ? 'unlock' : 'setup') : 'recovery';
      this._msg('');
      this._renderMode();
    });
    $('#crypto-recovery-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this._code || '');
        this._msg('Código copiado.', 'success');
      } catch {
        this._msg('Selecione o código e copie manualmente.', 'error');
      }
    });
    $('#crypto-recovery-saved')?.addEventListener('change', (e) => {
      const btn = $('#crypto-recovery-done');
      if (btn) btn.disabled = !e.target.checked;
    });
    $('#crypto-recovery-done')?.addEventListener('click', () => this._finish());
  },

  _renderMode() {
    const setup = this._mode === 'setup';
    const recovery = this._mode === 'recovery';
    this._hasBundle = !setup;
    $('#crypto-setup-fields')?.classList.toggle('hidden', !setup);
    $('#crypto-unlock-fields')?.classList.toggle('hidden', setup || recovery);
    $('#crypto-recovery-fields')?.classList.toggle('hidden', !recovery);
    $('#crypto-recovery-card')?.classList.add('hidden');
    $('#crypto-form')?.classList.remove('hidden');
    const title = $('#crypto-title');
    const desc = $('#crypto-desc');
    const submit = $('#crypto-submit');
    const sw = $('#crypto-switch');
    if (title) title.textContent = setup ? 'Crie sua senha de criptografia' : 'Desbloqueie suas notas';
    if (desc) desc.textContent = setup
      ? 'Suas notas são cifradas neste dispositivo. Crie uma senha diferente da conta — ela nunca é enviada ao servidor.'
      : 'Digite a senha de criptografia desta conta para abrir suas notas neste dispositivo.';
    if (submit) submit.textContent = setup ? 'Criar chave e continuar' : (recovery ? 'Desbloquear com código' : 'Desbloquear');
    if (sw) {
      sw.classList.toggle('hidden', setup);
      sw.textContent = recovery ? 'Usar senha' : 'Usar código de recuperação';
    }
    this._msg('');
  },

  _msg(text, kind) {
    const el = $('#crypto-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'auth-msg ' + (kind || 'info') + (text ? '' : ' hidden');
  },

  async _submit() {
    const btn = $('#crypto-submit');
    if (!btn || btn.disabled) return;
    const uid = this._uid;
    const supa = this._supa;
    if (!supa) return this._msg('Sem conexão com o servidor. Tente novamente.', 'error');

    if (this._mode === 'setup') {
      const pass = $('#crypto-pass')?.value || '';
      const pass2 = $('#crypto-pass2')?.value || '';
      if (pass.length < MIN_PASS) return this._msg(`Use pelo menos ${MIN_PASS} caracteres.`, 'error');
      if (pass !== pass2) return this._msg('As duas senhas não são iguais.', 'error');
      btn.disabled = true; btn.textContent = 'Criando chave…';
      try {
        this._code = await createAndSaveKeys(supa, uid, pass);
        $('#crypto-code').textContent = formatRecoveryCode(this._code);
        $('#crypto-form').classList.add('hidden');
        $('#crypto-recovery-card').classList.remove('hidden');
        const saved = $('#crypto-recovery-saved');
        const done = $('#crypto-recovery-done');
        if (saved) saved.checked = false;
        if (done) done.disabled = true;
      } catch (e) {
        console.error('[crypto] falha ao criar chaves', e);
        this._msg('Não foi possível criar a chave. Tente novamente.', 'error');
        btn.disabled = false;
        btn.textContent = 'Criar chave e continuar';
      }
      return;
    }

    const code = this._mode === 'recovery' ? ($('#crypto-recovery-input')?.value || '').replace(/[\s-]/g, '') : '';
    const pass = $('#crypto-pass-unlock')?.value || '';
    if (this._mode === 'unlock' && !pass) return this._msg('Digite sua senha.', 'error');
    if (this._mode === 'recovery' && !code) return this._msg('Digite o código de recuperação.', 'error');
    btn.disabled = true; btn.textContent = 'Desbloqueando…';
    try {
      if (this._mode === 'recovery') await unlockKeysWithRecovery(supa, uid, code);
      else await unlockKeys(supa, uid, pass);
      this._finish();
    } catch (e) {
      console.warn('[crypto] unlock falhou', e);
      this._msg(this._mode === 'recovery' ? 'Código inválido. Confira e tente de novo.' : 'Senha incorreta. Tente de novo.', 'error');
      btn.disabled = false;
      btn.textContent = this._mode === 'recovery' ? 'Desbloquear com código' : 'Desbloquear';
    }
  },

  _finish() {
    const gate = $('#crypto-gate');
    if (gate) gate.classList.add('hidden');
    const done = this._resolve;
    const detached = this._detached;
    this._pending = null;
    this._resolve = null;
    this._detached = false;
    this._code = null;
    if (done) done(true);
    if (detached) setTimeout(() => window.NoteThread?.UI?.renderAuthOrApp(), 0);
  },

  close() {
    const gate = $('#crypto-gate');
    if (gate) gate.classList.add('hidden');
    if (this._resolve) this._resolve(false);
    this._pending = null;
    this._resolve = null;
    this._uid = null;
    this._code = null;
    this._detached = false;
  },
};
