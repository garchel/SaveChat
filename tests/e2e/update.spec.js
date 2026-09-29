// E2E: fluxo de atualização controlado pelo usuário (v1.4.1)
// 1. SW novo instalado fica WAITING (não assume sozinho)
// 2. Check na abertura detecta versão nova → chip update
// 3. Clique no botão Atualizar app → SKIP_WAITING → nova versão assume + reload
const { test, expect } = require('@playwright/test');

const SEED = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [{ id: 'n1', threadId: 't1', user: 'me', text: 'leite', ts: Date.now() - 50000, clientId: 'c1' }] },
  ui: { expanded: {}, sounds: { enabled: false } },
};

test('abertura: check roda, chip mostra versão, botão Atualizar app no menu do perfil', async ({ page, context }) => {
  await context.addInitScript((s) => {
    localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, SEED);

  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.click('#profile-btn');
  await page.waitForTimeout(400);

  // chip existe e mostra estado válido após o check de abertura
  const chip = page.locator('#update-chip');
  await expect(chip).not.toHaveClass(/hidden/);
  const state1 = await chip.getAttribute('data-state');
  expect(['current', 'update', 'offline', 'error', 'checking']).toContain(state1);

  // botões do popover: Configurações, Como usar, Instalar app (oculto até o
  // browser oferecer o prompt), Atualizar app e Sair
  const btns = page.locator('#profile-popover button');
  await expect(btns).toHaveCount(5);
  await expect(page.locator('#profile-help')).toBeVisible();
  await expect(page.locator('#profile-update')).toBeVisible();
  await expect(page.locator('#profile-install')).toBeHidden();

  // estado do SW após abrir
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      active: reg && reg.active && reg.active.state,
      waiting: reg && !!(reg.waiting),
      controller: !!navigator.serviceWorker.controller,
    };
  });
  console.log('SW após abrir:', JSON.stringify(sw));

  // changelog servido == versão local → chip current com a versão
  const localV = await page.evaluate(() => window.APP_VERSION);
  const remoteV = await page.evaluate(async () => {
    const r = await fetch('CHANGELOG.md?_=' + Date.now(), { cache: 'no-store' });
    const t = await r.text();
    const m = t.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    return m && m[1];
  });
  console.log('local:', localV, 'changelog remoto:', remoteV);
  expect(remoteV).toBe(localV); // regra do repo: CHANGELOG sempre abre na versão atual
  await expect(chip).toHaveAttribute('data-state', 'current');
  await expect(chip).toContainText(localV);
});

test('update disponível: chip entra em modo update, dot no avatar, clique dispara instalação', async ({ page, context }) => {
  await context.addInitScript((s) => {
    localStorage.setItem('notethread.v2', JSON.stringify(s));
    // fetch do changelog responde versão futura (a UI inteira flui a partir daqui)
    window.__testChangelogVersion = '9.9.9';
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('CHANGELOG.md')) {
        return Promise.resolve(new Response('# Changelog\n\n## [9.9.9] — 2099-01-01\n- versão futura de teste\n', {
          status: 200, headers: { 'Content-Type': 'text/markdown' },
        }));
      }
      return origFetch.apply(this, arguments);
    };
    // captura o estado do botão no instante do reload (a classe 'updating'
    // é aplicada e a página recarrega em seguida)
    window.addEventListener('beforeunload', () => {
      try {
        const b = document.getElementById('profile-update');
        sessionStorage.setItem('__updCls', b ? b.className : 'null');
      } catch {}
    });
  }, SEED);

  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.click('#profile-btn');
  await page.waitForTimeout(400);

  const chip = page.locator('#update-chip');
  await expect(chip).toHaveAttribute('data-state', 'update');
  await expect(chip).toContainText('9.9.9');
  await expect(page.locator('#me-avatar')).toHaveClass(/has-update/);
  await expect(page.locator('#profile-update')).toHaveAttribute('title', /9\.9\.9/);

  // clique no estado update → botão entra em modo instalação (disabled + ícone girando)
  // e a página recarrega (fallback sem SW waiting) — capturamos a classe no beforeunload
  await page.click('#profile-update');
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => sessionStorage.getItem('__updCls') || '');
  expect(cls).toContain('updating');
});

test('Como usar: botão no menu do perfil abre o guia em nova aba', async ({ page, context }) => {
  await context.addInitScript((s) => {
    localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, SEED);

  // popup interceptado: sem ele, o window.open abriria uma aba de verdade
  await context.addInitScript(() => {
    window.__opened = [];
    const orig = window.open;
    window.open = (url, target, feats) => { window.__opened.push({ url, target, feats }); return { closed: false }; };
  });

  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('#profile-btn');
  await expect(page.locator('#profile-help')).toBeVisible();

  // fecha o popover e abre a página
  await page.click('#profile-help');
  await expect(page.locator('#profile-popover')).toBeHidden();

  const opened = await page.evaluate(() => window.__opened);
  expect(opened).toHaveLength(1);
  expect(opened[0].url).toBe('help.html');
  expect(opened[0].target).toBe('_blank');

  // e a página existe e se renderiza com conteúdo real
  const help = await page.goto('/help.html');
  expect(help.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Como usar');
  // índice lateral aponta para seções que existem
  const anchors = await page.locator('.help-toc a').evaluateAll(
    (as) => as.map((a) => a.getAttribute('href').slice(1)));
  const ids = await page.locator('main section').evaluateAll(
    (ss) => ss.map((s) => s.id));
  for (const a of anchors) expect(ids).toContain(a);
  // nenhum placeholder/texto corrompido sobreviveu
  const text = await page.locator('main').innerText();
  expect(text).not.toContain('undefined');
  expect(text).not.toContain('sendspec');
});
