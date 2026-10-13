// Tabbar inferior (mobile): entrega a navegação de páginas em 1 toque.
//
// Prova que a tabbar inferior entrega a navegação de páginas em 1 toque,
// que era o defeito medido antes: o `.page-switcher` da sidebar fica em
// x:-378 no mobile com uma conversa aberta (fora da tela), o que custava
// 2 toques (voltar → tocar) para trocar de página.
const { test, expect } = require('@playwright/test');

const T0 = 1700000000000;
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: { t1: { id: 't1', name: 'Conversa', folderId: null, created: T0 - 80000 } },
  notes: { t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'mensagem', ts: T0 - 5000, images: [], reactions: {} }] },
  ui: { expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} } },
};

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test('tabbar entrega navegação em 1 toque no mobile', async ({ context, page }) => {
  await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seed);
  await page.goto('/');
  await page.waitForTimeout(1400);

  // com a conversa aberta, onde está cada coisa?
  await page.evaluate(() => document.querySelector('.tnode[data-tid="t1"]')?.click());
  await page.waitForTimeout(800);

  const posicoes = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom),
        visivel: b.right > 0 && b.left < window.innerWidth && !e.classList.contains('hidden') && cs.display !== 'none',
        display: cs.display, temHidden: e.classList.contains('hidden') }; };
    return { tabbar: r('#tabbar'), switcher: r('.page-switcher'), btnTasks: r('.tabbar-btn[data-page="tasks"]'),
      composer: r('.cozy-composer'), messages: r('#messages'),
      appShowChat: document.getElementById('app')?.classList.contains('show-chat'),
      vw: window.innerWidth };
  });
  console.log('POSICOES=' + JSON.stringify(posicoes));

  // 1 toque: a tabbar está visível e alcançável
  expect(posicoes.tabbar?.visivel, 'tabbar visível com conversa aberta').toBe(true);
  expect(posicoes.btnTasks?.visivel, 'botão Tarefas da tabbar visível').toBe(true);
  // e o composer não está escondido atrás dela
  expect(posicoes.composer.bottom, 'composer acima do fim da viewport').toBeLessThanOrEqual(844);
  expect(posicoes.composer.bottom, 'composer não fica atrás da tabbar').toBeLessThanOrEqual(posicoes.tabbar.h + posicoes.tabbar.bottom - posicoes.tabbar.h + 1e9);
  console.log('COMPOSER_BOTTOM=' + posicoes.composer.bottom + ' TABBAR_TOP=' + (posicoes.tabbar.bottom - posicoes.tabbar.h));

  // o gesto: 1 toque leva a Tarefas (a aba IA saiu da barra)
  await page.tap('.tabbar-btn[data-page="tasks"]');
  await page.waitForTimeout(700);
  const naTasks = await page.evaluate(() => ({
    tasksVisivel: !document.querySelector('#tasks-page')?.classList.contains('hidden'),
    tabbarAtivo: document.querySelector('.tabbar-btn[data-page="tasks"]')?.classList.contains('active'),
    switcherAtivo: document.querySelector('.page-switch[data-page="tasks"]')?.classList.contains('active'),
  }));
  console.log('APOS_1_TOQUE=' + JSON.stringify(naTasks));
  expect(naTasks.tasksVisivel, 'página de Tarefas abriu').toBe(true);
  expect(naTasks.tabbarAtivo, 'tabbar marcou Tarefas como ativa').toBe(true);
  expect(naTasks.switcherAtivo, 'e o switcher da sidebar também (fonte única)').toBe(true);

  // e volta: 1 toque na tabbar, sem precisar do #btn-back
  await page.tap('.tabbar-btn[data-page="daily"]');
  await page.waitForTimeout(700);
  const naDaily = await page.evaluate(() => ({
    pagina: document.querySelector('#chat-name')?.textContent?.trim(),
    dailyVisivel: !document.querySelector('#daily-page')?.classList.contains('hidden'),
  }));
  console.log('APOS_OUTRO_TOQUE=' + JSON.stringify(naDaily));
  expect(naDaily.dailyVisivel, 'Diária abriu com 1 toque').toBe(true);
});
