// Arrasto horizontal entre as páginas do seletor (Cadernos | Tarefas | Diária).
//
// A funcionalidade foi pedida, o `workspaceSwipe` existia — e mesmo assim
// não funcionava, por três motivos independentes:
//
//  1. O arrasto percorria `TABS` = [conversations, ai, reminders, daily].
//     IA e Lembretes não têm botão no `.page-switcher` nem na tabbar: o
//     gesto levava para telas que não estão listadas em lugar nenhum, e o
//     Tarefas — que tem botão — ficava fora do alcance.
//
//  2. Não havia portão: o gesto funcionava com a conversa aberta na tela, e
//     aí o horizontal já tem outro dono (abre/fecha a conversa).
//
//  3. `navigation.bindSwipe` e `workspace._bindWorkspaceSwipe` escutavam
//     touchend no mesmo `document`: o mesmo arrasto voltava para o
//     explorador E trocava de página ao mesmo tempo.
//
// O portão tem que considerar `activeThread` SEMPRE, porque ele continua
// preenchido depois de voltar para o explorador (o mesmo estado que travava
// a reabertura da conversa). Por isso o teste é se a conversa está de fato
// na tela, e não se existe uma conversa selecionada.
const { test, expect } = require('@playwright/test');

const T0 = 1700000000000;
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Conversa', folderId: null, created: T0 - 80000 } },
  notes: { t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'mensagem', ts: T0 - 5000, images: [], reactions: {} }] },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const abaAtiva = (page) => page.evaluate(() => {
  const b = document.querySelector('.page-switch.active');
  return b ? b.dataset.page : null;
});

// arrasto horizontal real: touchstart -> varios touchmove -> touchend
const arrasta = async (page, { de, para, passos = 6 }) => {
  const client = await page.context().newCDPSession(page);
  const y = 420;
  const ponto = (x) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto(de) });
  for (let i = 1; i <= passos; i++) {
    const x = de + ((para - de) * i) / passos;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(x) });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
};

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);
  await page.goto('/');
  await page.waitForTimeout(1400);
});

test('arrastar para a esquerda avança Cadernos -> Tarefas -> Diária', async ({ page }) => {
  expect(await abaAtiva(page)).toBe('notes');

  await arrasta(page, { de: 330, para: 70 });
  expect(await abaAtiva(page), '1º arrasto deveria ir para Tarefas').toBe('tasks');

  await arrasta(page, { de: 330, para: 70 });
  expect(await abaAtiva(page), '2º arrasto deveria ir para a Diária').toBe('daily');

  // não há 4ª página: fica na Diária
  await arrasta(page, { de: 330, para: 70 });
  expect(await abaAtiva(page)).toBe('daily');
});

test('arrastar para a direita volta e para na primeira página', async ({ page }) => {
  await arrasta(page, { de: 330, para: 70 });   // -> Tarefas
  expect(await abaAtiva(page)).toBe('tasks');
  await arrasta(page, { de: 330, para: 70 });   // -> Diária
  expect(await abaAtiva(page)).toBe('daily');

  await arrasta(page, { de: 70, para: 330 });   // <- Diária
  expect(await abaAtiva(page)).toBe('tasks');
  await arrasta(page, { de: 70, para: 330 });   // <- Tarefas
  expect(await abaAtiva(page)).toBe('notes');

  // Cadernos é a primeira: não há para onde voltar
  await arrasta(page, { de: 70, para: 330 });
  expect(await abaAtiva(page)).toBe('notes');
});

test('a página de Tarefas realmente abre (não só acende a aba)', async ({ page }) => {
  await arrasta(page, { de: 330, para: 70 });
  await expect(page.locator('#tasks-page')).toBeVisible();
  // e não é a conversa que ficou na tela
  await expect(page.locator('#messages')).toBeHidden();
});

test('com a conversa aberta o arrasto NÃO troca de página', async ({ page }) => {
  await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
  await page.waitForTimeout(700);
  expect(await abaAtiva(page)).toBe('notes');

  // arrasto para a esquerda: aqui o gesto é da conversa, não das páginas
  await arrasta(page, { de: 330, para: 70 });
  expect(await abaAtiva(page), 'o arrasto não pode trocar de página com a conversa aberta').toBe('notes');
});

test('voltando para o explorador o arrasto volta a funcionar', async ({ page }) => {
  await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
  await page.waitForTimeout(700);

  // volta para o explorador pelo botão ‹
  await page.locator('#btn-back').click();
  await page.waitForTimeout(600);
  expect(await abaAtiva(page)).toBe('notes');

  // o requisito: `activeThread` continua preenchido, e mesmo assim o
  // arrasto tem de funcionar
  expect(await page.evaluate(() => window.NoteThread.UI.activeThread)).toBe('t1');

  await arrasta(page, { de: 330, para: 70 });
  expect(await abaAtiva(page), 'após voltar ao explorador o arrasto deve funcionar').toBe('tasks');
});

test('o arrasto não "volta" e troca de página ao mesmo tempo', async ({ page }) => {
  await arrasta(page, { de: 330, para: 70 });
  expect(await abaAtiva(page)).toBe('tasks');
  await expect(page.locator('#tasks-page')).toBeVisible();

  // arrasto para a direita: Tarefas -> Cadernos. Se o handler de conversa
  // também tivesse disparado, ele teria chamado goBack() no meio do caminho
  // e o resultado seria uma mistura das duas coisas.
  await arrasta(page, { de: 70, para: 330 });
  expect(await abaAtiva(page)).toBe('notes');
  await expect(page.locator('#tasks-page')).toBeHidden();
});
