const { test, expect } = require('@playwright/test');

// Prova dos 2 bugs das capturas:
//  1. FLICK: no :active o cabecalho escalava 0.96 e a faixa de fundo
//     encolhia ~10px de cada lado (visivel na captura). Agora o feedback
//     escurece o fundo SEM transform.
//  2. EMPURRAO: os accordions sao itens de um flex column e encolhiam
//     (flex-shrink default 1) quando o de baixo abria — a lacuna de 12px
//     entre os cartoes era comida. Agora flex-shrink: 0.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: {
    t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000 },
    t2: { id: 't2', name: 'Trabalho', folderId: null, created: Date.now() - 80000 },
  },
  notes: {
    t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'l\n[ ] A\n[ ] B\n[ ] C\n[ ] D\n[ ] E', ts: Date.now() - 50000, images: [], reactions: {} }],
    t2: [{ clientId: 'n2', threadId: 't2', user: 'me', text: 'j\n[ ] email\n[ ] relatorio', ts: Date.now() - 40000, images: [], reactions: {} }],
  },
  ui: { expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} }, tasksOwn: [
    { id: 'o1', text: 't1', done: false, createdAt: Date.now() },
    { id: 'o2', text: 't2', done: false, createdAt: Date.now() },
    { id: 'o3', text: 't3', done: false, createdAt: Date.now() },
  ] },
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
});

async function abrirTarefas(page) {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.tap('.page-switch[data-page="tasks"]');
  await page.waitForTimeout(700);
}

test('BUG 1: :active nao encolhe o cabecalho (sem transform)', async ({ page }) => {
  await abrirTarefas(page);
  const r = await page.evaluate(() => {
    const head = document.getElementById('task-acc-own');
    const cs = getComputedStyle(head);
    // o valor COMPUTADO de transform no estado atual
    return { transformAtual: cs.transform };
  });
  // estado normal: sem transform
  expect(r.transformAtual, 'sem transform no estado normal').toBe('none');

  // e a regra :active nao pode MAIS escalar
  const regra = await page.evaluate(async () => {
    const css = await (await fetch('/styles/03b-chat-bolhas.css', { cache: 'no-store' })).text();
    const m = css.match(/\.task-acc-head:active\s*\{([^}]*)\}/);
    return m ? m[1].trim() : null;
  });
  console.log('REGRA_ACTIVE=' + JSON.stringify(regra));
  expect(regra, 'regra :active existe').toBeTruthy();
  expect(regra, ':active nao usa transform: scale').not.toMatch(/transform:\s*scale/);
  expect(regra, ':active escurece o fundo').toMatch(/background/);
});

test('BUG 2: accordions nao encolhem (flex-shrink: 0)', async ({ page }) => {
  await abrirTarefas(page);
  const r = await page.evaluate(() => {
    const accs = [...document.querySelectorAll('.task-acc')];
    return accs.map((a) => ({
      acc: a.dataset.acc,
      flexShrink: getComputedStyle(a).flexShrink,
      paiDisplay: getComputedStyle(a.parentElement).display,
    }));
  });
  console.log('FLEX=' + JSON.stringify(r));
  expect(r[0].paiDisplay, 'o pai é flex column').toBe('flex');
  for (const a of r) {
    expect(a.flexShrink, `accordion ${a.acc} nao encolhe`).toBe('0');
  }

  // e a lacuna entre os cartões sobrevive à animação
  const lacunas = await page.evaluate(async () => {
    const own = document.querySelector('.task-acc[data-acc="own"]');
    const th = document.querySelector('.task-acc[data-acc="threads"]');
    const out = [];
    const gap = () => {
      const a = own.getBoundingClientRect();
      const b = th.getBoundingClientRect();
      return { gap: Math.round(b.top - a.bottom), ownH: Math.round(a.height) };
    };
    out.push(Object.assign({ rot: 'antes' }, gap()));
    document.getElementById('task-acc-threads').click();
    for (let i = 1; i <= 8; i++) {
      await new Promise((r) => setTimeout(r, 45));
      out.push(Object.assign({ rot: 't' + (i * 45) }, gap()));
    }
    return out;
  });
  console.log('LACUNAS=' + JSON.stringify(lacunas));
  for (const l of lacunas) {
    expect(l.gap, `lacuna preservada em ${l.rot}`).toBeGreaterThanOrEqual(11);
  }
});
