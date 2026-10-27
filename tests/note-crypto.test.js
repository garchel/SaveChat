import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDek, encryptJson } from '../public/js/crypto.js';
import {
  encryptNoteText,
  decryptNoteText,
  encryptThreadPreview,
  decryptThreadPreview,
} from '../public/js/note-crypto.js';

const NOTE = { clientId: 'c1', threadId: 't1', text: 'mensagem secreta' };

test('cifra o texto da nota e devolve envelope sem plaintext', async () => {
  const dek = await generateDek();
  const field = await encryptNoteText(NOTE, dek, 'u1');
  assert.equal(field.text, null);
  assert.equal(field.enc_version, 1);
  assert.equal(field.text_enc.v, 1);
  assert.ok(!JSON.stringify(field.text_enc).includes('mensagem secreta'));

  const row = Object.assign({ client_id: 'c1', thread_id: 't1', text: null }, field);
  assert.equal(await decryptNoteText(row, dek, 'u1'), 'mensagem secreta');
});

test('AAD liga o texto ao usuário, thread e clientId', async () => {
  const dek = await generateDek();
  const field = await encryptNoteText(NOTE, dek, 'u1');
  const outraThread = { client_id: 'c1', thread_id: 't2', text_enc: field.text_enc };
  await assert.rejects(() => decryptNoteText(outraThread, dek, 'u1'));
  const outroUser = { client_id: 'c1', thread_id: 't1', text_enc: field.text_enc };
  await assert.rejects(() => decryptNoteText(outroUser, dek, 'u2'));
});

test('nota antiga em texto claro continua legível', async () => {
  const row = { client_id: 'c1', thread_id: 't1', text: 'antiga' };
  assert.equal(await decryptNoteText(row, null, 'u1'), 'antiga');
});

test('texto cifrado sem chave não vaza nem finge funcionar', async () => {
  const dek = await generateDek();
  const field = await encryptNoteText(NOTE, dek, 'u1');
  const row = { client_id: 'c1', thread_id: 't1', text_enc: field.text_enc };
  await assert.rejects(() => decryptNoteText(row, null, 'u1'), /bloqueada/);
});

test('texto vazio (áudio/foto) também é cifrado', async () => {
  const dek = await generateDek();
  const field = await encryptNoteText({ clientId: 'c2', threadId: 't1', text: '' }, dek, 'u1');
  assert.ok(field.text_enc);
  const row = { client_id: 'c2', thread_id: 't1', text_enc: field.text_enc };
  assert.equal(await decryptNoteText(row, dek, 'u1'), '');
});

test('prévia da conversa é cifrada e o fallback antigo funciona', async () => {
  const dek = await generateDek();
  const enc = await encryptThreadPreview('primeira linha', dek, 'u1', 't1');
  const row = { id: 't1', last_preview_enc: enc };
  assert.equal(await decryptThreadPreview(row, dek, 'u1'), 'primeira linha');
  assert.equal(await decryptThreadPreview({ id: 't1', last_preview: 'antiga' }, dek, 'u1'), 'antiga');
  await assert.rejects(() => decryptThreadPreview({ id: 't2', last_preview_enc: enc }, dek, 'u1'));
});

test('texto claro e cifrado usam a mesma forma de envelope', async () => {
  const dek = await generateDek();
  const field = await encryptNoteText(NOTE, dek, 'u1');
  const manual = await encryptJson(NOTE.text, dek, 'notethread:1:u1:t1:c1:text');
  assert.equal(field.text_enc.v, manual.v);
  assert.ok(field.text_enc.iv);
  assert.ok(field.text_enc.ct);
});
