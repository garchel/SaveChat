// O campo de entrada da conversa é o último item do fluxo. Antes havia um
// `bottom: 14px` sobrando da época em que ele era flutuante, que somava aos
// 16px de margem: 30px de vão abaixo do input e 14px de sobreposição com o
// #messages. Agora o vão é 20px (1/3 menor) e o compositor não invade mais a
// área rolável.
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Espaçamento', folderId: null, created: Date.now() } },
  folders: {}, notes: {},
  ui: { mascot: { nameSet: true }, expanded: {}, sounds: { enabled: false } },
};

test('o vão abaixo do input é ~20px e não sobrepõe as mensagens', async ({ page, context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.locator('.tnode[data-tid="t1"]').first().click();
  await expect(page.locator('#composer-input')).toBeEnabled();

  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const input = document.querySelector('.composer.cozy-composer .composer-row').getBoundingClientRect();
      const chat = document.querySelector('.chat').getBoundingClientRect();
      const composer = document.querySelector('.composer.cozy-composer').getBoundingClientRect();
      const messages = document.querySelector('#messages').getBoundingClientRect();
      return {
        gap: +(chat.bottom - input.bottom).toFixed(1),
        overlap: +(messages.bottom - composer.top).toFixed(1),
      };
    });
    expect(m.gap, `vão abaixo do input em ${vp.width}px`).toBeGreaterThanOrEqual(19);
    expect(m.gap, `vão abaixo do input em ${vp.width}px`).toBeLessThanOrEqual(21);
    expect(m.overlap, `o compositor não pode invadir o #messages em ${vp.width}px`).toBeLessThanOrEqual(0.5);
  }
});
