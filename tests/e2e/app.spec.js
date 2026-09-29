// A6.6 — fluxo crítico: login (seed) → criar thread → enviar nota com checkbox
// → marcar → recarregar → estado persiste (offline-first via localStorage).
const { test, expect } = require('@playwright/test');

const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: {}, folders: {}, notes: {},
  ui: { expanded: {}, sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript((s) => {
    // semeia apenas na 1ª carga; preserva o estado criado pelo teste após reload
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify(s));
    }
  }, seed);
});

test('sem conversa selecionada: placeholder aparece e some ao abrir conversa', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();
  // sem threads no seed: placeholder visível no canvas
  const ph = page.locator('#no-thread');
  await expect(ph).toBeVisible();
  await expect(ph.locator('.nt-title')).toContainText('Nenhuma conversa selecionada');
  // CTA abre o modal unificado de criação
  await page.click('#nt-new');
  await expect(page.locator('#modal')).toBeVisible();
  await page.click('#modal-cancel');
  await expect(page.locator('#modal')).toBeHidden();
  // segundo CTA leva à conversa com a IA (com título próprio + tooltip ⓘ)
  await page.click('#nt-open-ai');
  await expect(page.locator('#ai-page')).toBeVisible();
  await expect(page.locator('#chat-name')).toHaveText('Conversa com a IA');
  await expect(page.locator('#ai-info-btn')).toBeVisible();
  await page.click('#ai-info-btn');
  await expect(page.locator('#ai-info-tip')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  // criar conversa esconde o placeholder (canvas volta a ser a conversa)
  await page.click('.page-switch[data-page="notes"]');
  await page.evaluate(() => document.getElementById('btn-new-thread').click());
  await expect(page.locator('#modal')).toBeVisible();
  await page.fill('#nt-name', 'Placeholder some');
  await page.click('.emoji-opt');
  await page.click('#modal-ok');
  await expect(page.locator('#chat-name')).toHaveText('Placeholder some');
  await expect(ph).toBeHidden();
});

test('os 2 botões do aviso "Nenhuma conversa selecionada" têm a mesma altura', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#no-thread')).toBeVisible();

  // em telas estreitas os botões quebram de linha — era aí que a caixa do
  // primeiro encolhia 1px e os dois ficavam com alturas diferentes
  for (const w of [1280, 420, 360, 320]) {
    await page.setViewportSize({ width: w, height: 800 });
    const h = await page.evaluate(() => {
      const a = document.getElementById('nt-new').getBoundingClientRect().height;
      const b = document.getElementById('nt-open-ai').getBoundingClientRect().height;
      return { a: +a.toFixed(2), b: +b.toFixed(2) };
    });
    expect(h.a, `largura ${w}`).toBe(h.b);
  }
});

test('fluxo crítico: criar thread → nota com checkbox → marcar → persiste após reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);

  // logado via seed → app visível
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#btn-new-thread')).toBeVisible();

  // cria uma thread (via JS click para evitar hit-test flakiness após modularização)
  await page.evaluate(() => document.getElementById('btn-new-thread').click());
  await expect(page.locator('#modal')).toBeVisible();
  await page.fill('#nt-name', 'E2E Thread');
  // escolhe um emoji do picker (primeiro disponível)
  await page.click('.emoji-opt');
  await page.click('#modal-ok');
  await expect(page.locator('#chat-name')).toHaveText('E2E Thread');

  // envia nota com checklist
  const composer = page.locator('#composer-input');
  await expect(composer).toBeEnabled();
  await composer.fill('[ ] comprar leite');
  await composer.press('Enter');
  const bubble = page.locator('.bubble').last();
  await expect(bubble).toContainText('comprar leite');

  // marca a checkbox
  const chk = bubble.locator('.md-check input[type="checkbox"]');
  await expect(chk).toBeVisible();
  await chk.click();
  await expect(chk).toBeChecked();

  // recarrega: estado persiste via localStorage
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('.tnode', { hasText: 'E2E Thread' }).first().click();
  const chk2 = page.locator('.bubble .md-check input[type="checkbox"]').first();
  await expect(chk2).toBeChecked();
  await expect(page.locator('.bubble').last()).toContainText('comprar leite');
});

test('menção @ insere token e renderiza chip clicável', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#btn-new-thread')).toBeVisible();

  // cria thread alvo da menção (click via JS no botão OK: mesmo gesto do fluxo
  // crítico; o click() nativo pode bater na race do modal em runners lentos)
  await page.evaluate(() => document.getElementById('btn-new-thread').click());
  await page.fill('#nt-name', 'Alvo');
  await page.evaluate(() => document.getElementById('modal-ok').click());
  await expect(page.locator('#chat-name')).toHaveText('Alvo');
  await expect(page.locator('#modal')).toBeHidden();

  // cria thread principal e menciona a Alvo (modal unificado: Conversa já é o padrão)
  await page.evaluate(() => document.getElementById('btn-new-thread').click());
  await page.fill('#nt-name', 'Principal');
  await page.evaluate(() => document.getElementById('modal-ok').click());
  await expect(page.locator('#chat-name')).toHaveText('Principal');
  await expect(page.locator('#modal')).toBeHidden();

  const composer = page.locator('#composer-input');
  // editor WYSIWYG: o dropdown de menções depende do caret real — digitação
  // com teclado (não fill(), que não reposiciona a seleção dentro do editor)
  await composer.click();
  await page.keyboard.type('veja @', { delay: 30 });
  // dropdown de menções aparece
  const dd = page.locator('#mention-dd');
  await expect(dd).toBeVisible();
  await dd.locator('.mention-opt', { hasText: 'Alvo' }).click();
  // chip entra no editor; o token @[Alvo](t:id) só existe no markdown serializado
  await expect(composer.locator('[data-mention]', { hasText: 'Alvo' })).toBeVisible();
  await composer.press('Enter');

  // chip renderizado na bolha
  const chip = page.locator('.bubble .mention', { hasText: 'Alvo' }).last();
  await expect(chip).toBeVisible();

  // 1 clique = preview popover; botão "Abrir nota" = abre a thread
  await chip.click();
  await expect(page.locator('#note-preview')).toBeVisible();
  await expect(page.locator('#np-thread')).toHaveText('Alvo');
  await page.click('#np-open');
  await expect(page.locator('#chat-name')).toHaveText('Alvo');
});
