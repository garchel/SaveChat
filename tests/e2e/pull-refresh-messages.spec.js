// Regressão do pull-to-refresh: com todas as páginas carregadas, o usuário
// puxava o topo para atualizar e a conversa ficava vazia. O snapshot chamava
// `renderMessages(true)` com `oldestKey` apontando para a primeira nota (0);
// `pageNotes` devolvia zero itens e o reset apagava as bolhas. O reset agora
// volta a âncora para `null` antes de paginar.
const { test, expect } = require('@playwright/test');

const T0 = 1_700_000_000_000;
const TOTAL = 60;
const notes = Array.from({ length: TOTAL }, (_, i) => ({
  clientId: 'n' + i,
  threadId: 't1',
  user: 'me',
  text: 'MENSAGEM-' + i,
  ts: T0 + i * 1000,
}));

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Conversa longa', folderId: null, created: T0 - 90000 } },
  folders: {},
  notes: { t1: notes },
  ui: { mascot: { nameSet: true }, expanded: {}, sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
});

test('reset após carregar o topo não apaga as mensagens', async ({ page }) => {
  const bolhas = page.locator('#messages .bubble[data-client-id]');
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.locator('.tnode[data-tid="t1"]').first().click();

  // abre com a última página e desce carregando as anteriores até o topo
  await expect(bolhas).toHaveCount(25);
  for (let i = 0; i < 6; i++) {
    // o primeiro scroll no topo só consome a página repetida e move a âncora;
    // os seguintes é que inserem as anteriores. Dispatch explícito porque,
    // depois da âncora, o scrollTop já pode estar em 0 e não emitir evento.
    await page.locator('#messages').evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(250);
    if (await bolhas.count() === TOTAL) break;
  }
  await expect(bolhas).toHaveCount(TOTAL);
  expect(await page.evaluate(() => window.NoteThread.UI.oldestKey)).toBe(0);

  // exatamente o que o refresh faz depois do snapshot: reset com a âncora
  // ainda no começo da conversa
  await page.evaluate(() => window.NoteThread.UI.renderMessages(true));

  // o reset pinta a última página (a mais recente), não o vazio
  await expect(bolhas).toHaveCount(25);
  expect((await bolhas.allInnerTexts()).join('|')).toContain('MENSAGEM-' + (TOTAL - 1));
});
