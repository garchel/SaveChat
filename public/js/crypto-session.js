// Sessão de criptografia: transforma a DEK em memória (keyring.js) em um
// "cipher" pronto para cifrar dados LOCAIS (cache do Store, fila offline) e
// remotos (sync). Quem consome só vê envelopes `{ v: 1, enc: { v, iv, ct } }`;
// a chave nunca sai deste módulo.
//
// O AAD separa os domínios: o cache local de um usuário não pode ser aberto
// como fila offline (nem como conteúdo de nota), mesmo com a mesma DEK.
import { encryptJson, decryptJson } from './crypto.js';
import { getDek } from './keyring.js';

export const CACHE_AAD = 'notethread:cache:v1';
export const QUEUE_AAD = 'notethread:queue:v1';

function keyOrThrow(dek) {
  if (dek) return dek;
  const current = getDek();
  if (!current) throw new Error('Criptografia bloqueada.');
  return current;
}

// Envelope do cache/fila: `{ v: 1, enc: { v, iv, ct } }`. O `v` de fora é o
// formato do envelope; o de dentro, o do `encryptJson` (crypto.js).
export function isEncryptedPayload(value) {
  return !!(value && value.v === 1 && value.enc && value.enc.iv && value.enc.ct);
}

function cipherFor(uid, kind, dek) {
  if (!uid) throw new Error('Sessão inválida.');
  const aad = `${kind}:${uid}`;
  return {
    uid,
    kind,
    encrypt: async (value) => ({ v: 1, enc: await encryptJson(value, keyOrThrow(dek), aad) }),
    decrypt: (payload) => {
      if (!isEncryptedPayload(payload)) throw new Error('Cache local em formato desconhecido.');
      return decryptJson(payload.enc, keyOrThrow(dek), aad);
    },
  };
}

// `dek` explícito só existe para testes; em produção a chave vem do keyring.
export function makeCacheCipher(uid, dek) { return cipherFor(uid, CACHE_AAD, dek); }
export function makeQueueCipher(uid, dek) { return cipherFor(uid, QUEUE_AAD, dek); }
