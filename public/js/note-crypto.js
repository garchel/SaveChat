import { encryptJson, decryptJson, fieldAad } from './crypto.js';

export const NOTE_ENC_VERSION = 1;

function noteContext(userId, note) {
  return fieldAad({
    userId,
    threadId: note.threadId || note.thread_id,
    clientId: note.clientId || note.client_id,
    field: 'text',
  });
}

function threadContext(userId, threadId) {
  return fieldAad({ userId, threadId, clientId: threadId, field: 'last_preview' });
}

export async function encryptNoteText(note, dek, userId) {
  const text = note.text == null ? '' : String(note.text);
  return {
    text: null,
    text_enc: await encryptJson(text, dek, noteContext(userId, note)),
    enc_version: NOTE_ENC_VERSION,
  };
}

export async function decryptNoteText(row, dek, userId) {
  if (!row || !row.text_enc) return row ? row.text : '';
  if (!dek) throw new Error('Criptografia bloqueada.');
  return String(await decryptJson(row.text_enc, dek, noteContext(userId, row)));
}

export async function encryptThreadPreview(preview, dek, userId, threadId) {
  return encryptJson(String(preview || ''), dek, threadContext(userId, threadId));
}

export async function decryptThreadPreview(row, dek, userId) {
  if (!row || !row.last_preview_enc) return row ? (row.last_preview || '') : '';
  if (!dek) throw new Error('Criptografia bloqueada.');
  return String(await decryptJson(row.last_preview_enc, dek, threadContext(userId, row.id)));
}
