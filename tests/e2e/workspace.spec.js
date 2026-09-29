// E2E: workspace — páginas via seletor da sidebar (Cadernos · IA · Diária) (v1.12.0)
// Cobre: troca de páginas (aria-selected), Diária persistente após reload,
// IA sem chave (toast, sem chamada à API), swipe programático e o toggle
// lupa ↔ busca com fade out no NOVO (e a lupa parada no lugar).
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [{ id: 'n1', threadId: 't1', user: 'me', text: 'leite', ts: Date.now() - 50000, clientId: 'c1' }] },
  ui: { expanded: {}, sounds: { enabled: false } },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    // semeia apenas na 1ª carga — o reload precisa preservar o que o teste salvou
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

test('seletor de páginas: IA, Diária e volta para Cadernos', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const switcher = page.locator('.page-switcher');
  await expect(switcher).toBeVisible();
  // abaixo da marca do explorador e acima da linha do NOVO (ordem no DOM)
  const brandY = await page.locator('.explorer-brand').evaluate((el) => el.getBoundingClientRect().bottom);
  const switcherY = await switcher.evaluate((el) => el.getBoundingClientRect().top);
  const rowY = await page.locator('.explorer-row').evaluate((el) => el.getBoundingClientRect().top);
  expect(switcherY).toBeGreaterThanOrEqual(brandY - 1);
  expect(rowY).toBeGreaterThanOrEqual(switcherY);

  await page.click('.page-switch[data-page="ai"]');
  await expect(page.locator('#ai-page')).toBeVisible();
  await expect(page.locator('.page-switch[data-page="ai"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#messages')).toBeHidden();
  // as abas antigas dentro da conversa não existem mais
  await expect(page.locator('#workspace-tabs')).toHaveCount(0);

  await page.click('.page-switch[data-page="daily"]');
  await expect(page.locator('#daily-page')).toBeVisible();
  // criação via modal (o input rápido da página foi removido)
  await page.click('#daily-new-task');
  await expect(page.locator('#modal')).toBeVisible();
  await page.fill('#dly-text', 'exercício 30 min');
  await page.click('#modal-ok');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('.daily-item')).toHaveCount(1);
  await page.click('.daily-item .daily-check');
  await expect(page.locator('.daily-item.done')).toHaveCount(1);
  await expect(page.locator('#daily-progress-bar')).toHaveCSS('width', /[1-9]/);

  await page.click('.page-switch[data-page="notes"]');
  await expect(page.locator('#messages')).toBeVisible();
  await expect(page.locator('#daily-page')).toBeHidden();
  await expect(page.locator('.page-switch[data-page="notes"]')).toHaveAttribute('aria-selected', 'true');
});

test('lupa: NOVO some em fade, painel abre e a lupa não se move', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const lupa = page.locator('#btn-explorer-search');
  const novo = page.locator('#btn-new-thread');
  const panel = page.locator('#explorer-search-panel');
  const boxBefore = await lupa.boundingBox();

  await lupa.click();
  await expect(page.locator('.explorer-row.searching')).toHaveCount(1);
  await expect(panel).toHaveClass(/open/);
  await expect(novo).toHaveCSS('opacity', '0');
  await expect(novo).toBeHidden(); // visibility:hidden após o fade
  // lupa no mesmo lugar (x e y inalterados pelo toggle)
  const boxOpen = await lupa.boundingBox();
  expect(Math.abs(boxOpen.x - boxBefore.x)).toBeLessThan(1);
  expect(Math.abs(boxOpen.y - boxBefore.y)).toBeLessThan(1);
  // foco vai para o campo de busca
  await expect(page.locator('#search-input')).toBeFocused();

  await lupa.click();
  await expect(panel).not.toHaveClass(/open/);
  await expect(novo).toBeVisible();
  await expect(novo).toHaveCSS('opacity', '1');
});

test('diária: rotina persiste e o check do dia não vaza para "amanhã"', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="daily"]');
  await page.click('#daily-new-task');
  await page.fill('#dly-text', 'ler 10 páginas');
  await page.click('#modal-ok');
  await page.click('.daily-item .daily-check');
  await expect(page.locator('.daily-item.done')).toHaveCount(1);
  await page.reload();
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="daily"]');
  // item sobrevive ao reload (rotina fixa) e continua marcado (mesmo dia)
  await expect(page.locator('.daily-item')).toHaveCount(1);
  await expect(page.locator('.daily-item.done')).toHaveCount(1);
  // simulando o dia seguinte (meia-noite limpa o log de checks): item fica desmarcado
  // a rotina mora no bucket da conta (v1.13.3), não mais na raiz
  await page.evaluate(() => {
    const KEY = 'notethread.v2';
    const root = JSON.parse(localStorage.getItem(KEY));
    const bucketKey = KEY + '::u::' + (root.user.id || root.user.mail);
    const b = JSON.parse(localStorage.getItem(bucketKey));
    b.scope.dailyRoutine.log = {};
    localStorage.setItem(bucketKey, JSON.stringify(b));
  });
  await page.reload();
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="daily"]');
  await expect(page.locator('.daily-item')).toHaveCount(1);
  await expect(page.locator('.daily-item.done')).toHaveCount(0);
});

