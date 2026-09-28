// E2E: workspace — páginas via seletor da sidebar (Cadernos · IA · Diária) (v1.12.0)
// Cobre: troca de páginas (aria-selected), Diária persistente após reload,
// IA sem chave (toast, sem chamada à API), swipe programático e o toggle
// lupa ↔ busca com fade out no NOVO (e a lupa parada no lugar).
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

test('seletor de páginas: IA, Diária e volta para Cadernos', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const switcher = page.locator('.page-switcher');
  await expect(switcher).toBeVisible();
  // abaixo da marca do explorador e acima da linha do NOVO (ordem no DOM)
  const brandY = await page.locator('.explorer-brand').evaluate((el) => el.getBoundingClientRect().bottom);
  const switcherY = await switcher.evaluate((el) => el.getBoundingClientRect().top);
  const rowY = await page.locator('.explorer-row').evaluate((el) => el.getBoundingClientRect().top);
  expect(switcherY).toBeGreaterThanOrEqual(brandY - 1);
  expect(rowY).toBeGreaterThanOrEqual(switcherY);

  await page.click('.page-switch[data-page="ai"]');
  await expect(page.locator('#ai-page')).toBeVisible();
  await expect(page.locator('.page-switch[data-page="ai"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#messages')).toBeHidden();
  // as abas antigas dentro da conversa não existem mais
  await expect(page.locator('#workspace-tabs')).toHaveCount(0);

  await page.click('.page-switch[data-page="daily"]');
  await expect(page.locator('#daily-page')).toBeVisible();
  await page.fill('#daily-input', 'exercício 30 min');
  await page.press('#daily-input', 'Enter');
  await expect(page.locator('.daily-item')).toHaveCount(1);
  await page.click('.daily-item .daily-check');
  await expect(page.locator('.daily-item.done')).toHaveCount(1);
  await expect(page.locator('#daily-progress-bar')).toHaveCSS('width', /[1-9]/);

  await page.click('.page-switch[data-page="notes"]');
  await expect(page.locator('#messages')).toBeVisible();
  await expect(page.locator('#daily-page')).toBeHidden();
  await expect(page.locator('.page-switch[data-page="notes"]')).toHaveAttribute('aria-selected', 'true');
});

test('lupa: NOVO some em fade, painel abre e a lupa não se move', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const lupa = page.locator('#btn-explorer-search');
  const novo = page.locator('#btn-new-thread');
  const panel = page.locator('#explorer-search-panel');
  const boxBefore = await lupa.boundingBox();

  await lupa.click();
  await expect(page.locator('.explorer-row.searching')).toHaveCount(1);
  await expect(panel).toHaveClass(/open/);
  await expect(novo).toHaveCSS('opacity', '0');
  await expect(novo).toBeHidden(); // visibility:hidden após o fade
  // lupa no mesmo lugar (x e y inalterados pelo toggle)
  const boxOpen = await lupa.boundingBox();
  expect(Math.abs(boxOpen.x - boxBefore.x)).toBeLessThan(1);
  expect(Math.abs(boxOpen.y - boxBefore.y)).toBeLessThan(1);
  // foco vai para o campo de busca
  await expect(page.locator('#search-input')).toBeFocused();

  await lupa.click();
  await expect(panel).not.toHaveClass(/open/);
  await expect(novo).toBeVisible();
  await expect(novo).toHaveCSS('opacity', '1');
});

test('diária: rotina persiste e o check do dia não vaza para "amanhã"', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="daily"]');
  await page.fill('#daily-input', 'ler 10 páginas');
  await page.press('#daily-input', 'Enter');
  await page.click('.daily-item .daily-check');
  await expect(page.locator('.daily-item.done')).toHaveCount(1);
  await page.reload();
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="daily"]');
  // item sobrevive ao reload (rotina fixa) e continua marcado (mesmo dia)
  await expect(page.locator('.daily-item')).toHaveCount(1);
  await expect(page.locator('.daily-item.done')).toHaveCount(1);
  // simulando o dia seguinte (meia-noite limpa o log de checks): item fica desmarcado
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('notethread.v2'));
    d.ui.dailyRoutine.log = {};
    localStorage.setItem('notethread.v2', JSON.stringify(d));
  });
  await page.reload();
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="daily"]');
  await expect(page.locator('.daily-item')).toHaveCount(1);
  await expect(page.locator('.daily-item.done')).toHaveCount(0);
});

test('IA sem chave: pede a chave e não chama a API', async ({ page }) => {
  let geminiCalls = 0;
  page.on('request', (r) => { if (r.url().includes('generativelanguage')) geminiCalls++; });
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="ai"]');
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
  // última página: não passa
  const moved = await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  expect(moved).toBe(false);
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(-1));
  await expect(page.locator('#reminders-page')).toBeVisible();
});
