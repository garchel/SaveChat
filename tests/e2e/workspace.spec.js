// E2E: workspace com abas — Conversas · IA · Lembretes · Diária (v1.10.0)
// Cobre: troca de abas (aria-selected), Diária persistente após reload,
// IA sem chave (toast, sem chamada à API) e swipe programático.
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [{ id: 'n1', threadId: 't1', user: 'me', text: 'leite', ts: Date.now() - 50000, clientId: 'c1' }] },
  ui: { expanded: {}, sounds: { enabled: false } },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    // semeia apenas na 1ª carga — o reload precisa preservar o que o teste salvou
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

test('abas do workspace: IA, Diária e volta para Conversas', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await expect(page.locator('#workspace-tabs')).toBeVisible();

  await page.click('#tab-ai');
  await expect(page.locator('#ai-page')).toBeVisible();
  await expect(page.locator('#tab-ai')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#messages')).toBeHidden();

  await page.click('#tab-daily');
  await expect(page.locator('#daily-page')).toBeVisible();
  await page.fill('#daily-editor', 'hoje foi um bom dia');
  await expect(page.locator('#daily-status')).toContainText('Salvo');

  await page.click('#tab-conversations');
  await expect(page.locator('#messages')).toBeVisible();
  await expect(page.locator('#daily-page')).toBeHidden();
});

test('diária persiste no dispositivo após reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('#tab-daily');
  await page.fill('#daily-editor', 'segunda entrada');
  await page.reload();
  await page.waitForTimeout(2000);
  await page.click('#tab-daily');
  await expect(page.locator('#daily-editor')).toHaveValue(/segunda entrada/);
});

test('IA sem chave: pede a chave e não chama a API', async ({ page }) => {
  let geminiCalls = 0;
  page.on('request', (r) => { if (r.url().includes('generativelanguage')) geminiCalls++; });
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('#tab-ai');
  await page.fill('#ai-prompt', 'me ajude a planejar o dia');
  await page.click('#ai-send');
  await expect(page.locator('.app-toast')).toContainText('chave');
  await page.waitForTimeout(800);
  expect(geminiCalls).toBe(0);
  // histórico permanece vazio (estado inicial)
  await expect(page.locator('#ai-messages .workspace-empty')).toBeVisible();
});

test('workspaceSwipe alterna páginas nos dois sentidos', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  await expect(page.locator('#ai-page')).toBeVisible();
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  await expect(page.locator('#reminders-page')).toBeVisible();
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  await expect(page.locator('#daily-page')).toBeVisible();
  // última aba: não passa
  const moved = await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  expect(moved).toBe(false);
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(-1));
  await expect(page.locator('#reminders-page')).toBeVisible();
});
