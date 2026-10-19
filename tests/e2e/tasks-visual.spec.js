const { test, expect } = require('@playwright/test');

// Confere os 4 ajustes visuais pedidos:
//  1. accordion de baixo não sobrepõe o de cima ao abrir
//  2. sem flick de hover durante a animação (transition de background removida)
//  3. sem borda quadrada interna no input de nova tarefa
//  4. marcador colorido da conversa em vez do emoji cru
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: {
    t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000, color: 'cozy-teal' },
    t2: { id: 't2', name: 'Trabalho', folderId: null, created: Date.now() - 80000 },
  },
  notes: {
    t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'lista\n[ ] comprar carvão', ts: Date.now() - 50000, images: [], reactions: {} }],
    t2: [{ clientId: 'n2', threadId: 't2', user: 'me', text: 'job\n[ ] responder email', ts: Date.now() - 40000, images: [], reactions: {} }],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
});

test('acordeão de baixo não sobrepõe o de cima ao abrir', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.click('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(500);

  // fecha o de cima e abre o de baixo: é a ordem que gerava a sobreposição
  await page.click('#task-acc-own');
  await page.waitForTimeout(400);
  const fechou = await page.evaluate(() => document.querySelector('#task-acc-own').getAttribute('aria-expanded'));
  expect(fechou).toBe('false');

  // durante a animação, o corpo do de baixo não pode invadir o de cima
  await page.click('#task-acc-threads');
  await page.waitForTimeout(120);
  const sobrepoe = await page.evaluate(() => {
    const own = document.querySelector('.task-acc[data-acc="own"]').getBoundingClientRect();
    const th = document.querySelector('.task-acc[data-acc="threads"]').getBoundingClientRect();
    return { ownBottom: Math.round(own.bottom), thTop: Math.round(th.top), invade: th.top < own.bottom - 1 };
  });
  console.log('SOBREPOE=' + JSON.stringify(sobrepoe));
  expect(sobrepoe.invade, 'o accordion de baixo não invade o de cima').toBe(false);
});

test('input de nova tarefa não tem borda/outline quadrado ao focar', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.click('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const inp = document.getElementById('task-new-input');
    inp.focus();
    const cs = getComputedStyle(inp);
    return {
      borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle,
      outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow,
      raioDoCampo: getComputedStyle(document.querySelector('.task-new')).borderRadius,
    };
  });
  console.log('INPUT_FOCO=' + JSON.stringify(r));
  expect(r.borderWidth, 'input sem borda própria').toBe('0px');
  expect(r.outlineStyle, 'input sem outline quadrado').toBe('none');
  expect(r.boxShadow, 'input sem box-shadow').toBe('none');
});

test('marcador da conversa é colorido, sem emoji cru', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.click('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#tasks-threads-list .task-row')];
    return rows.map((row) => {
      const src = row.querySelector('.task-src');
      const nome = row.querySelector('.task-src-name');
      return {
        conversa: nome ? nome.textContent : null,
        marcadorTemCor: src ? getComputedStyle(src).backgroundColor !== 'rgba(0, 0, 0, 0)' : false,
        cor: src ? getComputedStyle(src).backgroundColor : null,
        // o emoji cru (🚩 etc) não pode estar solto no .task-meta
        metaTexto: row.querySelector('.task-meta')?.textContent?.trim(),
      };
    });
  });
  console.log('MARCADORES=' + JSON.stringify(r, null, 1));
  expect(r.length).toBeGreaterThan(0);
  for (const m of r) {
    expect(m.conversa, 'nome da conversa presente').toBeTruthy();
    expect(m.marcadorTemCor, `marcador de "${m.conversa}" tem cor`).toBe(true);
  }
  // a t1 foi semeada com a cor escolhida 'cozy-teal' (#589B99)
  const t1 = r.find((m) => m.conversa === 'Compras');
  expect(t1.cor, 'usa a cor escolhida da conversa').toBe('rgb(88, 155, 153)');
});

