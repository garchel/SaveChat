import { test, expect } from '@playwright/test';

// Regressões do popover de configurações:
// - a grade de padrões e o botão "restaurar" eram cortados pela largura do
//   popover (regra genérica de botão + colunas 1fr que não encolhiam)
// - os menus precisam fechar no mesmo "voltar" (botão do aparelho/gesto) e
//   no clique fora, não só o menu de configurações
const vis = (page, id) => page.evaluate(i => {
  const e = document.getElementById(i);
  return !!e && !e.classList.contains('hidden');
}, id);

const abrirSettings = async (page) => {
  await page.click('#profile-btn');
  await page.waitForTimeout(250);
  await page.click('#profile-config');
  await expect.poll(() => vis(page, 'settings-popover')).toBe(true);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const { Store } = await import('/js/store.js');
    Store.load();
    Store.setUser({ name: 'Ana', mail: 'ana@note.app' });
    // sem nome definido o modal do primeiro login cobre o app e bloqueia cliques
    Store.data.ui = Store.data.ui || {};
    Store.data.ui.mascot = { nameSet: true };
    Store.save();
  });
  await page.reload();
  await page.waitForTimeout(2200);
});

test.describe('layout do menu de configurações', () => {
  test('padrões e restaurar cabem dentro do popover, sem corte horizontal', async ({ page }) => {
    await abrirSettings(page);

    const medidas = await page.evaluate(() => {
      const pop = document.getElementById('settings-popover');
      const r = pop.getBoundingClientRect();
      const itens = [...pop.querySelectorAll('.bg-pat, #pat-size-reset')].map((el) => {
        const b = el.getBoundingClientRect();
        return { nome: el.id || el.dataset.bg || '?', left: b.left, right: b.right, width: b.width };
      });
      const reset = document.getElementById('pat-size-reset').getBoundingClientRect();
      const nomes = [...pop.querySelectorAll('.bg-pat .bp-name')].map((el) => ({
        nome: el.textContent,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      return {
        popLeft: r.left,
        popRight: r.right,
        scrollWidth: pop.scrollWidth,
        clientWidth: pop.clientWidth,
        itens,
        resetWidth: reset.width,
        nomes,
      };
    });

    // nada pode passar da largura útil do popover (overflow-x esconde o corte)
    expect(medidas.scrollWidth).toBeLessThanOrEqual(medidas.clientWidth + 1);
    for (const item of medidas.itens) {
      expect(item.left, `${item.nome} começou fora do popover`).toBeGreaterThanOrEqual(medidas.popLeft - 1);
      expect(item.right, `${item.nome} passou da borda direita`).toBeLessThanOrEqual(medidas.popRight + 1);
    }
    // o reset não pode herdar width:100% da regra genérica de botão
    expect(medidas.resetWidth).toBeLessThan(70);
    // nenhum rótulo pode ser truncado (o texto tem que caber na coluna)
    for (const nome of medidas.nomes) {
      expect(nome.scrollWidth, `rótulo "${nome.nome}" truncado`).toBeLessThanOrEqual(nome.clientWidth + 1);
    }
  });
});

test.describe('fechar menus no voltar e no clique fora', () => {
  test('voltar fecha configurações', async ({ page }) => {
    await abrirSettings(page);
    await page.goBack();
    await expect.poll(() => vis(page, 'settings-popover')).toBe(false);
  });

  test('voltar fecha o menu do perfil', async ({ page }) => {
    await page.click('#profile-btn');
    await expect.poll(() => vis(page, 'profile-popover')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'profile-popover')).toBe(false);
  });

  test('voltar fecha o painel do mascote', async ({ page }) => {
    await page.click('#profile-btn');
    await page.waitForTimeout(250);
    await page.click('#profile-mascot');
    await expect.poll(() => vis(page, 'mascot-popover')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'mascot-popover')).toBe(false);
  });

  test('voltar fecha o popover de menções', async ({ page }) => {
    await page.evaluate(() => {
      window.NoteThread.UI.toggleBacklinksPopover([
        { tid: 'outra', th: { name: 'Outra conversa' }, n: { clientId: 'c1', text: 'oi' } },
      ]);
    });
    await expect.poll(() => vis(page, 'backlinks-popover')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'backlinks-popover')).toBe(false);
  });

  test('clicar fora fecha configurações', async ({ page }) => {
    await abrirSettings(page);
    await page.mouse.click(700, 20);
    await expect.poll(() => vis(page, 'settings-popover')).toBe(false);
  });

  test('clicar fora fecha o popover de menções', async ({ page }) => {
    await page.evaluate(() => {
      window.NoteThread.UI.toggleBacklinksPopover([
        { tid: 'outra', th: { name: 'Outra conversa' }, n: { clientId: 'c1', text: 'oi' } },
      ]);
    });
    await expect.poll(() => vis(page, 'backlinks-popover')).toBe(true);
    await page.mouse.click(700, 20);
    await expect.poll(() => vis(page, 'backlinks-popover')).toBe(false);
  });
});
