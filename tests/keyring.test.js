import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAndSaveKeys,
  unlockKeys,
  unlockKeysWithRecovery,
  loadKeyBundle,
  isUnlocked,
  getDek,
  lockKeys,
  currentUid,
} from '../public/js/keyring.js';
import { encryptJson, decryptJson } from '../public/js/crypto.js';

const ITER = 1000;

function fakeSupa(state) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: state.row || null, error: state.error || null }),
        insert: async (row) => {
          if (state.row) return { error: new Error('duplicate key') };
          state.row = row;
          return { error: state.upsertError || null };
        },
      };
    },
  };
}

test('cria chaves, salva o bundle e mantém a DEK só na sessão', async () => {
  const state = {};
  const supa = fakeSupa(state);
  const code = await createAndSaveKeys(supa, 'u1', 'senha muito longa', { iterations: ITER });

  assert.equal(code.length, 43);
  assert.equal(state.row.user_id, 'u1');
  assert.equal(state.row.kdf_iterations, ITER);
  assert.ok(!JSON.stringify(state.row).includes('senha muito longa'));
  assert.ok(!JSON.stringify(state.row).includes(code));
  assert.ok(isUnlocked('u1'));
  assert.equal(currentUid(), 'u1');

  lockKeys();
  assert.equal(getDek(), null);
  assert.equal(isUnlocked('u1'), false);
});

test('desbloqueia com senha e com código de recuperação', async () => {
  const state = {};
  const supa = fakeSupa(state);
  const code = await createAndSaveKeys(supa, 'u1', 'senha', { iterations: ITER });
  const saved = state.row;
  lockKeys();

  const dek = await unlockKeys(supa, 'u1', 'senha');
  const enc = await encryptJson('oi', dek, 'aad');
  assert.equal(await decryptJson(enc, dek, 'aad'), 'oi');
  lockKeys();

  const viaCode = await unlockKeysWithRecovery(supa, 'u1', code);
  assert.ok(viaCode);
  assert.ok(state.row === saved, 'unlock não pode regravar as chaves');
});

test('senha errada não desbloqueia e não altera a sessão', async () => {
  const state = {};
  const supa = fakeSupa(state);
  await createAndSaveKeys(supa, 'u1', 'senha certa', { iterations: ITER });
  lockKeys();
  await assert.rejects(() => unlockKeys(supa, 'u1', 'senha errada'));
  assert.equal(isUnlocked('u1'), false);
});

test('conta sem chaves é recusada', async () => {
  const state = {};
  const supa = fakeSupa(state);
  assert.equal(await loadKeyBundle(supa, 'u2'), null);
  await assert.rejects(() => unlockKeys(supa, 'u2', 'senha'), /não encontradas/);
  await assert.rejects(() => unlockKeysWithRecovery(supa, 'u2', 'abc'), /não encontradas/);
});

test('falha ao salvar não deixa a sessão desbloqueada', async () => {
  const state = { upsertError: new Error('RLS') };
  const supa = fakeSupa(state);
  await assert.rejects(() => createAndSaveKeys(supa, 'u1', 'senha', { iterations: ITER }), /RLS/);
  assert.equal(isUnlocked('u1'), false);
});
