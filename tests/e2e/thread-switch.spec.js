// Trocar de conversa não pode deixar as mensagens da anterior na tela.
//
// O sintoma: abrir a conversa A, depois a B, e o fluxo mostra as bolhas das
// DUAS. A causa não é o filtro de idempotência (renderedClientIds), que é
// zerado em openThread: é que nada remove os nós do DOM anterior. O reset
// de renderMessages só limpa os separadores de dia e o conjunto de ids —
// as bolhas velhas continuam dentro de #messages, e a página nova é pintada
// logo abaixo do #load-slot, ou seja, ACIMA delas.
//
// Este teste trava o contrato: o DOM pertence à conversa aberta.
const { test, expect } = require('@playwright/test');

const T0 = 1_700_000_000_000;

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: {
    t1: { id: 't1', name: 'Conversa A', folderId: null, created: T0 - 90000 },
    t2: { id: 't2', name: 'Conversa B', folderId: null, created: T0 - 80000 },
  },
  folders: {},
  notes: {
    t1: [
      { clientId: 'a1', threadId: 't1', user: 'me', text: 'ALFA-1', ts: T0 - 60000 },
      { clientId: 'a2', threadId: 't1', user: 'me', text: 'ALFA-2', ts: T0 - 50000 },
    ],
    t2: [
      { clientId: 'b1', threadId: 't2', user: 'me', text: 'BRAVO-1', ts: T0 - 40000 },
      { clientId: 'b2', threadId: 't2', user: 'me', text: 'BRAVO-2', ts: T0 - 30000 },
    ],
  },
  ui: { expanded: {}, sounds: { enabled: false, volume: 0.5, map: {} } },
};

const bolhas = (page) => page.locator('#messages .bubble[data-client-id]');
const textos = (page) => bolhas(page).allInnerTexts();

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
});

test('trocar de conversa deixa só as mensagens da nova', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);

  // abre a conversa A pelo nó da árvore
  await page.locator('.tnode[data-tid="t1"]').first().click();
  await expect(page.locator('#chat-name')).toHaveText('Conversa A');
  await expect(bolhas(page)).toHaveCount(2);
  expect((await textos(page)).join('|')).toContain('ALFA-1');

  // troca para a conversa B
  await page.locator('.tnode[data-tid="t2"]').first().click();
  await expect(page.locator('#chat-name')).toHaveText('Conversa B');

  // a B tem exatamente 2 bolhas, e são as DELA
  await expect(bolhas(page)).toHaveCount(2);
  const t = await textos(page);
  expect(t.join('|')).toContain('BRAVO-1');
  expect(t.join('|')).toContain('BRAVO-2');
  // nenhuma bolha da conversa anterior sobreviveu
  expect(t.join('|')).not.toContain('ALFA-');

  // e voltando para A, o mesmo vale
  await page.locator('.tnode[data-tid="t1"]').first().click();
  await expect(bolhas(page)).toHaveCount(2);
  expect((await textos(page)).join('|')).not.toContain('BRAVO-');
});

test('o dia separador também não sobrevive à troca de conversa', async ({ page }) => {
  // No reset `lastDay` começa null, então o PRIMEIRO dia não rende separador:
  // só aparece a partir do dia seguinte. Por isso A precisa de 3 notas
  // atravessando 2 dias (notas 1 e 2 no dia X, nota 3 no dia Y) para o
  // separador existir, e B precisa ter as 3 no mesmo dia para não rende
  // nenhum. É isso que faz do separador um bom detector de resíduo: A cria
  // um, B não cria — se o de A sobreviver à troca, a UI está vazando estado.
  const seedSep = JSON.parse(JSON.stringify(seed));
  const D = 86400000;
  seedSep.notes.t1 = [
    { clientId: 'a1', threadId: 't1', user: 'me', text: 'ALFA-1', ts: T0 - 3 * D },
    { clientId: 'a2', threadId: 't1', user: 'me', text: 'ALFA-2', ts: T0 - 3 * D + 1000 },
    { clientId: 'a3', threadId: 't1', user: 'me', text: 'ALFA-3', ts: T0 },
  ];
  seedSep.notes.t2 = [
    { clientId: 'b1', threadId: 't2', user: 'me', text: 'BRAVO-1', ts: T0 - 2 * 3600000 },
    { clientId: 'b2', threadId: 't2', user: 'me', text: 'BRAVO-2', ts: T0 - 3600000 },
    { clientId: 'b3', threadId: 't2', user: 'me', text: 'BRAVO-3', ts: T0 },
  ];
  await page.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seedSep);

  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.locator('.tnode[data-tid="t1"]').first().click();
  await expect(bolhas(page)).toHaveCount(3);
  // conta só o WRAPPER: o seletor com os dois (.day-sep-wrap E o .day-sep
  // dentro dele) contaria o mesmo separador duas vezes
  const sepsA = await page.locator('#messages .day-sep-wrap').count();
  expect(sepsA, 'A deveria ter 1 separador (2 dias)').toBe(1);

  await page.locator('.tnode[data-tid="t2"]').first().click();
  await expect(page.locator('#chat-name')).toHaveText('Conversa B');
  await expect(bolhas(page)).toHaveCount(3);
  const t = await textos(page);
  expect(t.join('|')).not.toContain('ALFA-');
  // o separador criado por A não pode sobreviver: B é de um dia só
  const sepsB = await page.locator('#messages .day-sep-wrap').count();
  expect(sepsB, 'o separador de A vazou para B').toBe(0);
});
