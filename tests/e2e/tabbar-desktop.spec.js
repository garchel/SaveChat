// No desktop a tabbar NÃO existe: a sidebar já está visível e a barra
// seria ruído. Este teste é o par do tabbar-mobile.spec.js.
const { test, expect } = require('@playwright/test');

const T0 = 1700000000000;
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Conversa', folderId: null, created: T0 - 80000 } },
  notes: { t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'mensagem', ts: T0 - 5000, images: [], reactions: {} }] },
  ui: { expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.use({ viewport: { width: 1280, height: 800 } });

test('no desktop, a tabbar não aparece', async ({ context, page }) => {
  await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const tb = document.querySelector('#tabbar');
    return {
      vw: window.innerWidth,
      display: tb ? getComputedStyle(tb).display : 'sem-elemento',
      temHidden: tb?.classList.contains('hidden'),
      // o seletor da sidebar continua funcionando no desktop
      switcherVisivel: (() => { const s = document.querySelector('.page-switcher')?.getBoundingClientRect();
        return s ? s.right > 0 && s.left < window.innerWidth : false; })(),
    };
  });
  console.log('DESKTOP=' + JSON.stringify(r));
  expect(r.vw).toBeGreaterThan(760);
  expect(r.display, 'tabbar escondida no desktop').toBe('none');
  expect(r.switcherVisivel, 'seletor da sidebar segue visível').toBe(true);

  // e navegar por ele ainda funciona (Diária continua na barra)
  await page.evaluate(() => document.querySelector('.page-switch[data-page="daily"]')?.click());
  await page.waitForTimeout(700);
  const naDaily = await page.evaluate(() => !document.querySelector('#daily-page')?.classList.contains('hidden'));
  expect(naDaily, 'página da Diária abre pelo seletor da sidebar').toBe(true);
});
