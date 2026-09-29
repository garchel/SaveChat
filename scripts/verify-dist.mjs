// Validação do APP DE PRODUÇÃO (dist/), que o e2e nunca cobria — a suíte roda
// contra public/ com o servidor estático. O dist é o que a Vercel serve, e é
// onde o flattening de CSS (@import) e de HTML (partials) acontece de fato.
//
// Percorre o app inteiro no build: login, conversa, envio, IA, diária, menu,
// tema escuro — e falha em qualquer erro de console, 404 ou elemento ausente.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3002';
const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: {
    t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 },
    t2: { id: 't2', name: 'Trabalho', folderId: null, created: Date.now() - 2000 },
  },
  folders: {},
  notes: { t1: [{ id: 'n1', threadId: 't1', user: 'me', text: 'comprar leite', ts: Date.now() - 50000, clientId: 'c1' }] },
  ui: { expanded: {}, sounds: { enabled: false } },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);

const page = await ctx.newPage();
const problemas = [];
page.on('pageerror', (e) => problemas.push('JS: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problemas.push('console: ' + m.text().slice(0, 120)); });
page.on('response', (r) => { if (r.status() >= 400) problemas.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => problemas.push(`REQ ${r.url()} ${r.failure()?.errorText}`));

const check = async (nome, fn) => {
  try { const r = await fn(); console.log(`  ${r === false ? 'FALHOU' : 'ok    '}  ${nome}`); if (r === false) problemas.push('check falhou: ' + nome); }
  catch (e) { console.log(`  FALHOU  ${nome} — ${e.message.split('\n')[0]}`); problemas.push(nome + ': ' + e.message.split('\n')[0]); }
};

console.log('== boot ==');
await page.goto(BASE + '/?nosw=1');
await page.waitForTimeout(2500);

await check('app sobe sem erro de JS', () => page.evaluate(() => typeof window.NoteThread === 'object'));
await check('CSS aplicado (fundo do body nao e transparente/white puro)', async () => {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const sheets = await page.evaluate(() => document.styleSheets.length);
  console.log(`        body bg=${bg} styleSheets=${sheets}`);
  return sheets >= 1;
});
await check('variaveis de tema presentes (tema aplicado)', () => page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() !== ''));

console.log('== elementos do boot (do HTML achatado) ==');
for (const id of ['auth-screen', 'sidebar', 'tree', 'composer-input', 'btn-send', 'ai-page', 'daily-page', 'ctx-menu', 'msg-popover', 'modal', 'profile-popover']) {
  await check('#' + id, async () => (await page.locator('#' + id).count()) === 1);
}

console.log('== sem requests de partial/@import no dist ==');
await check('nenhum fetch de partials/*.txt', async () => {
  const pedidos = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/partials/')));
  if (pedidos.length) { console.log('        ' + pedidos.join(', ')); return false; }
  return true;
});
await check('nenhum request de styles/*.css separado', async () => {
  const pedidos = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/styles\/[^/]+\.css/.test(n)));
  if (pedidos.length) { console.log('        ' + pedidos.join(', ')); return false; }
  return true;
});

console.log('== navegacao ==');
await check('abrir conversa', async () => { await page.locator('.tnode').first().click(); await page.waitForTimeout(1200); return (await page.locator('.bubble').count()) > 0; });
await check('digitar no composer', async () => { await page.locator('#composer-input').fill('teste de produção'); await page.waitForTimeout(400); return true; });
await check('botao de enviar presente', async () => (await page.locator('#btn-send').count()) === 1);
await check('pagina IA', async () => { await page.evaluate(() => document.querySelector('.page-switch[data-page="ai"]').click()); await page.waitForTimeout(700); return (await page.locator('#ai-prompt').isVisible()); });
await check('campo da IA: botao unico a direita', async () => {
  const mic = await page.locator('.ai-input-row #ai-send').count();
  const esquerda = await page.locator('.ai-input-row .cozy-attach').count();
  return mic === 1 && esquerda === 0;
});
await check('pagina Diaria', async () => { await page.evaluate(() => document.querySelector('.page-switch[data-page="daily"]').click()); await page.waitForTimeout(700); return (await page.locator('#daily-page').isVisible()); });
await check('voltar para Cadernos', async () => { await page.evaluate(() => document.querySelector('.page-switch[data-page="notes"]').click()); await page.waitForTimeout(700); return true; });

console.log('== tema escuro (o CSS flattenado precisa trocar as vars) ==');
await check('aplicar tema escuro muda o fundo', async () => {
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(500);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log('        body bg (dark) = ' + bg);
  return bg !== 'rgb(255, 255, 255)';
});

console.log('== mobile ==');
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(600);
await check('sidebar some no mobile', async () => {
  const off = await page.evaluate(() => {
    const el = document.querySelector('#sidebar');
    return el.getBoundingClientRect().right <= 1;
  });
  return off;
});

console.log('\n== resultado ==');
if (problemas.length) {
  console.log('PROBLEMAS (' + problemas.length + '):');
  for (const p of [...new Set(problemas)]) console.log('  - ' + p);
} else {
  console.log('nenhum erro: dist/ funciona igual a public/');
}
await browser.close();
process.exit(problemas.length ? 1 : 0);
