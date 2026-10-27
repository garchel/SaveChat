import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  createKeys,
  unlockWithPassword,
  unlockWithRecovery,
  formatRecoveryCode,
  KEY_VERSION,
  KDF,
} from '../public/js/keys.js';
import { encryptJson, decryptJson } from '../public/js/crypto.js';

const ITER = 1000;
const AAD = 'notethread:1:u1:t1:c1:content';

test('cria bundle sem guardar senha nem código de recuperação', async () => {
  const { bundle, recoveryCode } = await createKeys('senha muito longa', { iterations: ITER });
  assert.equal(bundle.version, KEY_VERSION);
  assert.equal(bundle.kdf, KDF);
  assert.equal(bundle.kdf_iterations, ITER);
  assert.ok(bundle.salt);
  assert.equal(bundle.wrapped_dek.v, 1);
  assert.equal(bundle.recovery_wrapped_dek.v, 1);
  assert.equal(recoveryCode.length, 43);
  const stored = JSON.stringify(bundle);
  assert.ok(!stored.includes('senha muito longa'));
  assert.ok(!stored.includes(recoveryCode));
});

test('senha abre a DEK e a DEK original decifra o conteúdo', async () => {
  const { bundle, dek } = await createKeys('outra senha', { iterations: ITER });
  const unlocked = await unlockWithPassword(bundle, 'outra senha');
  const enc = await encryptJson({ texto: 'segredo' }, unlocked, AAD);
  assert.deepEqual(await decryptJson(enc, dek, AAD), { texto: 'segredo' });
});

test('código de recuperação abre a mesma DEK', async () => {
  const { bundle, dek, recoveryCode } = await createKeys('senha', { iterations: ITER });
  const unlocked = await unlockWithRecovery(bundle, recoveryCode);
  const enc = await encryptJson({ texto: 'volta' }, dek, AAD);
  assert.deepEqual(await decryptJson(enc, unlocked, AAD), { texto: 'volta' });
});

test('senha e código errados não abrem a DEK', async () => {
  const { bundle } = await createKeys('senha certa', { iterations: ITER });
  await assert.rejects(() => unlockWithPassword(bundle, 'senha errada'));
  await assert.rejects(() => unlockWithRecovery(bundle, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
});

test('bundle incompleto ou código ausente é recusado', async () => {
  await assert.rejects(() => unlockWithPassword({}, 'senha'));
  await assert.rejects(() => unlockWithRecovery({ salt: 'x' }, 'codigo'));
});

test('formata o código em grupos legíveis', () => {
  assert.equal(formatRecoveryCode('abcdefghijkl'), 'abcd efgh ijkl');
});

test('supabase.sql cria user_keys com RLS por usuário', () => {
  const sql = readFileSync('supabase.sql', 'utf8');
  assert.match(sql, /create table if not exists user_keys/);
  assert.match(sql, /wrapped_dek jsonb not null/);
  assert.match(sql, /recovery_wrapped_dek jsonb not null/);
  assert.match(sql, /alter table user_keys enable row level security/);
  assert.match(sql, /create policy "own keys" on user_keys for all using \(auth\.uid\(\) = user_id\)/);
  assert.ok(!/wrapped_dek text/.test(sql), 'DEK não pode ser guardada como texto solto');
  assert.match(sql, /alter table notes add column if not exists text_enc jsonb/);
  assert.match(sql, /alter table notes add column if not exists enc_version integer/);
  assert.match(sql, /alter table threads add column if not exists name_enc jsonb/);
  assert.match(sql, /alter table threads add column if not exists last_preview_enc jsonb/);
});
