// PIN por conversa: trava a abertura de uma conversa específica.
//
// Não é criptografia — é uma fechadura local, guardada no aparelho
// (`ui.threadPins`), com o PIN em SHA-256 + salt. Serve para esconder uma
// conversa de quem pega o celular aberto. Quem tiver o aparelho e o
// localStorage consegue ler o conteúdo de qualquer forma; para sigilo real,
// o PIN global da conta (Configurações → PIN) é o que cifra.
import { Store } from '../store.js';
import { $ } from '../utils.js';

const SALT = 'notethread:thread-pin:v1';

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(SALT + ':' + String(pin));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const ThreadPinMethods = {
  _threadUnlocked: new Set(),

  _threadPins() {
    Store.data.ui = Store.data.ui || {};
    return (Store.data.ui.threadPins = Store.data.ui.threadPins || {});
  },

  threadPinHas(id) {
    return !!this._threadPins()[id];
  },

  threadPinLocked(id) {
    return this.threadPinHas(id) && !this._threadUnlocked.has(id);
  },

  // rótulo do item do menu ⋮ conforme o estado da conversa
  syncThreadPinMenu() {
    const label = $('#menu-pin-label');
    if (label) label.textContent = this.threadPinHas(this.activeThread) ? 'Remover PIN da conversa' : 'Proteger com PIN';
  },

  async setThreadPin(id) {
    this.showModal('PIN da conversa',
      '<p class="modal-hint">Fechadura local: pede o PIN para abrir esta conversa neste aparelho. Não cifra o conteúdo.</p>'
      + '<input id="tpin-input" type="password" inputmode="numeric" maxlength="4" placeholder="PIN de 4 dígitos" style="width:100%" />'
      + '<input id="tpin-input2" type="password" inputmode="numeric" maxlength="4" placeholder="Repita o PIN" style="width:100%;margin-top:8px" />',
      async () => {
        const a = ($('#tpin-input') || {}).value || '';
        const b = ($('#tpin-input2') || {}).value || '';
        if (!/^\d{4}$/.test(a)) return this.toast('O PIN precisa ter 4 dígitos', { kind: 'error' });
        if (a !== b) return this.toast('Os PINs não são iguais', { kind: 'error' });
        this._threadPins()[id] = await hashPin(a);
        Store.save();
        this._threadUnlocked.add(id); // acabou de digitar: não pede de novo agora
        this.toast('Conversa protegida com PIN', { kind: 'success' });
        this.renderTree();
      });
  },

  removeThreadPin(id) {
    const pins = this._threadPins();
    if (!pins[id]) return;
    delete pins[id];
    Store.save();
    this._threadUnlocked.delete(id);
    this.toast('PIN da conversa removido', { kind: 'success' });
    this.renderTree();
  },

  // Resolve `true` quando o PIN confere. `onOk` roda depois do acerto.
  askThreadPin(id, onOk) {
    const titulo = (Store.getThread(id) || {}).name || 'Conversa protegida';
    this.showModal('PIN da conversa — ' + titulo,
      '<input id="tpin-ask" type="password" inputmode="numeric" maxlength="4" autofocus placeholder="PIN de 4 dígitos" style="width:100%" />',
      async () => {
        const v = ($('#tpin-ask') || {}).value || '';
        const ok = (await hashPin(v)) === this._threadPins()[id];
        if (!ok) return this.toast('PIN incorreto', { kind: 'error' });
        this._threadUnlocked.add(id);
        if (typeof onOk === 'function') onOk();
      });
  },
};
