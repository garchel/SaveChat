// Mascote: posição no explorador, rótulo = nome escolhido e o modal de
// primeiro login.
const { test, expect } = require('@playwright/test');

const base = (ui) => ({
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: {
    fav: { id: 'fav', name: 'Favorita', folderId: null, favorite: true, created: 1 },
    solta: { id: 'solta', name: 'Solta', folderId: null, favorite: false, created: 2 },
  },
  folders: {}, notes: {}, ui,
});

async function abrir(context, ui) {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, base(ui));
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForTimeout(2200);
  return page;
}

test('o mascote fica acima dos Favoritos e usa o nome escolhido', async ({ context }) => {
  const page = await abrir(context, { mascot: { nameSet: true, name: 'Nina' }, expanded: {} });

  await expect(page.locator('.ai-thread-node .label')).toHaveText('Nina');

  // o nó do mascote precisa estar acima do bloco de favoritos no DOM
  const pos = await page.evaluate(() => {
    const y = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
    return { mascote: y('ai-slot'), favoritos: y('fav-section') };
  });
  expect(pos.mascote).toBeLessThan(pos.favoritos);
});

test('primeiro login sem nome: o modal pergunta e o nome passa a valer na árvore', async ({ context }) => {
  const page = await abrir(context, { expanded: {} });

  await expect(page.locator('#modal:not(.hidden)')).toHaveCount(1);
  await page.fill('#mascot-modal-name', 'Fubá');
  await page.click('#modal-ok');
  await page.waitForTimeout(500);

  await expect(page.locator('.ai-thread-node .label')).toHaveText('Fubá');
  // nome definido = não pergunta de novo
  await expect(page.locator('#modal:not(.hidden)')).toHaveCount(0);

  // e sobrevive ao reload
  await page.reload();
  await page.waitForTimeout(2200);
  await expect(page.locator('.ai-thread-node .label')).toHaveText('Fubá');
  await expect(page.locator('#modal:not(.hidden)')).toHaveCount(0);
});

test('Sortear gera uma aparência nova sem mexer no nome', async ({ context }) => {
  const page = await abrir(context, { mascot: { nameSet: true, name: 'Zeca' }, expanded: {} });
  await page.click('#profile-btn');
  await page.waitForTimeout(300);
  await page.click('#profile-mascot');
  await page.waitForTimeout(600);

  const ler = () => page.evaluate(() => JSON.parse(localStorage.getItem('notethread.v2')).ui.mascot);

  const antes = await ler();
  const resultados = [];
  for (let i = 0; i < 6; i++) {
    await page.click('#mascot-randomize');
    await page.waitForTimeout(200);
    resultados.push(JSON.stringify(await ler()));
  }

  // o nome é identidade do usuário: nunca é sorteado
  for (const r of resultados) expect(JSON.parse(r).name).toBe('Zeca');
  // 6 sorteios não podem sair todos iguais
  expect(new Set(resultados).size).toBeGreaterThan(1);
  // as cores precisam ser hex válido (a paleta é curada, não aleatória)
  const fim = await ler();
  for (const k of ['bodyA', 'bodyB', 'eyeColor', 'accColor']) {
    expect(fim[k]).toMatch(/^#[0-9a-fA-F]{6}$/);
  }
  // e a configuração sorteada tem que aparecer no preview
  await expect(page.locator('#mascot-preview-av .ai-av')).toHaveAttribute('data-shape', fim.shape);
});

test('o kicker "Assistente" fica no explorador e Favoritos é subitem de Meus cadernos', async ({ context }) => {
  // o seed de abrir() já traz uma conversa favoritada, então o bloco aparece
  const page = await abrir(context, { mascot: { nameSet: true, name: 'Nina' }, expanded: {} });

  // o kicker fica ACIMA do item do mascote, no explorador
  const kicker = page.locator('.ai-kicker');
  await expect(kicker).toHaveCount(1);
  await expect(kicker).toContainText('Assistente');
  const y = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top);
  expect(await y('.ai-kicker')).toBeLessThan(await y('.ai-thread-node'));

  // Favoritos é subconteúdo: vem depois do rótulo da seção, antes da lista
  expect(await y('.explorer-label')).toBeLessThan(await y('#fav-section'));
  expect(await y('#fav-section')).toBeLessThan(await y('#tree'));

  // sem rótulo próprio (a estrela dourada já identifica) e separados por um
  // trilho vertical dourado — não por uma linha atravessada, que lia como
  // "fim de seção"
  await expect(page.locator('#fav-section .fav-label')).toHaveCount(0);
  const sep = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#fav-section'));
    return { trilho: cs.borderLeftWidth, estilo: cs.borderLeftStyle, cor: cs.borderLeftColor,
             linhaHorizontal: cs.borderBottomWidth };
  });
  expect(parseFloat(sep.trilho)).toBeGreaterThan(0);
  expect(sep.estilo).not.toBe('none');
  expect(parseFloat(sep.linhaHorizontal)).toBe(0);
});

test('o cabeçalho da conversa mostra só o ícone, sem o texto do kicker', async ({ context }) => {
  const page = await abrir(context, { mascot: { nameSet: true, name: 'Nina' }, expanded: {} });
  await page.locator('.ai-thread-node').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#page-kicker')).toHaveCount(0);
  await expect(page.locator('#page-icon svg')).toHaveCount(1);
  await expect(page.locator('#chat-name')).toHaveText('Nina');
});

test('renomear no painel reflete no explorador e no título da página da IA', async ({ context }) => {
  const page = await abrir(context, { mascot: { nameSet: true, name: 'Zeca' }, expanded: {} });

  await page.click('#profile-btn');
  await page.waitForTimeout(300);
  await page.click('#profile-mascot');
  await page.waitForTimeout(600);
  await page.fill('#mascot-name', 'Mel');
  await page.waitForTimeout(600);

  await expect(page.locator('.ai-thread-node .label')).toHaveText('Mel');

  await page.locator('.ai-thread-node').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#chat-name')).toHaveText('Mel');
});