// E2E: teclado virtual no celular. O Playwright não abre teclado real, então
// substituímos `visualViewport` por um fake controlável (como o iOS faz:
// encolhe só a viewport visual) e verificamos que o app inteiro sobe.
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Paulo', mail: 'paulo@test.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Teclado', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [{
    clientId: 'n1', threadId: 't1', user: 'me', text: 'Mensagem de teste',
    ts: Date.now() - 5000, images: [],
  }] },
  ui: { mascot: { nameSet: true }, expanded: {}, sounds: { enabled: false } },
};

test.use({ viewport: { width: 390, height: 844 } });

test('o app encolhe para a área visível e o composer fica acima do teclado', async ({ page }) => {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
    // Fake da viewport visual: só o iOS encolhe assim (o Chrome Android com
    // interactive-widget=resizes-content encolhe o layout e nem precisa disso).
    const vv = new EventTarget();
    let height = window.innerHeight;
    let offsetTop = 0;
    Object.defineProperties(vv, {
      height: { get: () => height },
      offsetTop: { get: () => offsetTop },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    window.__kbd = (h, top = 0) => {
      height = h; offsetTop = top;
      vv.dispatchEvent(new Event('resize'));
    };
  }, seed);

  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.locator('.tnode[data-tid="t1"]').first().click();
  await expect(page.locator('#composer-input')).toHaveAttribute('contenteditable', 'true');

  await page.locator('#composer-input').click();
  await page.waitForTimeout(300);

  // teclado cobre 344px (500px visíveis de 844px)
  await page.evaluate(() => window.__kbd(500));
  await page.waitForTimeout(300);

  const appHeight = await page.locator('.app').evaluate((el) => el.getBoundingClientRect().height);
  expect(appHeight).toBeLessThanOrEqual(502);
  expect(appHeight).toBeGreaterThan(480);

  const composer = await page.locator('#composer-input').boundingBox();
  expect(composer.y + composer.height).toBeLessThanOrEqual(502);

  // fecha o teclado: o app volta a ocupar a tela
  await page.evaluate(() => window.__kbd(844));
  await page.waitForTimeout(300);
  const full = await page.locator('.app').evaluate((el) => el.getBoundingClientRect().height);
  expect(full).toBeGreaterThan(800);
});
