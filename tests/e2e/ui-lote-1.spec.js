const { test, expect } = require('@playwright/test');

// Cobre os 7 pedidos do lote de UI. Cada teste mede o EFEITO no DOM real,
// não só "a classe foi aplicada".
//
// O app precisa estar MONTADO: `addInitScript` semeia o usuário antes do
// boot. Sem isso `#app` fica `display:none` e toda a cadeia mede h:0.
const seed = {
  user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
  folders: {},
  threads: {
    t1: { id: 't1', name: 'Compras', folderId: null, color: '#e06c9f', created: Date.now() - 90000 },
    t2: { id: 't2', name: 'Trabalho', folderId: null, color: '#4f9dde', created: Date.now() - 80000 },
  },
  notes: {
    t1: [{ clientId: 'n1', threadId: 't1', user: 'me', text: 'lista\n[ ] Comprar leite\n[ ] Pagar boleto', ts: Date.now() - 50000, images: [], reactions: {} }],
    t2: [{ clientId: 'n2', threadId: 't2', user: 'me', text: 'trab\n[ ] Enviar relatório', ts: Date.now() - 40000, images: [], reactions: {} }],
  },
  ui: { expanded: {}, theme: 'peach', sounds: { enabled: false, volume: 0.5, map: {} }, tasksOwn: [] },
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript((s) => {
    if (!localStorage.getItem('notethread.v2')) localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForTimeout(1800);
  // O seed não define nome do mascote, então o app abre o diálogo "Como ele
  // se chama?" no primeiro boot — e ele consumiria o primeiro "voltar" do
  // teste. Fechar emula o usuário que já nomeou.
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.classList.contains('hidden')) window.NoteThread.UI.closeModal();
  });
  await page.waitForTimeout(150);
});

// Abre t1 sem depender de gesto (a sidebar cobre o canvas em 390px)
async function abrirConversa(page, id = 't1') {
  await page.evaluate((tid) => { window.NoteThread.UI.openThread(tid); }, id);
  await page.waitForTimeout(600);
}

test('1. nome da conversa tem moldura fina (= borda do input)', async ({ page }) => {
  await abrirConversa(page);
  const r = await page.evaluate(() => {
    const el = document.getElementById('chat-name');
    const cs = getComputedStyle(el);
    const input = getComputedStyle(document.querySelector('.cozy-input-row'));
    return {
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
      color: cs.borderTopColor,
      inputBorder: input.borderTopWidth + ' ' + input.borderTopStyle,
      radius: cs.borderTopLeftRadius,
    };
  });
  console.log('BORDA=' + JSON.stringify(r));
  expect(r.border, 'moldura presente').not.toBe('0px none');
  expect(r.border, 'MESMA borda do componente de input').toBe(r.inputBorder);
  expect(r.radius, 'raio arredondado').not.toBe('0px');
});

test('2. checklist no editor nao cresce cortada ao quebrar linha', async ({ page }) => {
  await abrirConversa(page);
  const antes = await page.evaluate(() => {
    const ta = document.getElementById('composer-input');
    ta.setAttribute('contenteditable', 'true');
    ta.innerHTML = '<ul class="md-checklist"><li><span class="md-check"><input type="checkbox"><span>primeiro item da checklist</span></span></li></ul>';
    const span = ta.querySelector('.md-check > span');
    const r = document.createRange();
    r.selectNodeContents(span); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    ta.focus();
    return Math.round(ta.getBoundingClientRect().height);
  });
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(250);
  const depois = await page.evaluate(() => {
    const ta = document.getElementById('composer-input');
    return {
      h: Math.round(ta.getBoundingClientRect().height),
      itens: ta.querySelectorAll('ul.md-checklist > li').length,
      cortado: ta.scrollHeight > ta.clientHeight + 1,
    };
  });
  console.log('CHECKLIST=' + JSON.stringify({ antes, ...depois }));
  expect(depois.itens, 'a checklist ganhou um item').toBe(2);
  expect(depois.h, 'o editor cresceu junto').toBeGreaterThan(antes);
  expect(depois.cortado, 'nada cortado (scrollHeight == clientHeight)').toBe(false);
});

test('3. voltar dispensa menu aberto em vez de sair do app', async ({ page }) => {
  await abrirConversa(page);
  const r = await page.evaluate(() => {
    // dropdown de @menções: criado em runtime, `position: fixed`
    const dd = document.createElement('div');
    dd.className = 'mention-dd';
    dd.id = 'probe-dd';
    document.body.appendChild(dd);
    const antes = !dd.classList.contains('hidden');
    const ret = window.NoteThread.UI.goBack();
    return {
      antes,
      ret,
      depoisEscondido: dd.classList.contains('hidden'),
      appAindaAberto: document.getElementById('app').classList.contains('show-chat'),
      ddRemovido: !document.getElementById('probe-dd'),
    };
  });
  console.log('VOLTAR=' + JSON.stringify(r));
  expect(r.antes, 'menu estava aberto').toBe(true);
  expect(r.ret, 'goBack dispensou a camada').toBe('dismissed');
  expect(r.depoisEscondido, 'menu fechou').toBe(true);
  expect(r.appAindaAberto, 'app/conversa continuam abertos').toBe(true);
});

