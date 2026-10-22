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
    aiKey: 'chave-teste',
  },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

test('a IA propõe criar/editar/marcar, espera o Confirmar e executa sem 2ª chamada', async ({ page }) => {
  let aiCalls = 0;
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    aiCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [
          { functionCall: { name: 'criar_nota', args: { conversa: 'Compras', texto: 'Churrasco: carvão' } } },
          { functionCall: { name: 'editar_nota', args: { conversa: 'Compras', nota_id: 'c1', novo_texto: 'Lista\n[ ] Leite\n[ ] Pão\n[ ] Carvão' } } },
          { functionCall: { name: 'marcar_checkbox', args: { conversa: 'Compras', nota_id: 'c1', item: 'Leite', marcado: true } } },
        ] } }],
      }),
    });
  });

  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.click('.ai-thread-node');
  await expect(page.locator('#ai-page')).toBeVisible();
  await page.fill('#ai-prompt', 'crie a nota do churrasco, edite a lista e marque o leite');
  await page.click('#ai-send');

  await expect(page.locator('.ai-message-group')).toBeVisible();
  await expect(page.locator('.ai-message-group .ai-message-body')).toContainText('Você confirma que quer');
  await expect(page.locator('.ai-confirm-btn.cancel')).toBeVisible();
  await expect(page.locator('.ai-confirm-btn.confirm')).toBeVisible();

  // A pergunta sozinha não pode ter executado nada.
  const before = await page.evaluate(() => window.NoteThread.Store.notesFor('t1').map((n) => n.text).join('\n'));
  expect(before).not.toContain('Carvão');
  expect(before).not.toContain('[x] Leite');

  await page.click('.ai-confirm-btn.confirm');
  await expect(page.locator('.ai-confirm-btn.confirm')).toHaveCount(0);
  await expect(page.locator('.ai-action-chip')).toHaveCount(3);
  await page.waitForTimeout(300);
  expect(aiCalls).toBe(1);

  const after = await page.evaluate(() => window.NoteThread.Store.notesFor('t1').map((n) => n.text).join('\n'));
  expect(after).toContain('Churrasco: carvão');
  expect(after).toContain('[x] Leite');
});
