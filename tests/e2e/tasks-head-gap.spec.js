const { test, expect } = require('@playwright/test');

// Respiro entre a faixa colorida do hover e o conteúdo do accordion,
// mais o gradiente top-down.
//
// ATENÇÃO à medição: o gap certo é entre a base do CABEÇALHO e o topo do
// PRIMEIRO CONTEÚDO (o form, ou a primeira .task-row). Medir contra o
// `.task-list` dá 0 porque o padding-top da lista fica DENTRO dela — a
// lista encosta no cabeçalho, e o respiro aparece entre o topo da lista e
// a primeira linha. Medido: gapHeadRow 8px.
//
// E o app precisa estar MONTADO: sem `addInitScript` semeando o usuário,
// `#app` fica `display:none` e toda a cadeia mede h:0 (medição inválida —
// foi o que aconteceu nos probes anteriores).
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000 } },
  notes: { t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'l\n[ ] A\n[ ] B', ts: Date.now() - 50000, images: [], reactions: {} }] },
  ui: { expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} }, tasksOwn: [
    { id: 'o1', text: 't1', done: false, createdAt: Date.now() },
  ] },
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
});

test('respiro da faixa do hover ate o primeiro conteudo dos DOIS accordions', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.NoteThread.UI.showTasksPage(); return true; });
  await page.waitForTimeout(700);

  const appVisivel = await page.evaluate(() => getComputedStyle(document.getElementById('app')).display !== 'none');
  expect(appVisivel, 'app montado (sem isto a medição é inválida)').toBe(true);

  const r = await page.evaluate(() => {
    const mede = (accSel) => {
      const acc = document.querySelector(accSel);
      const head = acc.querySelector('.task-acc-head');
      const inner = acc.querySelector('.task-acc-inner');
      // o primeiro conteúdo de verdade: o form (próprias) ou a primeira
      // linha da lista (conversas). Medir o container .task-list daria 0
      // porque o padding-top dele é interno.
      const form = inner.querySelector('.task-new');
      const row = inner.querySelector('.task-row');
      const conteudo = form || row;
      const hb = head.getBoundingClientRect();
      const cb = conteudo.getBoundingClientRect();
      return {
        qual: form ? 'form' : 'primeira-tarefa',
        headPaddingBottom: getComputedStyle(head).paddingBottom,
        gap: Math.round(cb.top - hb.bottom),
        headH: Math.round(hb.height),
      };
    };
    return { own: mede('.task-acc[data-acc="own"]'), threads: mede('.task-acc[data-acc="threads"]') };
  });
  console.log('RESPIRO=' + JSON.stringify(r));
  expect(r.own.headPaddingBottom, 'padding-bottom aumentado').toBe('20px');
  expect(r.own.gap, 'input tem folga da faixa').toBeGreaterThanOrEqual(8);
  expect(r.threads.gap, 'primeira tarefa tem folga da faixa').toBeGreaterThanOrEqual(8);
});

test('hover e :active usam gradiente top-down', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const css = await (await fetch('/styles/03b-chat-bolhas.css', { cache: 'no-store' })).text();
    const hover = css.match(/\.task-acc-head:hover\s*\{([^}]*)\}/);
    const active = css.match(/\.task-acc-head:active\s*\{([^}]*)\}/);
    return { hover: hover ? hover[1].trim() : null, active: active ? active[1].trim() : null };
  });
  console.log('GRAD=' + JSON.stringify(r, null, 1));
  expect(r.hover, 'hover tem gradiente').toMatch(/linear-gradient\(to bottom/);
  expect(r.hover, 'gradiente some no fim').toMatch(/transparent 100%/);
  expect(r.active, 'active tem gradiente').toMatch(/linear-gradient\(to bottom/);
  expect(r.active, 'active ainda sem scale').not.toMatch(/transform:\s*scale/);
});