// A coluna esconde a barra de rolagem visualmente, mas continua rolando por
// wheel/toque - como a arvore do explorador. Sem isto volta a barra grossa
// na lateral da lista.
test('pagina de tarefas sem barra de rolagem, mas ainda rolavel', async ({ page }) => {
  await page.addInitScript((s) => {
    // sobrescreve SEM guarda: o init script do beforeEach roda antes e ja
    // gravou o seed, entao a condicao if (!localStorage...) nao faria nada
    const linhas = ['lista longa'];
    for (let i = 1; i <= 40; i++) linhas.push(`[ ] tarefa ${i}`);
    s.notes.t1[0].text = linhas.join('\n');
    localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);

  await page.goto('/');
  await page.waitForTimeout(1600);
  await page.click('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(600);

  const el = page.locator('#tasks-page-list');
  // o conteudo precisa mesmo transbordar, senao o teste nao prova nada
  await expect.poll(() => el.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);

  const cs = await el.evaluate((e) => {
    const c = getComputedStyle(e);
    return { largura: c.scrollbarWidth, overflow: c.overflowY };
  });
  expect(cs.largura).toBe('none');
  expect(cs.overflow).toBe('auto');   // rola, so nao desenha a barra

  await el.evaluate((e) => e.scrollBy(0, 300));
  await page.waitForTimeout(200);
  expect(await el.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
});

// O banner de Tarefas segue o mesmo padrao das demais paginas: icone em tile
// + titulo (+ contador). Antes so tinha o texto, e ficava destoado da Diaria e
// da conversa com a IA, que mostram o icone ao lado do nome.
test('cabecalho de tarefas tem icone em tile, titulo e contador', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1600);
  await page.click('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(600);

  const header = page.locator('#tasks-page .cozy-banner');
  await expect(header.locator('.page-icon svg')).toHaveCount(1);
  await expect(header.locator('#tasks-back')).toHaveCount(1);
  await expect(header.locator('.chat-name')).toHaveText('Tarefas');
  await expect(header.locator('#tasks-count')).toBeVisible();

  const tam = await header.locator('.page-icon').evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(tam.w).toBeGreaterThanOrEqual(30);
  expect(tam.h).toBeGreaterThanOrEqual(30);
});

// A seta de voltar ficava dentro de `if (expTasks)`, mas #explorer-tasks nao
// existe mais no DOM: guarda sempre falsa, botao sem listener nenhum. E era
// `mobile-only`, entao no desktop nao aparecia. Agora aparece nos dois E volta.
test('seta de voltar aparece no desktop e volta para a aba Cadernos', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1600);
  await page.click('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(600);

  const seta = page.locator('#tasks-back');
  await expect(seta).toBeVisible();
  // precisa estar no topo: sem isso a sidebar do celular cobre o banner
  const topo = await seta.evaluate((e) => e.getBoundingClientRect().top);
  expect(topo).toBeGreaterThanOrEqual(0);

  await seta.click();
  await page.waitForTimeout(500);
  await expect(page.locator('#tasks-page')).toBeHidden();
  // a aba Tarefas nao pode ficar acesa com a pagina ja fechada
  const ativas = await page.locator('.page-switch.active').evaluateAll((els) => els.map((e) => e.dataset.page));
  expect(ativas).toEqual(['notes']);
});

// `.btn-icon` e `mobile-only` na epoca: so aparecia ABAIXO de 760px, entao estes
// testes rodam num viewport de celular.
test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  // O botao de voltar usava a classe `.btn-icon`, que NAO existia no CSS:
  // caia no <button> cru do navegador (8x21px, sem area de toque, glifo de
  // texto). Precisa ser um circulo de verdade com SVG.
  test('botao de voltar e um circulo real com seta SVG', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1600);
    await page.click('.page-switch[data-page="tasks"]');
    await page.waitForTimeout(600);

    const b = page.locator('#tasks-back');
    await expect(b).toBeVisible();
    await expect(b.locator('svg')).toHaveCount(1);

    const info = await b.evaluate((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), raio: cs.borderRadius };
    });
    expect(info.w).toBeGreaterThanOrEqual(40);
    expect(info.h).toBeGreaterThanOrEqual(40);
    expect(info.raio).toBe('50%');
  });

  // O contador do cabecalho tinha fundo rgba(255,255,255,.6) fixo e texto
  // --text-dim: no tema escuro virava chip claro e o contraste ficava em 3.89,
  // abaixo de 4.5. Agora usa tokens e passa AA.
  test('contador do cabecalho tem contraste AA no tema escuro', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1600);
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await page.click('.page-switch[data-page="tasks"]');
    await page.waitForTimeout(600);

    const r = await page.locator('#tasks-count').evaluate((e) => {
      const cs = getComputedStyle(e);
      const g = (v) => (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const L = (c) => { const [r1, g1, b1] = c; return (0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1) / 255; };
      const a = L(g(cs.color)), bg = L(g(cs.backgroundColor));
      const [hi, lo] = a > bg ? [a, bg] : [bg, a];
      return { razao: +(((hi + 0.05) / (lo + 0.05)).toFixed(2)), fundo: cs.backgroundColor };
    });
    expect(r.razao).toBeGreaterThanOrEqual(4.5);
    // fundo escuro de verdade, nao o branco fixo de antes
    const [rr, gg, bb] = (r.fundo.match(/[\d.]+/g) || []).map(Number);
    expect((rr + gg + bb) / 3).toBeLessThan(128);
  });

  // No celular as tres abas precisam se comportar igual: revelam o canvas e a
  // pagina ativa ocupa o topo. `showTasksPage()` nao chamava
  // `_mobileRevealCanvas()` (as outras abas passam por showWorkspaceTab, que
  // ja faz), entao Tarefas abria "por tras" da sidebar e com o conteudo
  // deslocado - era a pagina com o formato diferente, e nao a Diaria.
  //
  // A tabbar foi removida do app. Nao se compara a posicao de `#chat-header`
  // entre as abas: ele e o banner compartilhado, que tem conteudo na Diaria e
  // fica colapsado (altura 0) em Tarefas. O que vale e o canvas e a pagina.
  test('tarefas revela o canvas como as outras abas', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1600);

    const medir = (id) => page.evaluate((pageId) => {
      const el = document.getElementById(pageId);
      const r = el?.getBoundingClientRect();
      return {
        showChat: document.getElementById('app').classList.contains('show-chat'),
        // o canvas tem que estar à frente: a sidebar fora da tela
        sidebarX: Math.round(document.querySelector('.sidebar').getBoundingClientRect().right),
        visivel: !!el && !el.classList.contains('hidden') && !!r && r.width > 0,
        top: r ? Math.round(r.top) : null,
      };
    }, id);

    await page.click('.page-switch[data-page="tasks"]');
    await page.waitForTimeout(800);
    const tasks = await medir('tasks-page');
    expect(tasks.showChat).toBe(true);
    expect(tasks.sidebarX, 'a sidebar saiu da frente do canvas').toBeLessThanOrEqual(0);
    expect(tasks.visivel, 'a página de Tarefas está visível').toBe(true);
    expect(tasks.top, 'Tarefas colada no topo').toBeLessThanOrEqual(12);

    // volta ao explorer antes de trocar de aba (com show-chat a sidebar esta
    // coberta e o .page-switch nao e clicavel)
    await page.evaluate(() => document.getElementById('app').classList.remove('show-chat'));
    await page.waitForTimeout(300);
    await page.click('.page-switch[data-page="daily"]');
    await page.waitForTimeout(800);
    const daily = await medir('daily-page');

    expect(daily.showChat).toBe(true);
    expect(daily.sidebarX, 'a sidebar saiu da frente do canvas na Diária').toBeLessThanOrEqual(0);
    expect(daily.visivel, 'a página da Diária está visível').toBe(true);
    // a Diária tem o banner acima, mas não fica atrás da sidebar nem deslocada
    expect(daily.top, 'Diária dentro da tela').toBeLessThanOrEqual(80);
  });
});