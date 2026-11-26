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
import { unlockWithPassword, rewrapWithPassword } from '../keys.js';
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
    const btnChange = $('#pin-change');
    if (btnChange) btnChange.classList.toggle('hidden', !ligado);
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
    const btnChange = $('#pin-change');
    if (btnChange && !btnChange.dataset.bound) {
      btnChange.dataset.bound = '1';
      btnChange.addEventListener('click', () => this.changePin());
    }
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

  // Troca o PIN mantendo os dados: a DEK é a mesma, só muda a senha que a
  // embrulha. Exige o PIN atual (se não, qualquer um trocaria e teria acesso).
  async changePin() {
    const supa = Sync.supa;
    const uid = Store.user && Store.user.id;
    if (!supa || !uid) return this.toast('Sem conexão com o servidor', { kind: 'error' });
    this.showModal('Alterar PIN',
      '<p class="modal-hint">Digite o PIN atual e o novo PIN de 4 dígitos.</p>'
      + '<input id="pin-old" type="password" inputmode="numeric" maxlength="4" placeholder="PIN atual" style="width:100%" />'
      + '<input id="pin-new" type="password" inputmode="numeric" maxlength="4" placeholder="Novo PIN" style="width:100%;margin-top:8px" />'
      + '<input id="pin-new2" type="password" inputmode="numeric" maxlength="4" placeholder="Repita o novo PIN" style="width:100%;margin-top:8px" />',
      async () => {
        const atual = ($('#pin-old') || {}).value || '';
        const novo = ($('#pin-new') || {}).value || '';
        const rep = ($('#pin-new2') || {}).value || '';
        if (!/^\d{4}$/.test(novo)) return this.toast('O novo PIN precisa ter 4 dígitos', { kind: 'error' });
        if (novo !== rep) return this.toast('Os PINs não são iguais', { kind: 'error' });
        if (novo === atual) return this.toast('O novo PIN é igual ao atual', { kind: 'info' });
        try {
          const bundle = await loadKeyBundle(supa, uid);
          if (!bundle) return this.toast('Esta conta ainda não tem PIN', { kind: 'error' });
          const dek = await unlockWithPassword(bundle, atual);
          const novoBundle = await rewrapWithPassword(bundle, dek, novo);
          const { error } = await supa.from('user_keys').update({
            version: novoBundle.version,
            salt: novoBundle.salt,
            kdf: novoBundle.kdf,
            kdf_iterations: novoBundle.kdf_iterations,
            wrapped_dek: novoBundle.wrapped_dek,
            updated_at: new Date().toISOString(),
          }).eq('user_id', uid);
          if (error) throw error;
          // o bundle em cache local ainda tem o salt antigo
          forgetBundle(uid);
          this.toast('PIN alterado', { kind: 'success' });
        } catch (e) {
          console.warn('[pin] troca falhou', e);
          this.toast('PIN atual incorreto', { kind: 'error' });
        }
      });
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
