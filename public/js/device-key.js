// Chave do aparelho: uma chave AES-GCM **não exportável** criada no navegador e
// guardada no IndexedDB. Ela embrulha a DEK (a chave que decifra as notas).
//
// Por que existe: com a DEK embrulhada por esta chave, abrir o app não pede mais
// nada — a criptografia continua ligada, mas o "código de 4 dígitos" deixa de ser
// a única forma de destravar. O código volta a ser o que deveria ser: bloqueio
// opcional por cima (Bloqueio do app).
//
// Limite honesto: a chave é do DISPOSITIVO. Em outro aparelho (ou com o
// IndexedDB apagado) ela não existe e o app cai no caminho antigo — digitar o
// código/recovery uma vez, e ali passa a ter a própria chave.
const DB = 'notethread-keys';
const STORE = 'device';
const KEY_ID = 'dekmaster';

function idb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// Cria (uma vez por aparelho) ou devolve a chave não exportável.
export async function deviceKey() {
  const existente = await idbGet(KEY_ID);
  if (existente) return existente;
  const nova = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, false /* extractable: nunca sai do aparelho */, ['encrypt', 'decrypt']);
  await idbPut(KEY_ID, nova);
  return nova;
}

async function deviceAes(key) {
  // a mesma chave, mas com uso restrito a AES-GCM (o objeto guardado é CryptoKey)
  return key;
}

export async function wrapWithDevice(dek, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.exportKey('raw', dek);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceAes(key), raw);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

export async function unwrapWithDevice(bundle, key) {
  if (!bundle || !bundle.iv || !bundle.ct) throw new Error('Envelope do aparelho ausente');
  const iv = Uint8Array.from(atob(bundle.iv), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(bundle.ct), (c) => c.charCodeAt(0));
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deviceAes(key), ct);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}
