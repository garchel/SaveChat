// Regressão (v1.13.3): isolamento de dados por conta no armazenamento local.
//
// Sintoma original: ao criar uma conta nova com outro e-mail, confirmar o
// e-mail e reabrir o app, ele caía na conta antiga — com TODAS as conversas
// antigas visíveis. Causa: `notethread.v2` guardava conteúdo + usuário na
// mesma chave, então qualquer login reutilizava o conteúdo anterior.
//
// Este teste cobre o contrato do Store:
//   1) migração do formato antigo (conteúdo na raiz) para o bucket da conta
//   2) troca de conta → conta nova começa VAZIA (sem conversas, sem chave da
//      IA, sem rotina da Diária)
//   3) voltar para a conta antiga → os dados dela reaparecem intactos
//   4) preferências de dispositivo (tema) sobrevivem à troca de conta
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'velho@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Conversa Antiga', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [{ id: 'n1', threadId: 't1', text: 'nota antiga', ts: Date.now() - 50000, clientId: 'c1' }] },
  ui: {
    // nome de mascote já definido: sem isto o modal de primeiro login
    // abre sobre o app e bloqueia os testes
    mascot: { nameSet: true },
    expanded: {},
    sounds: { enabled: false },
    theme: 'ocean',
    aiKey: 'CHAVE-SECRETA-DA-CONTA-VELHA',
    dailyRoutine: { items: [{ id: 'r1', text: 'rotina velha' }], log: {} },
  },
};

// NOTA: o guard `if (!localStorage.getItem('notethread.v2'))` parece
// suspeito, mas é inofensivo — cada teste roda num BrowserContext novo
// (não há `reuseContext` no playwright.config), então o storage começa
// vazio. Uma versão anterior deste arquivo removia a raiz antes de semear
// achando que esse era o flaky; isso QUEBROU o teste 3, que depende do
// bucket `::u::velho@example.com` criado pela migração do teste 1.
test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

test('conteúdo antigo migra para o bucket da conta e sobrevive ao reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.tnode', { hasText: 'Conversa Antiga' })).toHaveCount(1);
  // a raiz não deve mais carregar o conteúdo (só sessão + prefs do dispositivo)
  const rootHasContent = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('notethread.v2'));
    return !!(d.threads || d.folders || d.notes);
  });
  expect(rootHasContent).toBe(false);
  // o bucket da conta existe e contém as conversas
  const bucket = await page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('notethread.v2::u::velho@example.com') || 'null');
    return b ? { threads: Object.keys(b.threads || {}), notes: Object.keys(b.notes || {}) } : null;
  });
  expect(bucket).toEqual({ threads: ['t1'], notes: ['t1'] });
});

test('conta nova não enxerga as conversas, a chave da IA nem a rotina da conta antiga', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  const result = await page.evaluate(() => {
    const { Store, UI } = window.NoteThread;
    Store.setUser({ name: 'novo', mail: 'novo@example.com', provider: 'supabase', id: 'uid-novo' });
    // `renderAuthOrApp()` é assíncrono desde o CryptoGate (busca a chave da
    // conta antes de pintar). Aqui a conta nova não tem chave e o teste não
    // tem servidor: renderiza a árvore direto para medir o DOM sem depender
    // da rede. A árvore lê só do Store, que é o contrato em teste.
    UI.renderTree();
    UI.renderMe();
    return {
      user: Store.user.mail,
      threads: Store.threadList().map((t) => t.name),
      // a thread da IA é estrutural do DISPOSITIVO (ver comentário no reload),
      // então a árvore sempre tem esse nó — o contrato é sobre o CONTEÚDO da conta
      domThreads: [...document.querySelectorAll('.tnode:not(.ai-thread-node) .label')].map((e) => e.textContent),
      leakedAiKey: Store.data.ui.aiKey || null,
      leakedDaily: Store.data.ui.dailyRoutine || null,
      theme: Store.data.ui.theme || null,
      meMail: document.getElementById('me-mail').textContent,
    };
  });

  expect(result.user).toBe('novo@example.com');
  expect(result.threads).toEqual([]);
  expect(result.domThreads).toEqual([]);
  expect(result.leakedAiKey).toBeNull();
  expect(result.leakedDaily).toBeNull();
  // preferência de DISPOSITIVO (tema) continua — não é dado de conta
  expect(result.theme).toBe('ocean');
  expect(result.meMail).toBe('novo@example.com');

  // e a troca persiste: após reload a conta nova segue vazia
  await page.reload();
  await page.waitForTimeout(1500);
  // A thread da IA é estrutural do DISPOSITIVO, não da conta: ela existe
  // em qualquer conta e por isso `ensureAiThread` a recoloca no boot —
  // `Store.threadList()` é a lista EM MEMÓRIA, que inclui essa thread. O
  // que o contrato de isolamento verifica é o CONTEÚDO DA CONTA, então
  // medimos o bucket: `data.threads` filtrado é exatamente o que `save()`
  // grava no bucket (ver o filtro em save()).
  //
  // `threadList()` cru daria 1 (a thread da IA) em qualquer conta — medido
  // assim antes deste ajuste.
  const afterReload = await page.evaluate(() => {
    const th = window.NoteThread.Store.data.threads;
    return Object.keys(th).filter((id) => id !== 'ai-assistant').map((id) => th[id].name);
  });
  expect(afterReload).toEqual([]);
});

