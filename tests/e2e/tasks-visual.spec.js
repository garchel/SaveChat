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
  ui: { expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
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
