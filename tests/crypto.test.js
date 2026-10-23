import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PBKDF2_ITERATIONS,
  randomSalt,
  deriveKek,
  generateDek,
  wrapDek,
  unwrapDek,
  generateRecoveryCode,
  deriveRecoveryKey,
  fieldAad,
  encryptJson,
  decryptJson,
  toBase64,
  fromBase64,
} from '../public/js/crypto.js';

const ITER = 1000;

test('base64 preserva bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test('DEK é protegida pela senha e volta a decifrar', async () => {
  const salt = randomSalt();
  const kek = await deriveKek('senha longa e correta', salt, ITER);
  const dek = await generateDek();
  const wrapped = await wrapDek(dek, kek);

  const again = await deriveKek('senha longa e correta', salt, ITER);
  const unwrapped = await unwrapDek(wrapped, again);
  const aad = fieldAad({ userId: 'u1', threadId: 't1', clientId: 'c1', field: 'content' });
  const enc = await encryptJson({ texto: 'segredo' }, unwrapped, aad);

  assert.deepEqual(await decryptJson(enc, dek, aad), { texto: 'segredo' });
  const back = await encryptJson({ texto: 'volta' }, dek, aad);
  assert.deepEqual(await decryptJson(back, unwrapped, aad), { texto: 'volta' });
  assert.equal(wrapped.v, 1);
  assert.ok(wrapped.iv);
  assert.ok(wrapped.ct);
});

test('senha vazia é recusada', async () => {
  await assert.rejects(() => deriveKek('', randomSalt(), ITER));
});

test('senha errada não abre a DEK', async () => {
  const salt = randomSalt();
  const right = await deriveKek('senha certa', salt, ITER);
  const wrong = await deriveKek('senha errada', salt, ITER);
  const wrapped = await wrapDek(await generateDek(), right);
  await assert.rejects(() => unwrapDek(wrapped, wrong));
});

test('AAD diferente não decifra (nota movida de contexto)', async () => {
  const kek = await deriveKek('senha', randomSalt(), ITER);
  const dek = await unwrapDek(await wrapDek(await generateDek(), kek), kek);
  const aad = fieldAad({ userId: 'u1', threadId: 't1', clientId: 'c1', field: 'content' });
  const enc = await encryptJson('oi', dek, aad);
  await assert.rejects(() => decryptJson(enc, dek, `${aad}:outra`));
});

test('IV é novo a cada cifragem', async () => {
  const key = await generateDek();
  const a = await encryptJson('x', key, 'aad');
  const b = await encryptJson('x', key, 'aad');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('código de recuperação abre a mesma DEK', async () => {
  const code = generateRecoveryCode();
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  const kek = await deriveRecoveryKey(code);
  const wrapped = await wrapDek(await generateDek(), kek);
  const unwrapped = await unwrapDek(wrapped, await deriveRecoveryKey(code));
  assert.ok(unwrapped);
});

test('código de recuperação curto ou vazio é recusado', async () => {
  await assert.rejects(() => deriveRecoveryKey(''));
  await assert.rejects(() => deriveRecoveryKey('abc'));
});

test('PBKDF2 usa 600 mil iterações por padrão', () => {
  assert.equal(PBKDF2_ITERATIONS, 600000);
});