test('voltar para a conta antiga restaura conversas, chave da IA e rotina', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  const back = await page.evaluate(() => {
    const { Store } = window.NoteThread;
    Store.setUser({ name: 'novo', mail: 'novo@example.com', provider: 'supabase', id: 'uid-novo' });
    Store.setUser({ name: 'Tester', mail: 'velho@example.com', provider: 'email' });
    return {
      user: Store.user.mail,
      threads: Store.threadList().map((t) => t.name),
      aiKey: Store.data.ui.aiKey || null,
      dailyItem: (Store.data.ui.dailyRoutine && Store.data.ui.dailyRoutine.items[0].text) || null,
    };
  });

  expect(back.user).toBe('velho@example.com');
  expect(back.threads).toEqual(['Conversa Antiga']);
  expect(back.aiKey).toBe('CHAVE-SECRETA-DA-CONTA-VELHA');
  expect(back.dailyItem).toBe('rotina velha');
});

test('conexões criadas em uma conta somem ao trocar para outra', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  const result = await page.evaluate(() => {
    const { Store, UI } = window.NoteThread;
    Store.upsertThread({ id: 't2', name: 'Pessoal', folderId: null, created: Date.now() });
    Store.setUser({ name: 'novo', mail: 'novo@example.com', provider: 'supabase', id: 'uid-novo' });
    UI.renderAuthOrApp();
    return Store.threadList().map((t) => t.name);
  });
  expect(result).toEqual([]);
});

// ---------------------------------------------------------------------
// Fila offline: o vetor que fazia as contas compartilharem notas.
// A fila mora no dispositivo e é global; uma nota enfileirada offline pela
// conta A era enviada quando a conta B ficava online — gravada com o
// user_id da B (o RLS aceitava, então a nota vazava de verdade).
//
// Desde a Fase 1 da criptografia o item da fila vai CIFRADO com a DEK da
// conta dona: sem a chave dela em memória o item nem é decifrado.
// ---------------------------------------------------------------------
const PASS = 'senha-de-teste';

