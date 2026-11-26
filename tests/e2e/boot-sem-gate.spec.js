const { test, expect } = require('@playwright/test');

// O boot deixou de esperar o Supabase para pintar QUANDO há usuário em cache.
// Antes: `await Promise.race([_ensureSupa(), 3s])` antes do primeiro render —
// quem já estava logado encarava até 3s de splash com o app inteiro em memória.
//
// O teste segura a requisição do Supabase (nunca responde) e mede quando a
// árvore de conversas aparece. Com o gate antigo isso levaria ~3s (timeout);
// agora tem de aparecer com o cache local, sem esperar a rede.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'supabase', id: 'uid-ana' },
  folders: {},
  threads: {
    t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 90000, updatedAt: Date.now() },
    t2: { id: 't2', name: 'Trabalho', folderId: null, created: Date.now() - 80000, updatedAt: Date.now() },
  },
  notes: {
    t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'oi\n[ ] a', ts: Date.now() - 5000, images: [], reactions: {} }],
    t2: [{ clientId: 'n2', threadId: 't2', user: 'me', text: 'x', ts: Date.now() - 4000, images: [], reactions: {} }],
  },
  ui: { mascot: { nameSet: true }, expanded: {}, theme: 'terracota', sounds: { enabled: false }, tasksOwn: [] },
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.setTimeout(60000);

test('com usuário em cache o boot não espera os 3s do Supabase', async ({ page, context }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);

  // segura o Supabase: nunca responde (simula rede lenta/offline)
  await page.route('**/esm.sh/**', () => { /* pendura de propósito */ });

  const t0 = Date.now();
  await page.goto('/');
  // a própria espera já exige as DUAS conversas do cache: contar depois de um
  // `> 0` deixava uma janela em que um re-render passava por zero
  await page.waitForFunction(() => document.querySelectorAll('.tnode').length >= 2, null, { timeout: 45000 });
  const ms = Date.now() - t0;

  // o teto com cache é 350ms; o gate antigo esperava até 3000ms (medido 3746ms
  // com a requisição pendurada). 2600 dá folga para a máquina carregada sem
  // encostar no comportamento antigo.
  expect(ms, 'não pode encostar no timeout antigo de 3s (' + ms + 'ms)').toBeLessThan(2600);

  // `waitForFunction` em vez de `evaluate` solto: sob carga pode haver uma
  // navegação em andamento e o evaluate morre com "execution context destroyed"
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return !!app && !app.classList.contains('hidden') && getComputedStyle(app).display !== 'none'
      && document.querySelectorAll('.tnode').length >= 2;
  }, null, { timeout: 15000 });
});

test('sem usuário em cache continua esperando (não pisca login)', async ({ page, context }) => {
  // sem user: o app não tem o que pintar; deve decidir depois da sessão
  await context.addInitScript(() => {
    if (!localStorage.getItem('notethread.v2')) {
      localStorage.setItem('notethread.v2', JSON.stringify({ user: null, folders: {}, threads: {}, notes: {}, ui: { mascot: { nameSet: true }, theme: 'terracota' } }));
    }
  });
  await page.route('**/esm.sh/**', () => { /* pendura */ });

  await page.goto('/');
  // os partials entram por fetch no servidor de dev: em runner lento o
  // #auth-screen ainda não existia aos 1,2s e o teste morria no null
  await page.waitForFunction(() => !!document.getElementById('auth-screen') && !!document.getElementById('app'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const estado = await page.evaluate(() => ({
    authVisivel: !document.getElementById('auth-screen').classList.contains('hidden'),
    appVisivel: !document.getElementById('app').classList.contains('hidden'),
  }));
  // enquanto não sabemos da sessão, a tela de login NÃO pode aparecer
  expect(estado.authVisivel && estado.appVisivel, 'nunca mostra as duas telas').toBe(false);
  expect(estado.authVisivel, 'sem cache, ainda no splash/login (aguardando)').toBe(false);
});
