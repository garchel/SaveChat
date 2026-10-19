// Navegação de páginas depois da remoção da tabbar inferior.
//
// A tabbar (Cadernos | Tarefas | Diária no rodapé, acima do composer) foi
// removida: no mobile ela ocupava espaço permanente sobre o input. A
// navegação entre as três páginas passa a ser o `.page-switcher` da sidebar
// (desktop e explorer) e o arrasto horizontal no mobile.
//
// A tabbar existia porque o `.page-switcher` da sidebar fica fora da tela no
// mobile com uma conversa aberta (translateX(-100%)), o que custava 2 toques.
// O arrasto horizontal passou a cobrir esse caminho — é o que o
// workspace-swipe.spec.js exercita com eventos de touch de verdade.
//
// Este spec guarda duas coisas: que a barra não volta, e que o seletor da
// sidebar continua sendo a fonte única no desktop.
const { test, expect } = require('@playwright/test');

const T0 = 1700000000000;
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Conversa', folderId: null, created: T0 - 80000 } },
  notes: { t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'mensagem', ts: T0 - 5000, images: [], reactions: {} }] },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

test('no desktop, a sidebar é a navegação de páginas e não há barra no rodapé', async ({ context, page }) => {
  await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const s = document.querySelector('.page-switcher')?.getBoundingClientRect();
    return {
      vw: window.innerWidth,
      tabbarExiste: !!document.getElementById('tabbar'),
      botoesTabbar: document.querySelectorAll('.tabbar-btn').length,
      switcherVisivel: s ? s.right > 0 && s.left < window.innerWidth : false,
      abas: Array.from(document.querySelectorAll('.page-switch')).map((b) => b.dataset.page),
    };
  });
  expect(r.vw).toBeGreaterThan(760);
  expect(r.tabbarExiste, 'a barra do rodapé não deve voltar').toBe(false);
  expect(r.botoesTabbar).toBe(0);
  expect(r.switcherVisivel, 'seletor da sidebar segue visível').toBe(true);
  expect(r.abas, 'as três páginas continuam no seletor').toEqual(['notes', 'tasks', 'daily']);

  // e navegar por ele funciona
  await page.evaluate(() => document.querySelector('.page-switch[data-page="daily"]')?.click());
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(() => !document.querySelector('#daily-page')?.classList.contains('hidden')),
    'página da Diária abre pelo seletor da sidebar',
  ).toBe(true);
});

test.describe('mobile', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('não há barra no rodapé e o composer não fica cortado', async ({ context, page }) => {
    await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
    await page.waitForTimeout(800);

    const r = await page.evaluate(() => {
      const c = document.querySelector('.cozy-composer') || document.querySelector('.composer-bar');
      const cr = c.getBoundingClientRect();
      return {
        tabbarExiste: !!document.getElementById('tabbar'),
        composerBottom: Math.round(cr.bottom),
        composerVisivel: cr.top < window.innerHeight && cr.bottom > 0,
        vh: window.innerHeight,
      };
    });
    expect(r.tabbarExiste, 'a barra do rodapé não deve voltar').toBe(false);
    // sem a barra fixa, o composer pode descer até o fim da tela
    expect(r.composerVisivel, 'composer visível').toBe(true);
    expect(r.composerBottom, 'composer dentro da tela').toBeLessThanOrEqual(r.vh);
    // e sobra dezoito livre no rodapé (a área de gestos do iPhone)
    expect(r.composerBottom).toBeGreaterThan(r.vh - 40);
  });
});
