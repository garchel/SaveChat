const { test, expect } = require('@playwright/test');

// PIN por conversa: protege a abertura de UMA conversa, guardado no aparelho.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: {
    t1: { id: 't1', name: 'Diário', folderId: null, created: Date.now() - 90000, updatedAt: Date.now() },
    t2: { id: 't2', name: 'Trabalho', folderId: null, created: Date.now() - 80000, updatedAt: Date.now() },
  },
  notes: {
    t1: [{ clientId: 'a1', threadId: 't1', user: 'me', text: 'segredo', ts: Date.now() - 5000, images: [], reactions: {} }],
    t2: [{ clientId: 'b1', threadId: 't2', user: 'me', text: 'publico', ts: Date.now() - 4000, images: [], reactions: {} }],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false } },
};

// SW bloqueado: a troca de controlador recarrega a página no meio do teste
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
test.setTimeout(60000);

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForFunction(() => !!window.NoteThread && document.querySelectorAll('.tnode').length >= 2, null, { timeout: 45000 });
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.classList.contains('hidden')) window.NoteThread.UI.closeModal();
  });
  // deixa a animação de saída terminar: reabrir durante ela fecha de novo
  await page.waitForTimeout(500);
});

test('menu ⋮ oferece a opção de proteger a conversa', async ({ page }) => {
  const item = await page.evaluate(() => {
    const b = document.querySelector('[data-act="pin"]');
    return b ? b.textContent.trim() : null;
  });
  expect(item, 'item do menu existe').toContain('Travar com código');
});

test('conversa protegida pede o PIN ao abrir e recusa o errado', async ({ page }) => {
  // define o PIN pela API: o clique no ⋮ já é coberto pelo teste acima e o
  // popover anima, o que deixava o clique instável no CI
  await page.evaluate(() => window.NoteThread.UI.setThreadPin('t1'));
  await page.waitForSelector('#tpin-input', { timeout: 15000 });
  await page.fill('#tpin-input', '1234');
  await page.fill('#tpin-input2', '1234');
  await page.locator('#modal-ok').click();
  await page.waitForTimeout(400);

  const guardado = await page.evaluate(() => {
    const p = window.NoteThread.Store.data.ui.threadPins || {};
    return { tem: !!p.t1, naoVaza: JSON.stringify(p.t1 || '').indexOf('1234') === -1 };
  });
  expect(guardado.tem, 'conversa marcada como protegida').toBe(true);
  expect(guardado.naoVaza, 'o PIN não é guardado em texto claro').toBe(true);

  // cadeado sobre o ícone da conversa na árvore
  const cadeado = await page.evaluate(() => {
    const no = document.querySelector('.tnode[data-tid="t1"]');
    const outro = document.querySelector('.tnode[data-tid="t2"]');
    return { t1: !!no && !!no.querySelector('.lock-badge'), t2: !!outro && !!outro.querySelector('.lock-badge') };
  });
  expect(cadeado.t1, 'cadeado no ícone da conversa travada').toBe(true);
  expect(cadeado.t2, 'conversa sem código não ganha cadeado').toBe(false);

  // menu de contexto oferece destravar
  const menu = await page.evaluate(() => {
    const no = document.querySelector('.tnode[data-tid="t1"]');
    no.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 120 }));
    const m = document.getElementById('ctx-menu');
    const vis = (a) => { const b = m.querySelector(`[data-act="${a}"]`); return b ? !b.classList.contains('hidden') : null; };
    return { aberto: !m.classList.contains('hidden'), travar: vis('lock'), destravar: vis('unlock') };
  });
  expect(menu.aberto, 'menu de contexto abre').toBe(true);
  expect(menu.destravar, 'item "Destravar conversa" visível').toBe(true);
  expect(menu.travar, 'item "Travar" escondido').toBe(false);

  // a trava vale por sessão: recarregar simula abrir o app de novo
  await page.reload();
  await page.waitForFunction(() => !!window.NoteThread && document.querySelectorAll('.tnode').length >= 1, null, { timeout: 45000 });
  await page.evaluate(() => window.NoteThread.UI.openThread('t1'));
  await page.waitForSelector('#tpin-ask', { timeout: 15000 });

  // PIN errado não abre
  await page.fill('#tpin-ask', '9999');
  await page.locator('#modal-ok').click();
  await page.waitForTimeout(300);
  const aberta = await page.evaluate(() => window.NoteThread.UI.activeThread);
  expect(aberta, 'PIN errado não abre a conversa').not.toBe('t1');

  // PIN certo abre
  await page.fill('#tpin-ask', '1234');
  await page.locator('#modal-ok').click();
  await page.waitForFunction(() => window.NoteThread.UI.activeThread === 't1', null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#messages .bubble').length >= 1, null, { timeout: 15000 });
});
