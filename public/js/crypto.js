const webcrypto = globalThis.crypto;
const textEnc = new TextEncoder();
const textDec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600000;
export const ENC_VERSION = 1;
const DEK_AAD = 'notethread:dek:v1';
const RECOVERY_SALT = 'notethread:recovery:v1';

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value);
}

export function toBase64(value) {
  const bytes = bytesOf(value);
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw);
}

export function fromBase64(value) {
  const raw = atob(String(value || ''));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64Url(value) {
  return toBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  let s = String(value || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  while (s.length % 4) s += '=';
  return fromBase64(s);
}

export function randomBytes(length) {
  if (!webcrypto) throw new Error('WebCrypto indisponível neste navegador.');
  return webcrypto.getRandomValues(new Uint8Array(length));
}

export function randomSalt() {
  return toBase64(randomBytes(16));
}

export async function deriveKek(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  if (!String(passphrase || '')) throw new Error('Senha de criptografia vazia.');
  const saltBytes = typeof salt === 'string' ? fromBase64(salt) : bytesOf(salt);
  const material = await webcrypto.subtle.importKey(
    'raw', textEnc.encode(String(passphrase || '')), 'PBKDF2', false, ['deriveKey'],
  );
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function generateDek() {
  return webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function wrapBytes(dek, kek, aad) {
  const iv = randomBytes(12);
  const wrapped = await webcrypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv,
    additionalData: textEnc.encode(aad),
  });
  return { v: ENC_VERSION, iv: toBase64(iv), ct: toBase64(wrapped) };
}

async function unwrapBytes(payload, kek, aad) {
  if (!payload || payload.v !== ENC_VERSION || !payload.iv || !payload.ct) {
    throw new Error('Chave protegida em formato desconhecido.');
  }
  return webcrypto.subtle.unwrapKey(
    'raw',
    fromBase64(payload.ct),
    kek,
    { name: 'AES-GCM', iv: fromBase64(payload.iv), additionalData: textEnc.encode(aad) },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function wrapDek(dek, kek) {
  return wrapBytes(dek, kek, DEK_AAD);
}

export async function unwrapDek(payload, kek) {
  return unwrapBytes(payload, kek, DEK_AAD);
}

export function generateRecoveryCode() {
  return toBase64Url(randomBytes(32));
}

export async function deriveRecoveryKey(code) {
  const raw = fromBase64Url(code);
  if (raw.length !== 32) throw new Error('Código de recuperação inválido.');
  const material = await webcrypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: textEnc.encode(RECOVERY_SALT),
      info: textEnc.encode('wrap-dek'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export function fieldAad({ userId, threadId, clientId, field, version = ENC_VERSION }) {
  const parts = [userId, threadId, clientId, field].map((part) => String(part || ''));
  if (parts.some((part) => !part)) throw new Error('Contexto de criptografia incompleto.');
  return `notethread:${version}:${parts.join(':')}`;
}

export async function encryptJson(value, key, aad) {
  const iv = randomBytes(12);
  const ct = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: textEnc.encode(String(aad || '')) },
    key,
    textEnc.encode(JSON.stringify(value)),
  );
  return { v: ENC_VERSION, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptJson(payload, key, aad) {
  if (!payload || payload.v !== ENC_VERSION || !payload.iv || !payload.ct) {
    throw new Error('Conteúdo cifrado em formato desconhecido.');
  }
  const plain = await webcrypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(payload.iv),
      additionalData: textEnc.encode(String(aad || '')),
    },
    key,
    fromBase64(payload.ct),
  );
  return JSON.parse(textDec.decode(plain));
}
