const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: {},
  ui: { mascot: { nameSet: true }, expanded: {}, sounds: { enabled: false } },
};

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

const showChat = (page) => page.evaluate(() =>
  document.getElementById('app').classList.contains('show-chat'));

test('sem conversa aberta, o celular mostra cadernos em vez do placeholder', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();
  expect(await showChat(page)).toBe(false);

  // excluir a conversa aberta devolve o usuário aos cadernos
  await page.locator('.tnode[data-tid="t1"]').click();
  expect(await showChat(page)).toBe(true);
  await page.evaluate(() => window.NoteThread.UI.confirmDeleteThread('t1'));
  await expect(page.locator('#modal')).toBeVisible();
  await page.click('#modal-ok');
  await expect.poll(() => showChat(page)).toBe(false);

  // sair da página da IA sem conversa também cai nos cadernos
  await page.locator('.ai-thread-node').click();
  await expect(page.locator('#ai-page')).toBeVisible();
  expect(await showChat(page)).toBe(true);
  await page.evaluate(() => window.NoteThread.UI.goBack());
  await expect.poll(() => showChat(page)).toBe(false);
  await expect(page.locator('#ai-page')).toBeHidden();
});