test('4. checklist sem bullet point', async ({ page }) => {
  await abrirConversa(page);
  const r = await page.evaluate(() => {
    const ta = document.getElementById('composer-input');
    ta.innerHTML = '<ul class="md-checklist"><li><span class="md-check"><input type="checkbox"><span>x</span></span></li></ul>';
    const ul = ta.querySelector('ul.md-checklist');
    return {
      listStyle: getComputedStyle(ul).listStyleType,
      padLeft: getComputedStyle(ul).paddingLeft,
    };
  });
  console.log('BULLET=' + JSON.stringify(r));
  expect(r.listStyle, 'sem marcador de lista').toBe('none');
});

test('5. filtro por conversa nas tarefas das conversas', async ({ page }) => {
  await page.evaluate(() => { window.NoteThread.UI.showTasksPage(); return true; });
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    const wrap = document.getElementById('tasks-threads-filter-wrap');
    const sel = document.getElementById('tasks-threads-filter');
    return {
      visivel: wrap && !wrap.classList.contains('hidden'),
      opcoes: [...sel.options].map((o) => o.textContent),
      valor: sel.value,
    };
  });
  console.log('FILTRO=' + JSON.stringify(r));
  expect(r.visivel, 'filtro aparece com 2 conversas').toBe(true);
  expect(r.opcoes.length, 'todas + 2 conversas').toBe(3);
  expect(r.opcoes[0]).toContain('Todas');

  await page.selectOption('#tasks-threads-filter', 't2');
  await page.waitForTimeout(400);
  const depois = await page.evaluate(() => ({
    tids: [...document.querySelectorAll('#tasks-threads-list .task-row')].map((r) => r.dataset.tid),
    count: document.getElementById('tasks-threads-count').textContent,
    persistido: (JSON.parse(localStorage.getItem('notethread.v2') || '{}').ui || {}).tasksThreadFilter,
  }));
  console.log('FILTRO_APLICADO=' + JSON.stringify(depois));
  expect(depois.tids, 'só tarefas da conversa escolhida').toEqual(['t2']);
  expect(depois.persistido, 'escolha sobrevive ao reload').toBe('t2');
});

test('6. aviso fica ABAIXO do nome da conversa, com respiro', async ({ page }) => {
  await abrirConversa(page);
  const r = await page.evaluate(async () => {
    window.NoteThread.UI.toast('Atualizado', { kind: 'success', duration: 4000 });
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 120)));
    const t = document.querySelector('.app-toast');
    const h = document.getElementById('chat-header');
    const tb = t.getBoundingClientRect(); const hb = h.getBoundingClientRect();
    return {
      toastTop: Math.round(tb.top),
      headerBottom: Math.round(hb.bottom),
      gap: Math.round(tb.top - hb.bottom),
      sobrepoe: tb.top < hb.bottom,
    };
  });
  console.log('AVISO=' + JSON.stringify(r));
  expect(r.sobrepoe, 'não cobre o título').toBe(false);
  expect(r.gap, 'respiro entre eles').toBeGreaterThanOrEqual(6);

  // mesma regra na página de Tarefas, que tem cabeçalho próprio: antes o
  // aviso caía no topo padrão e cobria o primeiro cartão
  await page.evaluate(() => { window.NoteThread.UI.showTasksPage(); });
  await page.waitForTimeout(700);
  const rp = await page.evaluate(async () => {
    window.NoteThread.UI.toast('Atualizado', { kind: 'success', duration: 4000 });
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 120)));
    const t = [...document.querySelectorAll('.app-toast')].pop();
    const h = document.querySelector('#tasks-page .cozy-banner');
    const tb = t.getBoundingClientRect(); const hb = h.getBoundingClientRect();
    return { gap: Math.round(tb.top - hb.bottom), sobrepoe: tb.top < hb.bottom };
  });
  console.log('AVISO_TAREFAS=' + JSON.stringify(rp));
  expect(rp.sobrepoe, 'não cobre o cabeçalho de Tarefas').toBe(false);
  expect(rp.gap, 'respiro também em Tarefas').toBeGreaterThanOrEqual(6);
});

test('7. botão de fixadas só existe quando há mensagem fixada', async ({ page }) => {
  await abrirConversa(page);
  const semPin = await page.evaluate(() => ({
    hidden: document.getElementById('btn-pin').classList.contains('hidden'),
    visivel: getComputedStyle(document.getElementById('btn-pin')).display !== 'none',
  }));
  console.log('PIN_SEM=' + JSON.stringify(semPin));
  expect(semPin.hidden, 'escondido sem fixada').toBe(true);
  expect(semPin.visivel, 'de fato fora da tela').toBe(false);

  const comPin = await page.evaluate(() => {
    window.NoteThread.Store.data.threads.t1.pinnedId = 'n1';
    window.NoteThread.Store.save();
    window.NoteThread.UI.updatePinButton();
    return {
      hidden: document.getElementById('btn-pin').classList.contains('hidden'),
      visivel: getComputedStyle(document.getElementById('btn-pin')).display !== 'none',
    };
  });
  console.log('PIN_COM=' + JSON.stringify(comPin));
  expect(comPin.hidden, 'aparece com fixada').toBe(false);
  expect(comPin.visivel, 'de fato na tela').toBe(true);
});
