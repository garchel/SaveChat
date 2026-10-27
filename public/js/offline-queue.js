// Fila offline robusta — IndexedDB + fallback localStorage, com backoff exponencial
const DB_NAME = 'notethread-offline';
const STORE = 'syncQueue';

// Cipher opcional (crypto-session.js). Com ele ligado, o CONTEÚDO do item vai
// cifrado para o disco: uma nota pendente não pode ficar em texto claro no
// IndexedDB/localStorage. Itens antigos (sem `enc`) continuam sendo drenados.
let cipher = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const res = fn(store);
      tx.oncomplete = () => resolve(res);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null; // fallback usará localStorage
  }
}

export const OfflineQueue = {
  // `cipher` = { uid, encrypt(payload), decrypt(envelope) }. `null` desliga
  // (logout / modo local sem criptografia).
  setCipher(next) {
    cipher = (next && next.uid) ? next : null;
  },

  // `owner` = id da conta que criou o item. A fila é GLOBAL no dispositivo, mas
  // cada item pertence a UMA conta: ao trocar de usuário no mesmo navegador, os
  // itens da conta anterior NÃO podem ser enviados com o user_id da nova (o RLS
  // aceitaria, e a nota vazaria para a conta errada). Eles ficam na fila até a
  // conta dona voltar a ficar online.
  async add(type, payload, owner) {
    const item = { type, ts: Date.now(), tries: 0, nextRetry: 0, owner: owner || null };
    const useCipher = cipher && owner && cipher.uid === owner;
    // Item de CONTA sem a chave em memória não é gravado: ficaria em texto
    // claro no disco. O app só enfileira desbloqueado; se algo escapar (evento
    // em voo no logout), melhor perder o envio do que vazar a nota.
    if (owner && !useCipher) {
      console.warn('[queue] item não gravado: conta desbloqueada é necessária para cifrar');
      return;
    }
    try {
      if (useCipher) item.enc = await cipher.encrypt(payload);
      else item.payload = payload;
    } catch (e) {
      // sem chave não dá para gravar cifrado — e gravar claro seria pior
      console.warn('[queue] item não gravado: criptografia indisponível', e);
      return;
    }
    const ok = await withStore('readwrite', (s) => s.add(item));
    if (ok !== null) return;
    // fallback localStorage
    try {
      const q = JSON.parse(localStorage.getItem('notethread.syncq') || '[]');
      q.push(item);
      localStorage.setItem('notethread.syncq', JSON.stringify(q.slice(-500)));
    } catch {}
  },
  async getAll() {
    const res = await withStore('readonly', (s) => {
      const req = s.getAll();
      req.onsuccess = () => {};
      return new Promise((res) => { req.onsuccess = () => res(req.result); req.onerror = () => res([]); });
    });
    let raw;
    if (res !== null) raw = res;
    else {
      try { raw = JSON.parse(localStorage.getItem('notethread.syncq') || '[]'); } catch { raw = []; }
    }
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      if (!item) continue;
      if (!item.enc) { out.push(item); continue; }
      // item cifrado sem a chave da conta dona em memória: fica na fila
      if (!cipher || (item.owner && item.owner !== cipher.uid)) continue;
      try {
        const payload = await cipher.decrypt(item.enc);
        const copy = Object.assign({}, item, { payload });
        delete copy.enc;
        out.push(copy);
      } catch (e) {
        console.warn('[queue] item cifrado ilegível — mantido na fila', e);
      }
    }
    return out;
  },
  async remove(id) {
    const ok = await withStore('readwrite', (s) => s.delete(id));
    if (ok !== null) return;
    try {
      const q = JSON.parse(localStorage.getItem('notethread.syncq') || '[]');
      const filtered = q.filter((_, idx) => idx !== id && _.id !== id);
      localStorage.setItem('notethread.syncq', JSON.stringify(filtered));
    } catch {}
  },
  async clear() {
    await withStore('readwrite', (s) => s.clear());
    try { localStorage.removeItem('notethread.syncq'); } catch {}
  },
  // para retry: atualiza tries/nextRetry
  async bump(id) {
    await withStore('readwrite', (s) => {
      const req = s.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return;
        item.tries = (item.tries || 0) + 1;
        item.nextRetry = Date.now() + Math.min(60000, 1000 * Math.pow(2, item.tries));
        s.put(item);
      };
    });
  },
  async registerSync() {
    try {
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('notethread-sync');
      }
    } catch {}
  }
};
