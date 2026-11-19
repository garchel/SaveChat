const { test, expect } = require('@playwright/test');

// Agrupar: menu ⋮ da bolha → seleção múltipla → fusão em uma nota só.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000, updatedAt: Date.now() } },
  notes: {
    t1: [
      { clientId: 'a1', threadId: 't1', user: 'me', text: 'primeira', ts: Date.now() - 3000, images: [], reactions: {} },
      { clientId: 'a2', threadId: 't1', user: 'me', text: 'segunda', ts: Date.now() - 2000, images: [], reactions: {} },
      { clientId: 'a3', threadId: 't1', user: 'me', text: 'terceira', ts: Date.now() - 1000, images: [], reactions: {} },
    ],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false } },
};

test.use({ viewport: { width: 1280, height: 800 } });
test.setTimeout(60000);

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForFunction(() => window.NoteThread && document.querySelectorAll('.tnode').length > 0, null, { timeout: 45000 });
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.classList.contains('hidden')) window.NoteThread.UI.closeModal();
  });
  await page.locator('.tnode[data-tid="t1"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#messages .bubble').length >= 3, null, { timeout: 20000 });
});

// abre o menu da bolha e clica em "Agrupar" (fluxo real do usuário)
async function entrarNoModoAgrupar(page, cid) {
  await page.evaluate((id) => {
    const el = document.querySelector(`.bubble[data-client-id="${id}"]`);
    const n = window.NoteThread.Store.notesFor('t1').find((x) => x.clientId === id);
    window.NoteThread.UI.openMsgPopover(el, n);
  }, cid);
  await page.locator('[data-msg="group"]').click();
}

test('menu da bolha entra no modo agrupar com checkbox em cada mensagem', async ({ page }) => {
  await entrarNoModoAgrupar(page, 'a1');

  // uma checkbox por bolha (3), e a do item que abriu o menu já vem marcada
  expect(await page.locator('#messages .bubble-check input').count()).toBe(3);
  expect(await page.locator('.bubble[data-client-id="a1"] .bubble-check input').isChecked()).toBe(true);

  // o composer troca enviar/gravar por cancelar + agrupar
  const ui = await page.evaluate(() => ({
    barVisivel: !document.getElementById('group-bar').classList.contains('hidden'),
    enviarVisivel: getComputedStyle(document.getElementById('btn-send')).display !== 'none',
        // o composer da CONVERSA: `querySelector('.composer-row')` pega o da página de IA
    rowGrouping: document.getElementById('composer-input').closest('.composer-row').classList.contains('grouping'),
    confirmTxt: document.getElementById('group-confirm').textContent,
    confirmOff: document.getElementById('group-confirm').disabled,
  }));
  console.log('UI=' + JSON.stringify(ui));
  expect(ui.barVisivel, 'barra de agrupar visível').toBe(true);
  expect(ui.enviarVisivel, 'botão de enviar/gravar escondido').toBe(false);
  expect(ui.rowGrouping).toBe(true);
  expect(ui.confirmTxt).toBe('Agrupar (1)');
  expect(ui.confirmOff, 'confirmar desabilitado com 1 selecionada').toBe(true);
});

test('confirmar funde as mensagens com linha em branco entre elas', async ({ page }) => {
  await entrarNoModoAgrupar(page, 'a1');
  await page.locator('.bubble[data-client-id="a2"] .bubble-check').click();
  await page.locator('.bubble[data-client-id="a3"] .bubble-check').click();

  expect(await page.locator('#group-confirm').textContent()).toBe('Agrupar (3)');
  expect(await page.locator('#group-confirm').isDisabled()).toBe(false);
  await page.locator('#group-confirm').click();
  await page.waitForTimeout(600);

  const estado = await page.evaluate(() => {
    const arr = window.NoteThread.Store.notesFor('t1');
    return {
      qtd: arr.length,
      texto: arr[0] && arr[0].text,
      bolhas: document.querySelectorAll('#messages .bubble').length,
      checks: document.querySelectorAll('.bubble-check').length,
      barOculta: document.getElementById('group-bar').classList.contains('hidden'),
      enviarVisivel: getComputedStyle(document.getElementById('btn-send')).display !== 'none',
    };
  });
  console.log('AGRUPADO=' + JSON.stringify(estado));

  expect(estado.qtd, 'sobrou uma nota só').toBe(1);
  // conteúdo das três, na ordem cronológica, com linha em branco entre elas
  expect(estado.texto).toBe('primeira\n\nsegunda\n\nterceira');
  expect(estado.bolhas, 'uma bolha na tela').toBe(1);
  expect(estado.checks, 'checkboxes removidas').toBe(0);
  expect(estado.barOculta, 'barra some').toBe(true);
  expect(estado.enviarVisivel, 'enviar/gravar volta').toBe(true);
});

test('cancelar sai do modo sem mexer nas mensagens', async ({ page }) => {
  await entrarNoModoAgrupar(page, 'a1');
  await page.locator('.bubble[data-client-id="a2"] .bubble-check').click();
  await page.locator('#group-cancel').click();
  await page.waitForTimeout(300);

  const estado = await page.evaluate(() => ({
    qtd: window.NoteThread.Store.notesFor('t1').length,
    checks: document.querySelectorAll('.bubble-check').length,
    barOculta: document.getElementById('group-bar').classList.contains('hidden'),
    grouping: document.getElementById('messages').classList.contains('grouping'),
  }));
  expect(estado.qtd, 'nada foi fundido').toBe(3);
  expect(estado.checks).toBe(0);
  expect(estado.barOculta).toBe(true);
  expect(estado.grouping).toBe(false);
});
