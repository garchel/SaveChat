// Fase 1 da criptografia — cache LOCAL.
//
// O cache do Store e a fila offline vivem no disco do usuário. Antes desta
// fase os dois guardavam o texto das notas em claro (`localStorage` /
// IndexedDB), então qualquer cópia do navegador (backup, perfil roubado,
// outro usuário do mesmo PC) lia tudo sem a senha de criptografia.
//
// Contrato coberto aqui:
//   1) conta com chave grava ciphertext; nada de texto legível no disco
//   2) boot sem a chave sobe BLOQUEADO (conteúdo não entra em memória) e um
//      save acidental não sobrescreve o cache
//   3) hydrate() devolve o conteúdo depois do unlock
//   4) uma conta que já foi cifrada NUNCA volta a gravar texto claro
//   5) envelopes são separados por domínio/conta (AAD)
//   6) a fila offline cifra o payload e não entrega item de outra conta
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

const UID = 'u1';
const BUCKET = `notethread.v2::u::${UID}`;

function resetMemory(Store) {
  Store.data = {
    user: null,
    threads: {},
    folders: {},
    notes: {},
    ui: { expanded: {} },
  };
  Store._uid = null;
  Store.cipher = null;
  Store.locked = false;
  Store._encrypted = false;
  Store._encryptedBucket = null;
  Store._writes = Promise.resolve();
}

async function seeded() {
  const { Store } = await import('../public/js/store.js');
  const { generateDek } = await import('../public/js/crypto.js');
  const { makeCacheCipher } = await import('../public/js/crypto-session.js');
  const ls = fakeLocalStorage();
  global.localStorage = ls;
  resetMemory(Store);
  ls.setItem('notethread.v2', JSON.stringify({
    user: { id: UID, mail: 'a@example.com', provider: 'supabase' },
    ui: { theme: 'ocean' },
  }));
  ls.setItem(BUCKET, JSON.stringify({
    threads: { t1: { id: 't1', name: 'Diário' } },
    folders: {},
    notes: { t1: [{ clientId: 'n1', threadId: 't1', text: 'segredo absoluto' }] },
    scope: { aiModel: 'gemini-3.6-flash' },
  }));
  Store.load();
  const dek = await generateDek();
  return { Store, ls, dek, makeCacheCipher };
}

test('conta com chave grava o cache cifrado (nenhum texto legível no disco)', async () => {
  const { Store, ls, dek, makeCacheCipher } = await seeded();

  Store.setCipher(makeCacheCipher(UID, dek));
  await Store.flush();

  const raw = ls.getItem(BUCKET);
  assert.ok(raw, 'bucket não foi gravado');
  assert.ok(!raw.includes('segredo absoluto'), 'texto da nota vazou em claro');
  assert.ok(!raw.includes('Diário'), 'nome da conversa vazou em claro');
  const envelope = JSON.parse(raw);
  assert.equal(envelope.v, 1);
  assert.ok(envelope.enc && envelope.enc.iv && envelope.enc.ct, 'envelope sem iv/ct');

  // as preferências do DISPOSITIVO continuam legíveis (moram na raiz)
  const root = JSON.parse(ls.getItem('notethread.v2'));
  assert.equal(root.ui.theme, 'ocean');
});

test('boot sem a chave sobe bloqueado, não apaga o cache e abre no hydrate', async () => {
  const { Store, ls, dek, makeCacheCipher } = await seeded();
  Store.setCipher(makeCacheCipher(UID, dek));
  await Store.flush();
  const encryptedRaw = ls.getItem(BUCKET);

  // "fechou o navegador": estado em memória perdido, disco intacto
  resetMemory(Store);
  Store.load();
  assert.equal(Store.locked, true, 'bucket cifrado deveria subir bloqueado');
  assert.deepEqual(Store.data.threads, {}, 'conteúdo não pode entrar em memória antes do unlock');
  assert.deepEqual(Store.data.notes, {});
  // preferência da conta também fica fora até o unlock
  assert.equal(Store.data.ui.aiModel, undefined);

  // save enquanto bloqueado não pode apagar o cache cifrado
  Store.upsertFolder({ id: 'f1', name: 'Pasta nova' });
  await Store.flush();
  assert.equal(ls.getItem(BUCKET), encryptedRaw, 'cache cifrado foi sobrescrito sem a chave');

  // unlock → hydrate
  Store.setCipher(makeCacheCipher(UID, dek));
  assert.equal(await Store.hydrate(), true);
  assert.equal(Store.locked, false);
  assert.equal(Store.data.threads.t1.name, 'Diário');
  assert.equal(Store.data.notes.t1[0].text, 'segredo absoluto');
  assert.equal(Store.data.ui.aiModel, 'gemini-3.6-flash');
  assert.equal(await Store.hydrate(), false, 'hydrate repetido não tem o que abrir');

  // o conteúdo do cache é o mesmo de antes do bloqueio
  assert.equal(Store.data.threads.t1.name, 'Diário');
  assert.equal(Store.data.notes.t1[0].text, 'segredo absoluto');
});

