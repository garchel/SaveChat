// A meta da bolha ("editada 19:12", "enviando…") é `position: absolute`
// com `white-space: nowrap`: fora do fluxo, ela NÃO entra na largura
// intrínseca da bolha. O piso de `min-width` existed para isso, mas tinha
// 90px — medido para a meta mais CURTA ("19:12"). Com o marcador de edição
// a meta passa de 32px para 81px, e numa nota curta ou vazia a bolha
// encolhia até 90px e a palavra "editada" transbordava pela esquerda.
//
// O teste mede o transbordo de verdade (bounding rect da meta contra o da
// bolha) nas três situações: nota normal curta, nota editada curta e nota
// editada sem texto nenhum.
const { test, expect } = require('@playwright/test');

const T0 = 1700000000000;
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Conversa', folderId: null, created: T0 - 80000 } },
  notes: {
    t1: [
      { clientId: 'curta', threadId: 't1', user: 'me', text: 'ok', ts: T0 - 30000, images: [], reactions: {} },
      { clientId: 'curta-ed', threadId: 't1', user: 'me', text: 'a', ts: T0 - 20000, edited: true, images: [], reactions: {} },
      { clientId: 'vazia-ed', threadId: 't1', user: 'me', text: '', ts: T0 - 10000, edited: true, images: [], reactions: {} },
      { clientId: 'longa', threadId: 't1', user: 'me', text: 'Uma mensagem bem mais longa, para conferir que a bolha grande não foi afetada pelo novo piso.', ts: T0 - 5000, images: [], reactions: {} },
    ],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

// quanto a meta ultrapassa a borda esquerda da bolha (px). Negativo = dentro.
const transbordo = (page, id) => page.evaluate((cid) => {
  const b = document.querySelector(`#messages .bubble[data-client-id="${cid}"]`);
  const m = b && b.querySelector('.meta');
  if (!b || !m) return null;
  const br = b.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  return {
    esquerda: +(br.left - mr.left).toFixed(1),
    direita: +(mr.right - br.right).toFixed(1),
    larguraBolha: +br.width.toFixed(1),
    larguraMeta: +mr.width.toFixed(1),
  };
}, id);

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
  await page.waitForTimeout(800);
});

test('a meta cabe dentro da bolha em toda nota', async ({ page }) => {
  for (const id of ['curta', 'curta-ed', 'vazia-ed', 'longa']) {
    const t = await transbordo(page, id);
    expect(t, `a bolha ${id} não foi renderizada`).not.toBeNull();
    expect(t.esquerda, `"${id}": a meta transbordou à esquerda (${t.esquerda}px)`).toBeLessThanOrEqual(0);
    expect(t.direita, `"${id}": a meta transbordou à direita (${t.direita}px)`).toBeLessThanOrEqual(0);
  }
});

test('nota editada e sem texto tem largura para o marcador', async ({ page }) => {
  const t = await transbordo(page, 'vazia-ed');
  // a meta "editada 19:12" tem ~81px; a bolha precisa de ~94px, com folga
  expect(t.larguraBolha).toBeGreaterThanOrEqual(94);
  expect(t.larguraBolha).toBeGreaterThanOrEqual(t.larguraMeta + 12);
});

test('nota editada curta também comporta o marcador', async ({ page }) => {
  const t = await transbordo(page, 'curta-ed');
  expect(t.larguraBolha).toBeGreaterThanOrEqual(94);
});

test('o piso maior é só da editada: a nota normal curta não incha', async ({ page }) => {
  const normal = await transbordo(page, 'curta');
  const editada = await transbordo(page, 'curta-ed');
  // a nota normal continua no piso antigo de 90px
  expect(normal.larguraBolha).toBeCloseTo(90, 0);
  // e a editada é a que ganha espaço
  expect(editada.larguraBolha).toBeGreaterThan(normal.larguraBolha);
});

test('nota longa não muda de largura', async ({ page }) => {
  const t = await transbordo(page, 'longa');
  // muito acima dos pisos: a largura vem do texto, não do min-width
  expect(t.larguraBolha).toBeGreaterThan(124);
});
