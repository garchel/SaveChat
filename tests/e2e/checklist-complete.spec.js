// Com "ocultar concluídos" ligado, ao marcar a última checkbox a bolha mantém
// o aviso "Lista completa!" e um botão para revelar/ocultar os itens escondidos.
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: {
    t1: [{
      id: 'n1', clientId: 'c1', threadId: 't1', user: 'me',
      text: 'Lista\n[ ] Leite\n[ ] Pão', ts: Date.now() - 50000,
    }],
  },
  ui: {
    mascot: { nameSet: true }, expanded: {}, sounds: { enabled: false },
    hideDoneChecks: true,
  },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

test('lista completa mantém o aviso e o botão de mostrar/ocultar', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.locator('.tnode', { hasText: 'Compras' }).first().click();

  const bubble = page.locator('.bubble', { hasText: 'Lista' }).first();
  await expect(bubble.locator('.md-check')).toHaveCount(2);

  await bubble.locator('.md-check', { hasText: 'Leite' }).locator('input').click();
  await expect(bubble.locator('.md-check')).toHaveCount(1);
  await bubble.locator('.md-check', { hasText: 'Pão' }).locator('input').click();

  await expect(bubble.locator('.chk-complete')).toBeVisible();
  await expect(bubble.locator('.chk-complete')).toContainText('Lista completa');
  const toggle = bubble.locator('.chk-reveal-toggle');
  await expect(toggle).toHaveText('Mostrar lista');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // O aviso antigo sumia em 3s; agora ele fica enquanto a lista está completa.
  await page.waitForTimeout(3200);
  await expect(bubble.locator('.chk-complete')).toBeVisible();
  await expect(bubble.locator('.md-check')).toHaveCount(0);

  await toggle.click();
  await expect(bubble.locator('.md-check')).toHaveCount(2);
  await expect(toggle).toHaveText('Ocultar lista');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await toggle.click();
  await expect(bubble.locator('.md-check')).toHaveCount(0);
  await expect(toggle).toHaveText('Mostrar lista');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