test('conta já cifrada nunca volta a gravar texto claro', async () => {
  const { Store, ls, dek, makeCacheCipher } = await seeded();
  const cipher = makeCacheCipher(UID, dek);
  Store.setCipher(cipher);
  await Store.flush();

  // logout: a chave sai da memória antes de a última gravação chegar ao disco
  Store.clearCipher();
  Store.upsertThread({ id: 't2', name: 'Nova conversa' });
  await Store.flush();

  const raw = JSON.parse(ls.getItem(BUCKET));
  assert.equal(raw.v, 1, 'bucket voltou a ser gravado em claro');
  assert.ok(!ls.getItem(BUCKET).includes('Nova conversa'));

  // com a chave de volta, o que estava só em memória é persistido cifrado
  Store.setCipher(cipher);
  Store.save();
  await Store.flush();
  Store.cipher = null;
  Store._locked = false;
  const reopened = await cipher.decrypt(JSON.parse(ls.getItem(BUCKET)));
  assert.equal(reopened.threads.t2.name, 'Nova conversa');
});

test('envelopes são separados por domínio e por conta (AAD)', async () => {
  const { dek, makeCacheCipher } = await seeded();
  const { makeQueueCipher } = await import('../public/js/crypto-session.js');

  const cache = makeCacheCipher(UID, dek);
  const envelope = await cache.encrypt({ segredo: 1 });

  await assert.rejects(
    () => makeQueueCipher(UID, dek).decrypt(envelope),
    'envelope do cache não pode abrir como fila offline',
  );
  await assert.rejects(
    () => makeCacheCipher('u2', dek).decrypt(envelope),
    'envelope de outra conta não pode abrir',
  );
  assert.deepEqual(await cache.decrypt(envelope), { segredo: 1 });
});

test('troca de conta não grava o cache da nova com a chave da anterior', async () => {
  const { Store, ls, dek, makeCacheCipher } = await seeded();
  const cipher = makeCacheCipher(UID, dek);
  Store.setCipher(cipher);
  await Store.flush();
  const before = await cipher.decrypt(JSON.parse(ls.getItem(BUCKET)));

  Store.setUser({ id: 'u2', mail: 'b@example.com', provider: 'supabase' });
  await Store.flush();

  // bucket da conta que saiu continua cifrado e com o mesmo conteúdo
  const after = JSON.parse(ls.getItem(BUCKET));
  assert.equal(after.v, 1, 'bucket da conta anterior foi regravado em claro');
  assert.ok(!ls.getItem(BUCKET).includes('segredo absoluto'));
  assert.deepEqual(await cipher.decrypt(after), before);
  // a conta nova (nunca cifrada) começa vazia e sem herdar dados
  const bucketB = JSON.parse(ls.getItem('notethread.v2::u::u2'));
  assert.deepEqual(bucketB.threads, {});
  assert.deepEqual(bucketB.notes, {});
});

test('fila offline cifra o payload e só entrega o item à conta dona', async () => {
  const { dek, makeCacheCipher } = await seeded();
  const { makeQueueCipher } = await import('../public/js/crypto-session.js');
  const { OfflineQueue } = await import('../public/js/offline-queue.js');
  const ls = global.localStorage;

  OfflineQueue.setCipher(makeQueueCipher(UID, dek));
  await OfflineQueue.add('note:upsert', { clientId: 'q1', text: 'senha do wifi' }, UID);

  const raw = ls.getItem('notethread.syncq');
  assert.ok(raw, 'item não foi para o disco');
  assert.ok(!raw.includes('senha do wifi'), 'payload da fila vazou em claro');

  const mine = await OfflineQueue.getAll();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].payload.text, 'senha do wifi');
  assert.equal(mine[0].enc, undefined, 'getAll devolve payload decifrado, não o envelope');

  // app bloqueado (sem chave): o item NÃO é entregue e continua na fila
  OfflineQueue.setCipher(null);
  assert.deepEqual(await OfflineQueue.getAll(), []);
  assert.ok(ls.getItem('notethread.syncq').includes('enc'));

  // outra conta: a chave da B não abre o item da A
  const { generateDek } = await import('../public/js/crypto.js');
  OfflineQueue.setCipher(makeQueueCipher('u2', await generateDek()));
  assert.deepEqual(await OfflineQueue.getAll(), []);

  // a dona volta
  OfflineQueue.setCipher(makeQueueCipher(UID, dek));
  assert.equal((await OfflineQueue.getAll())[0].payload.clientId, 'q1');
});

test('fila offline não grava em claro item de conta sem chave em memória', async () => {
  await seeded();
  const { OfflineQueue } = await import('../public/js/offline-queue.js');
  const ls = global.localStorage;

  OfflineQueue.setCipher(null);
  await OfflineQueue.add('note:upsert', { clientId: 'q2', text: 'não pode vazar' }, UID);

  const raw = ls.getItem('notethread.syncq');
  assert.equal(raw, null, 'item de conta foi gravado em claro');
});

test('itens legados (texto claro, sem owner) continuam drenáveis', async () => {
  await seeded();
  const { OfflineQueue } = await import('../public/js/offline-queue.js');
  const ls = global.localStorage;

  ls.setItem('notethread.syncq', JSON.stringify([
    { type: 'note:upsert', ts: 1, tries: 0, nextRetry: 0, payload: { clientId: 'velho', text: 'antigo' } },
  ]));

  OfflineQueue.setCipher(null);
  const items = await OfflineQueue.getAll();
  assert.deepEqual(items.map((i) => i.payload.clientId), ['velho']);
});
