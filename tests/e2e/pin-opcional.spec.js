const { test, expect } = require('@playwright/test');

// PIN opcional: sem PIN o app abre direto (nenhum card no boot) e o controle
// vive nas Configurações, desligado por padrão.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 9000, updatedAt: Date.now() } },
  notes: { t1: [{ clientId: 'a1', threadId: 't1', user: 'me', text: 'oi', ts: Date.now() - 5000, images: [], reactions: {} }] },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false } },
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.setTimeout(60000);

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForFunction(() => !!window.NoteThread && document.querySelectorAll('.tnode').length > 0, null, { timeout: 45000 });
});

test('sem PIN ativado o boot não pede nada', async ({ page }) => {
  const estado = await page.evaluate(() => {
    const gate = document.getElementById('crypto-gate');
    return {
      gateOculto: !gate || gate.classList.contains('hidden'),
      appVisivel: !document.getElementById('app').classList.contains('hidden'),
      titulo: (document.getElementById('crypto-title') || {}).textContent,
    };
  });
  expect(estado.appVisivel, 'app abre direto').toBe(true);
  expect(estado.gateOculto, 'nenhum card de PIN no boot').toBe(true);
  expect(estado.titulo, 'texto do card fala de PIN, não de senha').toBe('Digite seu PIN');
});

test('configurações têm a opção PIN, desligada por padrão', async ({ page }) => {
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.classList.contains('hidden')) window.NoteThread.UI.closeModal();
    // só abre se ainda não estiver aberto: `toggle` fecharia um popover já
    // visível (ele abre sozinho em algumas larguras)
    const pop = document.getElementById('settings-popover');
    if (!pop || pop.classList.contains('hidden')) window.NoteThread.UI.toggleSettingsPopover();
  });
  // o popover é uma lista rolável: a seção do PIN nasce abaixo da dobra, então
  // o teste exige existência + visibilidade CSS (não estar na viewport)
  await page.waitForFunction(() => {
    const cb = document.getElementById('pin-enabled');
    if (!cb) return false;
    const sec = cb.closest('.settings-section');
    const cs = sec && getComputedStyle(sec);
    return !!cs && cs.display !== 'none' && cs.visibility !== 'hidden';
  }, null, { timeout: 15000 });
  await page.evaluate(() => document.getElementById('pin-enabled').closest('.settings-section').scrollIntoView({ block: 'center' }));

  const info = await page.evaluate(() => {
    const cb = document.getElementById('pin-enabled');
    const sec = cb.closest('.settings-section');
    return {
      rotulo: sec.querySelector('.settings-label').textContent.trim(),
      marcado: cb.checked,
      dica: document.getElementById('pin-hint').textContent,
    };
  });
  console.log('PIN_UI=' + JSON.stringify(info));
  expect(info.rotulo).toBe('PIN');
  expect(info.marcado, 'desligado por padrão').toBe(false);
  expect(info.dica).toContain('Desligado');
  expect(info.dica).not.toContain('criptografia');
});