async function mockSupabase(page, sent) {
  await page.route('**/rest/v1/notes**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' || req.method() === 'PATCH') sent.push(req.postData() || '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  for (const t of ['threads', 'folders']) {
    await page.route(`**/rest/v1/${t}**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  }
  await page.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

// Cria a chave da conta e deixa a DEK em memória, como o CryptoGate faz no
// login. `fakeSupa` evita rede: o bundle fica no cache local do keyring.
async function createKeyFor(page, uid) {
  await page.evaluate(async ({ uid, pass }) => {
    const { createAndSaveKeys } = await import('./js/keyring.js');
    const fakeSupa = { from: () => ({ insert: async () => ({ error: null }) }) };
    await createAndSaveKeys(fakeSupa, uid, pass, { iterations: 1000 });
  }, { uid, pass: PASS });
}

async function unlockFor(page, uid) {
  await page.evaluate(async ({ uid, pass }) => {
    const { unlockKeys } = await import('./js/keyring.js');
    const bundle = JSON.parse(localStorage.getItem('notethread.keys::u::' + uid));
    const supa = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: bundle, error: null }) }) }) }),
    };
    await unlockKeys(supa, uid, pass);
  }, { uid, pass: PASS });
}

async function useQueueCipher(page, uid) {
  await page.evaluate(async (uid) => {
    const { getDek } = await import('./js/keyring.js');
    const { makeQueueCipher } = await import('./js/crypto-session.js');
    const { OfflineQueue } = await import('./js/offline-queue.js');
    OfflineQueue.setCipher(makeQueueCipher(uid, getDek()));
  }, uid);
}

// Itens CRUS do IndexedDB (é o que ficaria legível num disco roubado).
async function dumpQueue(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('notethread-offline', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('syncQueue')) r.result.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res, rej) => {
      const tx = db.transaction('syncQueue', 'readonly');
      const q = tx.objectStore('syncQueue').getAll();
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => rej(q.error);
    });
  });
}

test('nota enfileirada offline pela conta A não é enviada pela conta B', async ({ page }) => {
  const sent = [];
  await mockSupabase(page, sent);
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  // conta A fica offline e enfileira uma nota
  await createKeyFor(page, 'uid-A');
  await page.evaluate(async () => {
    const { Store } = window.NoteThread;
    const { getDek } = await import('./js/keyring.js');
    const { makeQueueCipher } = await import('./js/crypto-session.js');
    const { OfflineQueue } = await import('./js/offline-queue.js');
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Store.upsertThread({ id: 'tA', name: 'Thread do A', folderId: null, created: Date.now() });
    OfflineQueue.setCipher(makeQueueCipher('uid-A', getDek()));
    await OfflineQueue.add('note:upsert', { clientId: 'NOTA-A', threadId: 'tA', text: 'segredo do A', ts: Date.now(), sortOrder: 0 }, 'uid-A');
  });

  // o item está no disco CIFRADO (nenhum texto da nota legível)
  const raw = JSON.stringify(await dumpQueue(page));
  expect(raw).not.toContain('segredo do A');
  expect(raw).toContain('"enc"');

  // conta B entra e "fica online": a fila é drenada
  await createKeyFor(page, 'uid-B');
  sent.length = 0;
  const queueAfterB = await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    const { getDek } = await import('./js/keyring.js');
    const { makeQueueCipher } = await import('./js/crypto-session.js');
    const { OfflineQueue } = await import('./js/offline-queue.js');
    Store.setUser({ name: 'B', mail: 'b@example.com', provider: 'supabase', id: 'uid-B' });
    OfflineQueue.setCipher(makeQueueCipher('uid-B', getDek()));
    Sync._uidCache = 'uid-B';
    await Sync.flushQueue();
    return (await OfflineQueue.getAll()).map((i) => i.payload.clientId);
  });
  expect(sent).toEqual([]);
  // a chave da B não abre o item da A
  expect(queueAfterB).toEqual([]);
  expect((await dumpQueue(page)).length).toBe(1);

  // quando a conta A volta, a nota sobe com o user_id dela — e cifrada
  sent.length = 0;
  await unlockFor(page, 'uid-A');
  await useQueueCipher(page, 'uid-A');
  await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Sync._uidCache = 'uid-A';
    await Sync.flushQueue();
  });
  expect(sent.length).toBe(1);
  expect(JSON.parse(sent[0]).user_id).toBe('uid-A');
  expect(sent[0]).not.toContain('segredo do A');
  expect(JSON.parse(sent[0]).text).toBe(null);
  expect(JSON.parse(sent[0]).text_enc.ct).toBeTruthy();
});

test('item legado da fila (sem owner) não vaza para a outra conta', async ({ page }) => {
  const sent = [];
  await mockSupabase(page, sent);
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  // item sem `owner` = enfileirado por uma versão antiga do app (texto claro
  // no IndexedDB). Ele continua drenável — e nunca deve sair pela conta errada.
  await page.evaluate(async () => {
    const { Store } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Store.upsertThread({ id: 'tA', name: 'Thread do A', folderId: null, created: Date.now() });
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('notethread-offline', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('syncQueue')) r.result.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction('syncQueue', 'readwrite');
      tx.objectStore('syncQueue').add({ type: 'note:upsert', ts: Date.now(), tries: 0, nextRetry: 0, owner: null, payload: { clientId: 'LEGADO-A', threadId: 'tA', text: 'segredo do A', ts: Date.now(), sortOrder: 0 } });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  });

  sent.length = 0;
  const remaining = await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    const { OfflineQueue } = await import('./js/offline-queue.js');
    Store.setUser({ name: 'B', mail: 'b@example.com', provider: 'supabase', id: 'uid-B' });
    Sync._uidCache = 'uid-B';
    await Sync.flushQueue();
    return (await OfflineQueue.getAll()).map((i) => i.payload.clientId);
  });
  expect(sent).toEqual([]);
  expect(remaining).toEqual(['LEGADO-A']);

  // e volta a subir quando a dona volta (agora cifrado com a DEK dela)
  sent.length = 0;
  await createKeyFor(page, 'uid-A');
  await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Sync._uidCache = 'uid-A';
    await Sync.flushQueue();
  });
  expect(sent.length).toBe(1);
  expect(JSON.parse(sent[0]).user_id).toBe('uid-A');
  expect(sent[0]).not.toContain('segredo do A');
});
