// A waveform do player de áudio não pode furar a bolha.
//
// O sintoma: as barras davam overflow horizontal na tela. Causa: os picos
// guardados têm até 120 entradas (PEAK_TARGET em audio.js) e cada `.va-bar`
// tinha `min-width: 2px` com `gap: 2px` — 120 barras precisavam de ~480px,
// dentro de um `.vaudio` de max-width 320px. O `min-width` era o que
// impedia o encolhimento: o flex não tinha como distribuir menos que 2px
// por barra, então transbordava.
//
// Este teste mede o transbordo real no browser — não reimplementa a conta.
const { test, expect } = require('@playwright/test');

const WAV = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=', 'base64');

// 120 picos = o caso que estoura (PEAK_TARGET). Também testamos 34, que é o
// esqueleto uniforme das notas sem picos.
const picos = (n) => Array.from({ length: n }, (_, i) => +(((i * 37) % 90) / 100 + 0.05).toFixed(3));

function seedComAudio(nPicos) {
  return {
    user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
    threads: { t1: { id: 't1', name: 'Conversa', folderId: null, created: Date.now() - 90000 } },
    folders: {},
    notes: {
      t1: [{
        clientId: 'a1', threadId: 't1', user: 'me', text: 'áudio', ts: Date.now() - 50000,
        images: [],
        audio: {
          url: '/audio/fala.webm', dur: 12.4, peaks: picos(nPicos),
          sender: { name: 'Ana', photo: null },
        },
      }],
    },
    ui: { expanded: {}, sounds: { enabled: false, volume: 0.5, map: {} } },
  };
}

async function medirOverflow(page) {
  return page.evaluate(() => {
    const wave = document.querySelector('.va-wave');
    const audio = document.querySelector('.vaudio');
    const bolha = document.querySelector('.bubble');
    const fluxo = document.getElementById('messages');
    const barras = document.querySelectorAll('.va-bar');
    if (!wave || !audio || !bolha) return { AUSENTE: true, nBarras: barras.length };
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right) }; };
    const soma = [...barras].reduce((s, b) => s + b.getBoundingClientRect().width + 2, 0);
    const fb = fluxo.getBoundingClientRect();
    return {
      nBarras: barras.length,
      wave: r(wave),
      vaudio: r(audio),
      bolha: r(bolha),
      larguraDoConteudoDasBarras: Math.round(soma),
      waveTransborda: wave.scrollWidth > wave.clientWidth + 1,
      vaudioTransborda: audio.scrollWidth > audio.clientWidth + 1,
      // o transbordo REAL: a barra mais à direita passa da borda do fluxo?
      barraMaisDireita: Math.round(Math.max(...[...barras].map((b) => b.getBoundingClientRect().right))),
      bordaDireitaDoFluxo: Math.round(fb.right),
      estouraOTela: Math.max(...[...barras].map((b) => b.getBoundingClientRect().right)) > fb.right + 1,
    };
  });
}

for (const [nome, n] of [['120 picos (PEAK_TARGET)', 120], ['34 picos (esqueleto)', 34]]) {
  test(`waveform não transborda a bolha com ${nome}`, async ({ context, page }) => {
    await context.route('**/audio/fala.webm', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV }));
    await context.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, seedComAudio(n));

    // 390 e 320: o mobile estreito é onde a bolha aperta mais
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/');
      await page.waitForTimeout(1200);
      await page.locator('.tnode[data-tid="t1"]').first().click();
      await page.waitForTimeout(600);

      const m = await medirOverflow(page);
      expect(m.AUSENTE, `sem player em ${w}px`).toBeFalsy();
      expect(m.nBarras, `nº de barras (${w}px)`).toBeLessThanOrEqual(34);
      expect(m.waveTransborda, `wave transborda a si mesma em ${w}px (${m.nBarras} barras)`).toBe(false);
      expect(m.vaudioTransborda, `.vaudio transborda em ${w}px`).toBe(false);
      expect(m.estouraOTela, `barras passam da borda do fluxo em ${w}px: barra ${m.barraMaisDireita} vs fluxo ${m.bordaDireitaDoFluxo}`).toBe(false);
      // e a largura da waveform é a do trilho, não a soma das barras
      expect(m.wave.w, `waveform tem largura fixa em ${w}px`).toBeLessThanOrEqual(m.vaudio.w);
    }
  });
}
