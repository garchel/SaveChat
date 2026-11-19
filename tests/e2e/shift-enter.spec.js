const { test, expect } = require('@playwright/test');

// Shift+Enter no composer tem de quebrar linha. Ele estava com
// `e.preventDefault()` incondicional: dentro de lista a continuação acontecia,
// mas FORA de lista nada acontecia — a quebra nativa morria no preventDefault.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000, updatedAt: Date.now() } },
  notes: { t1: [] },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false } },
};

test.use({ viewport: { width: 1280, height: 800 } });
// 6 contextos concorrentes nesta máquina levam >15s para montar o app
test.setTimeout(60000);

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForFunction(() => window.NoteThread && document.querySelectorAll('.tnode').length > 0, null, { timeout: 45000 });
  // fecha o diálogo do mascote (o seed não define nome) antes de clicar
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.classList.contains('hidden')) window.NoteThread.UI.closeModal();
  });
  // clique REAL no nó: o Playwright espera o elemento ficar acionável, o que
  // cobre o caso de os bindings do composer ainda não estarem prontos sob carga
  await page.locator('.tnode[data-tid="t1"]').click();
  // o composer nasce `contenteditable="false"` e só habilita quando a conversa
  // abre; clicar antes disso estoura o timeout sob carga (medido com 3 workers)
  await page.waitForFunction(() => {
    const ta = document.getElementById('composer-input');
    return !!ta && ta.getAttribute('contenteditable') === 'true';
  }, null, { timeout: 45000 });
});


// Foco por código em vez de clique: o teste verifica o tratamento de TECLA, e
// sob 3 workers o clique no composer estourava 60s sem que nada estivesse
// errado no app (elemento habilitado, mas coberto por overlay transitório).
async function focarComposer(page) {
  await page.evaluate(() => {
    const ta = document.getElementById('composer-input');
    ta.focus();
    const r = document.createRange();
    r.selectNodeContents(ta);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.waitForFunction(() => !!document.activeElement && document.activeElement.id === 'composer-input');
}

test('Shift+Enter fora de lista quebra a linha', async ({ page }) => {
  const ta = page.locator('#composer-input');
  await focarComposer(page);
  await page.keyboard.type('linha um');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('linha dois');

  // o editor precisa ter DUAS linhas (o texto serializa \n a partir de <br>)
  const texto = await page.evaluate(() => window.NoteThread.UI._editorText(document.getElementById('composer-input')));
  expect(texto, 'editor com duas linhas: ' + JSON.stringify(texto)).toContain('\n');
  expect(texto.replace(/\s+/g, ' ').trim()).toBe('linha um linha dois');

  // e a nota enviada mantém a quebra
  await page.evaluate(() => window.NoteThread.UI.sendNote());
  await page.waitForTimeout(600);
  const html = await page.locator('#messages .bubble').last().innerHTML();
  expect(html).toMatch(/linha um[\s\S]*<br[\s\S]*linha dois/);
});

test('Shift+Enter dentro de checklist continua a lista', async ({ page }) => {
  const ta = page.locator('#composer-input');
  await focarComposer(page);
  // monta uma checklist com um item e põe o caret no fim dele
  await page.evaluate(() => {
    const el = document.getElementById('composer-input');
    el.innerHTML = '<ul class="md-checklist"><li><span class="md-check"><input type="checkbox"><span>item um</span></span></li></ul>';
    const span = el.querySelector('.md-check > span');
    const r = document.createRange(); r.selectNodeContents(span); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    el.focus();
  });
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(200);
  const itens = await page.evaluate(() => document.querySelectorAll('#composer-input ul.md-checklist > li').length);
  expect(itens, 'a checklist ganhou um item').toBe(2);
});
