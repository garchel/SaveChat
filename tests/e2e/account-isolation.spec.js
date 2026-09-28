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
    expanded: {},
    sounds: { enabled: false },
    theme: 'ocean',
    aiKey: 'CHAVE-SECRETA-DA-CONTA-VELHA',
    dailyRoutine: { items: [{ id: 'r1', text: 'rotina velha' }], log: {} },
  },
};

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
    UI.renderAuthOrApp();
    return {
      user: Store.user.mail,
      threads: Store.threadList().map((t) => t.name),
      domThreads: [...document.querySelectorAll('.tnode .label')].map((e) => e.textContent),
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
  const afterReload = await page.evaluate(() => window.NoteThread.Store.threadList().map((t) => t.name));
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
// A fila mora no dispositivo e era global; uma nota enfileirada offline
// pela conta A era enviada quando a conta B ficava online — gravada com o
// user_id da B (o RLS aceitava, então a nota vazava de verdade).
// ---------------------------------------------------------------------
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

test('nota enfileirada offline pela conta A não é enviada pela conta B', async ({ page }) => {
  const sent = [];
  await mockSupabase(page, sent);
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  // conta A fica offline e enfileira uma nota
  await page.evaluate(async () => {
    const { Store } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Store.upsertThread({ id: 'tA', name: 'Thread do A', folderId: null, created: Date.now() });
    const { OfflineQueue } = await import('./js/offline-queue.js');
    await OfflineQueue.add('note:upsert', { clientId: 'NOTA-A', threadId: 'tA', text: 'segredo do A', ts: Date.now(), sortOrder: 0 }, 'uid-A');
  });

  // conta B entra e "fica online": a fila é drenada
  sent.length = 0;
  const queueAfterB = await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    Store.setUser({ name: 'B', mail: 'b@example.com', provider: 'supabase', id: 'uid-B' });
    Sync._uidCache = 'uid-B';
    await Sync.flushQueue();
    const { OfflineQueue } = await import('./js/offline-queue.js');
    return (await OfflineQueue.getAll()).map((i) => i.payload.clientId);
  });
  expect(sent).toEqual([]);
  // a nota continua na fila, esperando a conta dona
  expect(queueAfterB).toEqual(['NOTA-A']);

  // quando a conta A volta, a nota sobe com o user_id dela
  sent.length = 0;
  await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Sync._uidCache = 'uid-A';
    await Sync.flushQueue();
  });
  expect(sent.length).toBe(1);
  expect(JSON.parse(sent[0]).user_id).toBe('uid-A');
});

test('item legado da fila (sem owner) não vaza para a outra conta', async ({ page }) => {
  const sent = [];
  await mockSupabase(page, sent);
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();

  // item sem `owner` = enfileirado por uma versão antiga do app
  await page.evaluate(async () => {
    const { Store } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Store.upsertThread({ id: 'tA', name: 'Thread do A', folderId: null, created: Date.now() });
    const { OfflineQueue } = await import('./js/offline-queue.js');
    await OfflineQueue.add('note:upsert', { clientId: 'LEGADO-A', threadId: 'tA', text: 'segredo do A', ts: Date.now(), sortOrder: 0 });
  });

  sent.length = 0;
  const remaining = await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    Store.setUser({ name: 'B', mail: 'b@example.com', provider: 'supabase', id: 'uid-B' });
    Sync._uidCache = 'uid-B';
    await Sync.flushQueue();
    const { OfflineQueue } = await import('./js/offline-queue.js');
    return (await OfflineQueue.getAll()).map((i) => i.payload.clientId);
  });
  expect(sent).toEqual([]);
  expect(remaining).toEqual(['LEGADO-A']);

  // e volta a subir quando a dona volta
  sent.length = 0;
  await page.evaluate(async () => {
    const { Store, Sync } = window.NoteThread;
    Store.setUser({ name: 'A', mail: 'a@example.com', provider: 'supabase', id: 'uid-A' });
    Sync._uidCache = 'uid-A';
    await Sync.flushQueue();
  });
  expect(sent.length).toBe(1);
  expect(JSON.parse(sent[0]).user_id).toBe('uid-A');
});