test('campo da IA é o mesmo componente do composer da conversa', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // mede pílula, campo e os dois botões (caixa + glifo) de um seletor de página
  const measure = (scope, attachId, sendId, fieldId) => page.evaluate(([scope, attachId, sendId, fieldId]) => {
    const root = document.querySelector(scope);
    const pill = getComputedStyle(root);
    const btn = document.getElementById(sendId);
    const bc = getComputedStyle(btn);
    const svgStyle = (sel) => {
      const c = getComputedStyle(root.querySelector(sel));
      return `${c.width} fill=${c.fill} stroke=${c.stroke} sw=${c.strokeWidth}`;
    };
    return {
      radius: pill.borderRadius, bg: pill.backgroundColor, border: pill.border, pad: pill.padding,
      h: +root.getBoundingClientRect().height.toFixed(2),
      left: getComputedStyle(document.getElementById(attachId)).borderRadius,
      leftH: +document.getElementById(attachId).getBoundingClientRect().height.toFixed(2),
      // o GLIFO também tem que ser o mesmo: antes os svgs da IA vinham com fill
      // preto (sólido) e a 18px, o do composer é traço currentColor a 20px
      leftSvg: svgStyle('.cozy-attach svg'), rightSvg: svgStyle('.cozy-send svg'),
      right: bc.borderRadius, rightH: +btn.getBoundingClientRect().height.toFixed(2),
      rightBg: bc.backgroundColor, rightColor: bc.color, rightShadow: bc.boxShadow,
      fieldMinH: getComputedStyle(document.getElementById(fieldId)).minHeight,
    };
  }, [scope, attachId, sendId, fieldId]);

  // abre uma conversa para ter o composer de referência
  await page.locator('.tnode').first().click();
  await expect(page.locator('.composer .cozy-input-row')).toBeVisible();
  // com texto nos dois, os botões estão em modo envio — comparação justa
  await page.fill('#composer-input', 'ola');
  await page.waitForTimeout(200);
  const conv = await measure('.composer .cozy-input-row', 'btn-attach', 'btn-send', 'composer-input');

  await page.click('.page-switch[data-page="ai"]');
  await expect(page.locator('.ai-input-row')).toBeVisible();
  await page.fill('#ai-prompt', 'ola');
  await page.waitForTimeout(200);
  const ai = await measure('.ai-input-row', 'ai-mic', 'ai-send', 'ai-prompt');

  // idênticos: pílula, campo, os dois botões (tamanho, cor, sombra) e os glifos
  expect(ai).toEqual(conv);
  // o glifo é traço tematizado, nunca sólido preto
  expect(ai.leftSvg).toContain('fill=none');
  expect(ai.rightSvg).toContain('fill=none');
  expect(ai.rightSvg).toContain('20px');
  // o textarea fica transparente (a pílula é o que tem borda)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('ai-prompt')).borderWidth)).toBe('0px');
  // e sem outline retangular: o foco é marcado na pílula
  await page.click('#ai-prompt');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('ai-prompt')).outlineStyle)).toBe('none');
});

test('IA sem chave: pede a chave e não chama a API', async ({ page }) => {
  let geminiCalls = 0;
  page.on('request', (r) => { if (r.url().includes('generativelanguage')) geminiCalls++; });
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.click('.page-switch[data-page="ai"]');
  await page.fill('#ai-prompt', 'me ajude a planejar o dia');
  await page.click('#ai-send');
  await expect(page.locator('.app-toast')).toContainText('chave');
  await page.waitForTimeout(800);
  expect(geminiCalls).toBe(0);
  // histórico permanece vazio (estado inicial)
  await expect(page.locator('#ai-messages .workspace-empty')).toBeVisible();
});

test('workspaceSwipe alterna páginas nos dois sentidos', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  await expect(page.locator('#ai-page')).toBeVisible();
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  await expect(page.locator('#reminders-page')).toBeVisible();
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  await expect(page.locator('#daily-page')).toBeVisible();
  // última página: não passa
  const moved = await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(1));
  expect(moved).toBe(false);
  await page.evaluate(() => window.NoteThread.UI.workspaceSwipe(-1));
  await expect(page.locator('#reminders-page')).toBeVisible();
});
