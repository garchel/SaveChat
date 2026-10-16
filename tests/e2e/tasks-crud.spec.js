// Tarefas próprias (CRUD dentro da página) + acordeões.
//
// O contrato que este teste trava:
// - "Minhas tarefas" aceita criar, editar inline, excluir e concluir;
// - o texto novo NÃO pode ficar vazio (Enter em campo vazio não cria linha);
// - concluir tira da lista mas persiste `done` no Store (pode ser restaurada);
// - as próprias moram em `ui.tasksOwn` (escopo do DISPOSITIVO, fora do
//   bucket da conta — ver o cabeçalho de tasks.js);
// - os acordeões abrem/fecham com `aria-expanded` coerente.
const { test, expect } = require('@playwright/test');

// O seed vem ANTES do beforeEach de propósito: um `const` referenciado
// dentro do callback do beforeEach é avaliado na hora da execução, mas se o
// `const` estiver DEPOIS no arquivo ele ainda está na TDZ (temporal dead
// zone) quando o módulo é carregado — e o callback recebia `undefined`, a
// semente não era gravada e a contagem dava 0. Ordem no arquivo importa.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000 } },
  notes: {
    // ATENÇÃO ao formato: o parser de checklist exige a linha COMEÇANDO em
    // `[ ]` — `^\s*\[( |x)\]`. Com o prefixo de lista markdown (`- [ ]`),
    // NENHUMA linha bate (medido: 0 itens com contagem 0). O app aceita os
    // dois formatos de escrita, mas o que vira tarefa é o `[ ]` no início
    // da linha (ou depois de espaços).
    t1: [{
      clientId: 'n1', threadId: 't1', user: 'me',
      text: 'lista do churrasco\n[ ] comprar carvão\n[x] já feito\n[ ] gelo',
      ts: Date.now() - 50000, images: [], reactions: {},
    }],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

// viewport de desktop: em 390px a sidebar cobre o canvas e o clique na aba
// de páginas é interceptado por ela (medido: "subtree intercepts pointer
// events"). Em desktop a barra fica acessível.
test.use({ viewport: { width: 1280, height: 800 } });

// SEMENTE: `context.addInitScript` com GUARD (`if (!localStorage...`). O
// guard mantém a semente só na primeira carga — sem ele o script rodaria em
// todo reload e re-encodaria a string.
test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

async function abrirTarefas(page) {
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.click('.page-switch[data-page="tasks"]');
  await expect(page.locator('#tasks-page')).toBeVisible();
  await page.waitForTimeout(400);
}

test('criar, editar inline e excluir tarefa própria', async ({ page }) => {
  await abrirTarefas(page);

  // estado inicial: 1 aberta nas conversas (o `- [x)` acima não conta —
  // não é marca de checklist válida, fica como texto normal)
  await expect(page.locator('#tasks-threads-count')).toHaveText('2');
  await expect(page.locator('#tasks-own-count')).toHaveText('0');

  // criar duas
  const input = page.locator('#task-new-input');
  await input.fill('pagar conta de luz');
  await input.press('Enter');
  await input.fill('ligar pro dentista');
  await input.press('Enter');
  await expect(page.locator('#tasks-own-count')).toHaveText('2');
  // o campo limpa após criar (pronto pra próxima)
  await expect(input).toHaveValue('');
  // a nova tarefa aparece no accordion "Minhas tarefas"
  await expect(page.locator('#tasks-own-list .task-own .task-text').first()).toHaveText('ligar pro dentista');

  // Enter em campo VAZIO não cria linha
  await input.press('Enter');
  await expect(page.locator('#tasks-own-count')).toHaveText('2');

  // editar inline: vira input no lugar
  const primeira = page.locator('#tasks-own-list .task-own').first();
  await primeira.locator('[data-act="edit"]').click();
  const editInput = primeira.locator('.task-edit-input');
  await expect(editInput).toBeVisible();
  await editInput.fill('ligar pro dentista amanhã');
  await editInput.press('Enter');
  await expect(primeira.locator('.task-text')).toHaveText('ligar pro dentista amanhã');

  // Escape desfaz a edição (volta ao texto anterior)
  await primeira.locator('[data-act="edit"]').click();
  const editInput2 = primeira.locator('.task-edit-input');
  await editInput2.fill('texto que vou descartar');
  await editInput2.press('Escape');
  await expect(primeira.locator('.task-text')).toHaveText('ligar pro dentista amanhã');

  // excluir
  await primeira.locator('[data-act="del"]').click();
  await expect(page.locator('#tasks-own-count')).toHaveText('1');

  // persistiu no Store, no lugar certo (ui.tasksOwn — fora do bucket da conta)
  const persistido = await page.evaluate(() => {
    const ui = window.NoteThread.Store.data.ui;
    const root = JSON.parse(localStorage.getItem('notethread.v2'));
    const bucket = JSON.parse(localStorage.getItem('notethread.v2::u::ana@test.com') || 'null');
    return {
      own: ui.tasksOwn.map((t) => t.text),
      naRaiz: !!(root.ui && root.ui.tasksOwn),
      noBucket: !!(bucket && bucket.scope && bucket.scope.tasksOwn),
    };
  });
  expect(persistido.own).toEqual(['pagar conta de luz']);
  expect(persistido.naRaiz, 'tarefas próprias ficam na raiz (escopo do dispositivo)').toBe(true);
  expect(persistido.noBucket, 'e NÃO no bucket da conta').toBe(false);
});

test('concluir tarefa própria tira da lista e persiste como done', async ({ page }) => {
  await abrirTarefas(page);
  await page.locator('#task-new-input').fill('tarefa que vou concluir');
  await page.locator('#task-new-input').press('Enter');
  await expect(page.locator('#tasks-own-count')).toHaveText('1');

  // .click() e não .check(): o Playwright clica e confere 'checked', mas a
  // animacao de saida remove a linha antes da conferencia e o .check() estoura
  // timeout (medido: CB no topo do hit-testing, visivel, habilitado, e ainda
  // assim timeout). Clicar e assertar o EFEITO e o contrato real.
  await page.locator('#tasks-own-list .task-own .task-chk').click();
  await page.waitForTimeout(900);
  await expect(page.locator('#tasks-own-count')).toHaveText('0');
  await expect(page.locator('#tasks-own-empty')).toBeVisible();

  // some da lista mas continua no Store com done:true (restaurável)
  const done = await page.evaluate(() => {
    const t = window.NoteThread.Store.data.ui.tasksOwn[0];
    return { done: !!t.done, doneAt: typeof t.doneAt };
  });
  expect(done.done).toBe(true);
  expect(done.doneAt).toBe('number');
});

test('acordeões abrem e fecham com aria-expanded coerente', async ({ page }) => {
  await abrirTarefas(page);

  const ownHead = page.locator('#task-acc-own');
  const ownBody = page.locator('#task-body-own');
  await expect(ownHead).toHaveAttribute('aria-expanded', 'true');

  // fecha: aria-expanded false e o corpo colapsa (altura 0)
  await ownHead.click();
  await expect(ownHead).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(350); // transição do grid-template-rows
  const alturaFechado = await ownBody.evaluate((el) => el.getBoundingClientRect().height);
  expect(alturaFechado, 'corpo colapsa quando fechado').toBeLessThan(2);

  // reabre
  await ownHead.click();
  await expect(ownHead).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(350);
  const alturaAberto = await ownBody.evaluate((el) => el.getBoundingClientRect().height);
  expect(alturaAberto, 'corpo volta a ter altura').toBeGreaterThan(40);
});
