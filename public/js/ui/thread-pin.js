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

  // exposto para testes e para qualquer fluxo que precise comparar o código
  hashThreadPin(pin) { return hashPin(pin); },

  threadPinHas(id) {
    return !!this._threadPins()[id];
  },

  threadPinLocked(id) {
    return this.threadPinHas(id) && !this._threadUnlocked.has(id);
  },

  // rótulo do item do menu ⋮ conforme o estado da conversa
  syncThreadPinMenu() {
    const label = $('#menu-pin-label');
    if (label) label.textContent = this.threadPinHas(this.activeThread) ? 'Destravar conversa (remover código)' : 'Travar com código';
  },

  // A árvore se reconcilia no lugar (não reconstrói o nó), então o cadeado é
  // aplicado direto no ícone — depender de `renderTree()` não atualizava nada.
  _syncThreadBadge(id) {
    const ico = document.querySelector('.tnode[data-tid="' + id + '"] .ico');
    if (!ico) return;
    const tem = this.threadPinHas(id);
    const atual = ico.querySelector('.lock-badge');
    if (tem && !atual) {
      const b = document.createElement('span');
      b.className = 'lock-badge';
      b.title = 'Conversa com código';
      b.setAttribute('aria-label', 'Conversa com código');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>';
      ico.appendChild(b);
    } else if (!tem && atual) {
      atual.remove();
    }
  },

  async setThreadPin(id) {
    this.showModal('Código da conversa',
      '<p class="modal-hint">Pede o código para abrir esta conversa neste aparelho. Não cifra o conteúdo.</p>'
      + '<input id="tpin-input" type="password" inputmode="numeric" maxlength="4" placeholder="Código de 4 dígitos" style="width:100%" />'
      + '<input id="tpin-input2" type="password" inputmode="numeric" maxlength="4" placeholder="Repita o PIN" style="width:100%;margin-top:8px" />',
      async () => {
        const a = ($('#tpin-input') || {}).value || '';
        const b = ($('#tpin-input2') || {}).value || '';
        if (!/^\d{4}$/.test(a)) return this.toast('O PIN precisa ter 4 dígitos', { kind: 'error' });
        if (a !== b) return this.toast('Os PINs não são iguais', { kind: 'error' });
        this._threadPins()[id] = await hashPin(a);
        Store.save();
        this._threadUnlocked.add(id); // acabou de digitar: não pede de novo agora
        this._syncThreadBadge(id);
        this.toast('Conversa travada com código', { kind: 'success' });
      });
  },

  removeThreadPin(id) {
    const pins = this._threadPins();
    if (!pins[id]) return;
    delete pins[id];
    Store.save();
    this._threadUnlocked.delete(id);
    this._syncThreadBadge(id);
    this.toast('Código da conversa removido', { kind: 'success' });
  },

  // Resolve `true` quando o PIN confere. `onOk` roda depois do acerto.
  askThreadPin(id, onOk) {
    const titulo = (Store.getThread(id) || {}).name || 'Conversa protegida';
    this.showModal('Código da conversa — ' + titulo,
      '<input id="tpin-ask" type="password" inputmode="numeric" maxlength="4" autofocus placeholder="Código de 4 dígitos" style="width:100%" />',
      async () => {
        const v = ($('#tpin-ask') || {}).value || '';
        const ok = (await hashPin(v)) === this._threadPins()[id];
        if (!ok) return this.toast('PIN incorreto', { kind: 'error' });
        this._threadUnlocked.add(id);
        if (typeof onOk === 'function') onOk();
      });
  },
};
