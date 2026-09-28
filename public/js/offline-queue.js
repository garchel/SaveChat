// Fila offline robusta — IndexedDB + fallback localStorage, com backoff exponencial
const DB_NAME = 'notethread-offline';
const STORE = 'syncQueue';

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
  // `owner` = id da conta que criou o item. A fila é GLOBAL no dispositivo, mas
  // cada item pertence a UMA conta: ao trocar de usuário no mesmo navegador, os
  // itens da conta anterior NÃO podem ser enviados com o user_id da nova (o RLS
  // aceitaria, e a nota vazaria para a conta errada). Eles ficam na fila até a
  // conta dona voltar a ficar online.
  async add(type, payload, owner) {
    const item = { type, payload, ts: Date.now(), tries: 0, nextRetry: 0, owner: owner || null };
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
    if (res !== null) return res;
    try { return JSON.parse(localStorage.getItem('notethread.syncq') || '[]'); } catch { return []; }
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
