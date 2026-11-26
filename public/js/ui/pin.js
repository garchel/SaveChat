// PIN opcional: proteger as notas com um PIN de 4 dígitos, ligado/desligado
// nas Configurações. Sem PIN o app abre direto e grava em texto claro; com PIN
// o conteúdo vai cifrado e o cache local também.
//
// Desligar é destrutivo ao contrário: precisa da DEK em memória para devolver o
// texto em claro ao servidor. Se o usuário esquecer o PIN, nada é apagado — as
// notas continuam cifradas e o app segue pedindo o PIN.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { CryptoGate } from '../crypto-gate.js';
import { Backfill } from '../backfill.js';
import { getDek, loadKeyBundle, forgetBundle, lockKeys } from '../keyring.js';
import { makeCacheCipher, makeQueueCipher } from '../crypto-session.js';
import { OfflineQueue } from '../offline-queue.js';
import { $ } from '../utils.js';

export const PinMethods = {
  _pinBusy: false,

  pinOn() {
    return !!Store._encrypted;
  },

  async refreshPinUi() {
    const cb = $('#pin-enabled');
    const uid = Store.user && Store.user.id;
    // O estado real é o bundle no servidor/aparelho: se existe chave, o PIN
    // está ligado mesmo antes de o cache ser aberto.
    let ligado = this.pinOn();
    try {
      if (uid && Sync.supa) ligado = !!(await loadKeyBundle(Sync.supa, uid)) || ligado;
    } catch { /* offline: vale o que o cache diz */ }
    if (cb) cb.checked = ligado;
    const hint = $('#pin-hint');
    if (hint) {
      hint.textContent = ligado
        ? 'Ligado — o app pede o PIN para abrir as notas neste aparelho.'
        : 'Desligado — as notas ficam em texto claro e o app abre direto.';
    }
    return ligado;
  },

  bindPin() {
    const cb = $('#pin-enabled');
    if (!cb) return;
    cb.addEventListener('change', () => this.togglePin(cb.checked));
    this.refreshPinUi();
  },

  async togglePin(ligar) {
    if (this._pinBusy) return;
    this._pinBusy = true;
    const cb = $('#pin-enabled');
    if (cb) cb.disabled = true;
    try {
      if (ligar) await this.enablePin();
      else await this.disablePin();
    } catch (e) {
      console.error('[pin] falhou:', e);
      this.toast('Não foi possível ' + (ligar ? 'ativar' : 'desligar') + ' o PIN: ' + (e.message || e), { kind: 'error' });
    } finally {
      this._pinBusy = false;
      if (cb) cb.disabled = false;
      await this.refreshPinUi();
    }
  },

  async enablePin() {
    const supa = Sync.supa;
    const uid = Store.user && Store.user.id;
    if (!supa || !uid) return this.toast('Entre na sua conta para criar um PIN', { kind: 'error' });
    const ok = await CryptoGate.ensure(supa, Store.user);
    if (!ok) return;
    const dek = getDek();
    if (!dek) throw new Error('chave não disponível');
    Store.setCipher(makeCacheCipher(uid, dek));
    OfflineQueue.setCipher(makeQueueCipher(uid, dek));
    await Store.hydrate().catch(() => {});
    // cifra o que já está em claro no servidor (idempotente e retomável)
    const r = await Backfill.run(supa, uid).catch(() => ({ done: 0 }));
    this.toast(r && r.done ? `PIN ativado — ${r.done} nota(s) cifrada(s)` : 'PIN ativado', { kind: 'success' });
  },

  async disablePin() {
    const supa = Sync.supa;
    const uid = Store.user && Store.user.id;
    if (!supa || !uid) return this.toast('Sem conexão: não dá para desligar o PIN agora', { kind: 'error' });
    // sem a DEK não há como decifrar: pede o PIN antes
    if (!getDek()) {
      const ok = await CryptoGate.ensure(supa, Store.user);
      if (!ok) return;
    }
    const dek = getDek();
    if (!dek) throw new Error('PIN não destravado');
    const r = await Backfill.revert(supa, uid, { dek });
    // só depois de reverter: apaga a chave (servidor + aparelho) e volta o
    // cache a texto claro. Se algo falhar antes, nada é perdido.
    const del = await supa.from('user_keys').delete().eq('user_id', uid);
    if (del.error) throw del.error;
    forgetBundle(uid);
    Store.disableCipher();
    lockKeys();
    this.toast(r && r.done ? `PIN desligado — ${r.done} nota(s) de volta em texto claro` : 'PIN desligado', { kind: 'success' });
  },
};
