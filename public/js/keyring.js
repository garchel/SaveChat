import { createKeys, unlockWithPassword, unlockWithRecovery } from './keys.js';

// O bundle (salt + DEK embrulhada) NÃO é segredo: sem a senha/código ele é
// inútil. Guardar uma cópia local permite desbloquear o cache cifrado mesmo
// sem rede — sem ela, um boot offline ficaria preso no gate.
const CACHE_PREFIX = 'notethread.keys::u::';

function readCached(uid) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_PREFIX + uid);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCached(uid, bundle) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (bundle) localStorage.setItem(CACHE_PREFIX + uid, JSON.stringify(bundle));
    else localStorage.removeItem(CACHE_PREFIX + uid);
  } catch {}
}

let session = { uid: null, bundle: null, dek: null };

export function getDek() {
  return session.dek;
}

export function isUnlocked(uid) {
  return !!session.dek && (!uid || session.uid === uid);
}

export function currentUid() {
  return session.uid;
}

export function lockKeys() {
  session = { uid: null, bundle: null, dek: null };
}

export async function loadKeyBundle(supa, uid) {
  if (!supa || !uid) throw new Error('Sessão inválida.');
  try {
    const { data, error } = await supa.from('user_keys').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    if (data) writeCached(uid, data);
    return data || null;
  } catch (e) {
    // offline: o servidor não respondeu, mas o bundle local abre a DEK
    const cached = readCached(uid);
    if (cached) {
      console.warn('[crypto] servidor indisponível — usando o bundle local', e && e.message);
      return cached;
    }
    throw e;
  }
}

export async function createAndSaveKeys(supa, uid, passphrase, { iterations } = {}) {
  if (!supa || !uid) throw new Error('Sessão inválida.');
  const created = await createKeys(passphrase, iterations ? { iterations } : undefined);
  const row = Object.assign({ user_id: uid }, created.bundle, { updated_at: new Date().toISOString() });
  // insert (não upsert): nunca sobrescrever uma chave já existente por corrida
  const { error } = await supa.from('user_keys').insert(row);
  if (error) throw error;
  writeCached(uid, row);
  session = { uid, bundle: created.bundle, dek: created.dek };
  return created.recoveryCode;
}

export async function unlockKeys(supa, uid, passphrase) {
  const bundle = await loadKeyBundle(supa, uid);
  if (!bundle) throw new Error('Chaves de criptografia não encontradas nesta conta.');
  const dek = await unlockWithPassword(bundle, passphrase);
  session = { uid, bundle, dek };
  return dek;
}

export async function unlockKeysWithRecovery(supa, uid, recoveryCode) {
  const bundle = await loadKeyBundle(supa, uid);
  if (!bundle) throw new Error('Chaves de criptografia não encontradas nesta conta.');
  const dek = await unlockWithRecovery(bundle, recoveryCode);
  session = { uid, bundle, dek };
  return dek;
}
