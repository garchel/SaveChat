// Testes e2e das features recentes: export MD, import backup, "Apagar tudo",
// densidade adaptativa, busca sem resultados, seção Sobre.
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: {
    t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 },
  },
  folders: {},
  notes: {
    t1: [
      { id: 'n1', threadId: 't1', user: 'me', text: '- [x] leite\n- [ ] pão', ts: Date.now() - 50000, clientId: 'c1', tags: ['mercado'] },
    ],
  },
  ui: { expanded: {}, sounds: { enabled: false } },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

async function openApp(page) {
  await page.goto('/');
  await page.waitForTimeout(1200);
  await expect(page.locator('#app')).toBeVisible();
}

test('busca sem resultados mostra dica contextual', async ({ page }) => {
  await openApp(page);
  // v1.12.0: a busca vive num painel recolhido — abre pela lupa primeiro
  await page.click('#btn-explorer-search');
  await page.fill('#search-input', 'in:naoexiste nada');
  await page.locator('#search-results').waitFor({ state: 'visible' });
  await expect(page.locator('.sr-empty-title')).toContainText('Nenhum resultado');
  // dica contextual de conversa
  await expect(page.locator('.sr-empty-hint')).toContainText('conversa');
});

test('seção Sobre exibe versão e links legais funcionais', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => document.getElementById('profile-config')?.click());
  await page.waitForTimeout(300);
  const about = page.locator('.settings-about');
  await expect(about.locator('.about-version')).toContainText('SaveChat');
  const privacyLink = about.locator('.about-links a', { hasText: 'Privacidade' });
  await expect(privacyLink).toHaveAttribute('href', 'privacy.html');
  await expect(about.locator('.about-links a', { hasText: 'Termos' })).toHaveAttribute('href', 'terms.html');
});

test('import de backup JSON restaura conversas', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.NoteThread.Store.data.threads = {};
    window.NoteThread.Store.data.notes = {};
    window.NoteThread.Store.save();
  });
  const imported = await page.evaluate(async () => {
    const backup = JSON.stringify({
      threads: { b1: { id: 'b1', name: 'Restaurada', folderId: null, created: Date.now() } },
      folders: {},
      notes: { b1: [{ id: 'bn1', threadId: 'b1', user: 'me', text: 'nota do backup', ts: Date.now(), clientId: 'x1' }] },
    });
    const file = new File([backup], 'backup.json', { type: 'application/json' });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.getElementById('import-file');
    input.click = () => {}; // não abrir picker nativo no e2e
    document.querySelector('[data-set="import"]').click(); // registra handler
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 400));
    return Object.keys(window.NoteThread.Store.data.threads);
  });
  expect(imported).toContain('b1');
});

test('densidade compacta aplica padding menor', async ({ page }) => {
  await openApp(page);
  // cria thread + nota para medir a bolha
  await page.evaluate(() => {
    const NT = window.NoteThread;
    NT.Store.data.threads['dx'] = { id: 'dx', name: 'Density', folderId: null, created: Date.now() };
    NT.Store.data.notes['dx'] = [
      { id: 'dn1', threadId: 'dx', user: 'me', text: 'medir padding', ts: Date.now(), clientId: 'dc1' },
    ];
    NT.Store.save();
    NT.UI.openThread('dx');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.documentElement.dataset.density = 'compact'; });
  await page.waitForTimeout(200);
  const padCompact = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.bubble')).paddingTop));
  await page.evaluate(() => { document.documentElement.dataset.density = 'comfortable'; });
  await page.waitForTimeout(200);
  const padComfort = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.bubble')).paddingTop));
  expect(padCompact).toBeLessThan(padComfort);
});
