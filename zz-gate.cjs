const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await ctx.addInitScript(() => localStorage.setItem('notethread.v2', JSON.stringify({
    user: { name: 'A', mail: 'a@t.com', provider: 'email' }, folders: {}, threads: {}, notes: {},
    ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false } } })));
  await page.goto('http://localhost:3001/');
  await page.waitForFunction(() => !!window.NoteThread, null, { timeout: 30000 });
  const d = await page.evaluate(() => {
    const gate = document.getElementById('crypto-gate');
    gate.classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('crypto-setup-fields').classList.remove('hidden');
    document.getElementById('crypto-unlock-fields').classList.add('hidden');
    document.getElementById('crypto-title').textContent = 'Crie seu PIN (4 dígitos)';
    const form = document.getElementById('crypto-form');
    const cs = getComputedStyle(form);
    const label = form.querySelector('.crypto-label');
    const lcs = getComputedStyle(label);
    return {
      formDisplay: cs.display, formDir: cs.flexDirection, formWrap: cs.flexWrap,
      labelDisplay: lcs.display, labelTag: label.tagName,
      setup: getComputedStyle(document.getElementById('crypto-setup-fields')).display,
      setupDisplay: getComputedStyle(document.getElementById('crypto-setup-fields')).display,
      labelRect: JSON.stringify(label.getBoundingClientRect()),
      inputRect: JSON.stringify(document.getElementById('crypto-pass').getBoundingClientRect()),
    };
  });
  console.log(JSON.stringify(d, null, 1));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'zz-gate.png' });
  await b.close();
})();
