// Continuação da validação do dist: o caminho que o e2e NÃO cobre porque não
// tem microfone nem API real. Aqui simulamos o MediaRecorder e o upload para
// exercitar a cadeia completa de áudio no build — que é onde o flattening pode
// ter quebrado um import (o mesmo modo de falha que apareceu 4x no refactor).
//
// PITFALL do fake: `navigator.mediaDevices = {...}` e `window.MediaRecorder =`
// são silenciosos — o Chromium mantém o original e o app continua caindo no
// caminho "Não foi possível acessar o microfone". Precisa de defineProperty,
// definido no contexto ANTES de qualquer script do app rodar.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3002';
const seed = {
  user: { name: 'Tester', mail: 'tester@example.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [] },
  ui: { expanded: {}, sounds: { enabled: false } },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

await ctx.addInitScript((s) => {
  localStorage.setItem('notethread.v2', JSON.stringify(s));

  // WAV de 1s com 2 bursts e silêncio entre eles: dá picos bem distintos, então
  // um esqueleto uniforme de barras seria detectado.
  const sr = 8000, n = sr;
  const wav = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(wav);
  const wr = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wr(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const on = (t > 0.05 && t < 0.3) || (t > 0.5 && t < 0.72);
    const env = on ? (1 - ((t * 3) % 1)) * 0.9 + 0.08 : 0;
    dv.setInt16(44 + i * 2, on ? Math.round(Math.sin(2 * Math.PI * 440 * t) * 12000 * env) : 0, true);
  }
  window.__wav = wav;

  class FakeMR {
    constructor() {
      this.mimeType = 'audio/webm';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      // um chunk só: o app calcula a duração por relógio, não pelo blob
      this.ondataavailable && this.ondataavailable({ data: new Blob([window.__wav], { type: 'audio/wav' }) });
      this.onstop && this.onstop();
    }
    static isTypeSupported() { return true; }
  }
  Object.defineProperty(window, 'MediaRecorder', { value: FakeMR, configurable: true, writable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    configurable: true,
  });

  // AudioContext: o Chromium do teste não tem WebAudio com decode. Um stub que
  // devolve picos fixos basta para o teste do BUILD — a qualidade do waveform
  // real é coberta pelo e2e de áudio.
  if (!(window.AudioContext || window.webkitAudioContext)) {
    window.AudioContext = class {
      async decodeAudioData() {
        const dados = new Float32Array(800);
        for (let i = 0; i < dados.length; i++) {
          dados[i] = i % 40 < 20 ? (i / 800) : 0.05;
        }
        return { getChannelData: () => dados };
      }
      close() {}
    };
  }
}, seed);

const page = await ctx.newPage();
const problemas = [];
page.on('pageerror', (e) => problemas.push('JS: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problemas.push('console: ' + m.text().slice(0, 140)); });

const check = (nome, ok, extra = '') => {
  console.log(`  ${ok ? 'ok    ' : 'FALHOU'}  ${nome}${extra ? ' — ' + extra : ''}`);
  if (!ok) problemas.push(nome);
};

await page.goto(BASE + '/?nosw=1');
await page.waitForTimeout(2500);
await page.locator('.tnode').first().click();
await page.waitForTimeout(1200);

console.log('== envio de texto ==');
await page.locator('#composer-input').fill('mensagem de teste no build');
await page.waitForTimeout(300);
await page.click('#btn-send');
await page.waitForTimeout(900);
check('texto vira bolha', (await page.locator('.bubble').count()) > 0);

console.log('== audio: gravar -> player ==');
check('botao em modo microfone com o campo vazio', await page.evaluate(() =>
  document.getElementById('btn-send').classList.contains('audio-mode')));

await page.click('#btn-send');
await page.waitForTimeout(700);
check('entrou em gravacao', await page.evaluate(() =>
  document.getElementById('btn-send').classList.contains('recording')));

await page.click('#btn-send');            // para: calcula picos, sobe, cria a nota
await page.waitForTimeout(4000);

const p = await page.evaluate(() => {
  const box = document.querySelector('.vaudio');
  if (!box) return null;
  const bars = Array.from(box.querySelectorAll('.va-bar'));
  return {
    play: !!box.querySelector('.va-play'),
    dur: (box.querySelector('.va-dur') || {}).textContent,
    barras: bars.length,
    alturasDistintas: new Set(bars.map((b) => b.style.getPropertyValue('--h'))).size,
    avatar: !!(box.querySelector('.va-av') || box.querySelector('.va-av-ini')),
  };
});
check('player apareceu na bolha', !!p, p ? '' : 'nenhum .vaudio no DOM');
if (p) {
  check('botao de play a esquerda', p.play);
  check('avatar do remetente', p.avatar);
  check('waveform com picos reais', p.alturasDistintas >= 5, p.alturasDistintas + ' alturas distintas');
  check('duracao formatada', /^\d+:\d\d$/.test(p.dur || ''), p.dur);
}

console.log('\n== resultado ==');
if (problemas.length) {
  console.log('PROBLEMAS (' + problemas.length + '):');
  for (const x of [...new Set(problemas)]) console.log('  - ' + x);
} else {
  console.log('dist/ validado: texto e audio funcionam no build de producao');
}
await browser.close();
process.exit(problemas.length ? 1 : 0);
