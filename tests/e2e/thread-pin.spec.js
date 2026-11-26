const { test, expect } = require('@playwright/test');

// PIN por conversa: protege a abertura de UMA conversa, guardado no aparelho.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: {
    t1: { id: 't1', name: 'Diário', folderId: null, created: Date.now() - 90000, updatedAt: Date.now() },
    t2: { id: 't2', name: 'Trabalho', folderId: null, created: Date.now() - 80000, updatedAt: Date.now() },
  },
  notes: {
    t1: [{ clientId: 'a1', threadId: 't1', user: 'me', text: 'segredo', ts: Date.now() - 5000, images: [], reactions: {} }],
    t2: [{ clientId: 'b1', threadId: 't2', user: 'me', text: 'publico', ts: Date.now() - 4000, images: [], reactions: {} }],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false } },
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.setTimeout(60000);

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForFunction(() => !!window.NoteThread && document.querySelectorAll('.tnode').length >= 2, null, { timeout: 45000 });
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.classList.contains('hidden')) window.NoteThread.UI.closeModal();
  });
  // a árvore entra com animação (`tree-new`): espera assentar antes do clique
  await page.waitForTimeout(700);
  // caminho real: clicar na conversa no explorador abre e acende o ⋮ do banner
  await page.locator('.tnode[data-tid="t2"]').click({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('#messages .bubble').length >= 1, null, { timeout: 20000 });
});

test('protege a conversa e passa a pedir o PIN ao abrir', async ({ page }) => {
  await page.locator('.tnode[data-tid="t1"]').click({ force: true });
  await page.waitForFunction(() => window.NoteThread.UI.activeThread === 't1', null, { timeout: 20000 });

  // menu ⋮ → Proteger com PIN
  await page.locator('#btn-thread-menu').click({ force: true });
  await page.locator('[data-act="pin"]').click();
  await page.waitForSelector('#tpin-input', { timeout: 10000 });
  await page.fill('#tpin-input', '1234');
  await page.fill('#tpin-input2', '1234');
  await page.locator('#modal-ok').click();
  await page.waitForTimeout(400);

  const guardado = await page.evaluate(() => {
    const p = window.NoteThread.Store.data.ui.threadPins || {};
    return { tem: !!p.t1, naoVaza: JSON.stringify(p.t1 || '').indexOf('1234') === -1 };
  });
  expect(guardado.tem, 'conversa marcada como protegida').toBe(true);
  expect(guardado.naoVaza, 'o PIN não é guardado em texto claro').toBe(true);

  // a trava vale por sessão: recarregar simula abrir o app de novo
  await page.reload();
  await page.waitForFunction(() => !!window.NoteThread && document.querySelectorAll('.tnode').length >= 1, null, { timeout: 45000 });
  await page.waitForTimeout(700);
  await page.locator('.tnode[data-tid="t1"]').click({ force: true });
  await page.waitForSelector('#tpin-ask', { timeout: 10000 });

  // PIN errado não abre
  await page.fill('#tpin-ask', '9999');
  await page.locator('#modal-ok').click();
  await page.waitForTimeout(300);
  const aberta = await page.evaluate(() => window.NoteThread.UI.activeThread);
  expect(aberta, 'PIN errado não abre a conversa').not.toBe('t1');

  // PIN certo abre
  await page.fill('#tpin-ask', '1234');
  await page.locator('#modal-ok').click();
  await page.waitForFunction(() => window.NoteThread.UI.activeThread === 't1', null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#messages .bubble').length >= 1, null, { timeout: 15000 });
});
