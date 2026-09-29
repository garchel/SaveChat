// E2E: mensagem de voz — player na bolha (waveform real, play/pause, avatar).
// Cobre: (1) a nota com `audio` renderiza o player e guarda os picos reais,
// (2) o waveform NÃO é uniforme (um esqueleto fixo passaria no teste errado),
// (3) o play troca o ícone e a barra tocada, (4) sobrevive ao reload.
const { test, expect } = require('@playwright/test');

// WAV gerado em memória: 1s de sinal com 3 bursts de som e silêncio entre
// eles — dá picos bem distintos, então um waveform "de mentira" (todas as
// barras iguais) é detectado.
function wavBuffer() {
  const sr = 8000, n = sr;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const on = (t > 0.05 && t < 0.3) || (t > 0.5 && t < 0.72) || (t > 0.9 && t < 0.99);
    // envelope que decai dentro de cada burst: amplitude constante saturaria
    // todos os picos em 1.0 depois da normalização e o teste não distinguiria
    // um waveform real de um esqueleto
    const env = on ? (1 - ((t * 3) % 1)) * 0.9 + 0.08 : 0;
    const v = on ? Math.round(Math.sin(2 * Math.PI * 440 * t) * 12000 * env) : 0;
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf.toString('base64');
}

// Mesmos picos que o app gravaria: 34 buckets, máximo por bucket (não média).
function peaksFrom(bufB64, bars = 34) {
  const buf = Buffer.from(bufB64, 'base64');
  const n = (buf.length - 44) / 2;
  const block = Math.max(1, Math.floor(n / bars));
  const out = []; let max = 0;
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    for (let j = i * block; j < Math.min(n, (i + 1) * block); j++) {
      const v = Math.abs(buf.readInt16LE(44 + j * 2));
      if (v > peak) peak = v;
    }
    out.push(peak); if (peak > max) max = peak;
  }
  const norm = max > 0 ? 1 / max : 0;
  return out.map((v) => +(v * norm).toFixed(3));
}

const WAV = wavBuffer();
const AUDIO = {
  url: 'https://exemplo.test/audio/fala.webm', mime: 'audio/webm', dur: 7,
  peaks: peaksFrom(WAV), sender: { name: 'Paulo', photo: '' },
};

test.describe('mensagem de voz', () => {
  test('player renderiza com waveform real e troca play/pause', async ({ page, context }) => {
    // serve um WAV real na URL da nota: sem isso audio.play() falha com
    // ERR_NAME_NOT_RESOLVED e o player entra em .failed (não dá para testar
    // play/pause com uma URL que não existe)
    await context.route('**/audio/fala.webm', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from(WAV, 'base64') }));

    await context.addInitScript((a) => {
      const seed = {
        user: { name: 'Paulo', mail: 'paulo@test.com', provider: 'email' },
        threads: { t1: { id: 't1', name: 'Compras', folderId: null, created: Date.now() - 1000 } },
        folders: {},
        notes: { t1: [{
          clientId: 'a1', threadId: 't1', user: 'me', text: '', ts: Date.now() - 5000,
          images: [], audio: a,
        }] },
        ui: { expanded: {}, sounds: { enabled: false } },
      };
      localStorage.setItem('notethread.v2', JSON.stringify(seed));
    }, AUDIO);

    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('.tnode').first().click();
    await expect(page.locator('.vaudio')).toBeVisible({ timeout: 10000 });

    // play à esquerda, remetente à direita
    const box = await page.locator('.vaudio').boundingBox();
    const play = await page.locator('.va-play').boundingBox();
    const who = await page.locator('.va-who').boundingBox();
    expect(play.x, 'play deve ficar à esquerda do player').toBeLessThan(who.x);
    expect(play.x + play.width, 'o play não pode invadir o bloco do remetente').toBeLessThanOrEqual(who.x);

    // avatar: sem foto, cai na inicial do nome
    await expect(page.locator('.va-av-ini')).toHaveText('P');
    // duração visível
    await expect(page.locator('.va-dur')).toHaveText('0:07');

    // waveform: barras com alturas REAIS (peaks guardados), não uniforme
    const heights = await page.$$eval('.va-bar', (els) => els.map((e) => e.style.getPropertyValue('--h')));
    expect(heights.length).toBeGreaterThan(20);
    const uniq = new Set(heights);
    expect(uniq.size, 'waveform uniforme = picos não foram aplicados').toBeGreaterThan(5);

    // clique em play: vira pause e pinta as barras tocadas
    const before = await page.locator('.va-bar.played').count();
    await page.locator('.va-play').click();
    await expect(page.locator('.vaudio.playing')).toBeVisible();
    await expect(page.locator('.va-play')).toHaveAttribute('aria-label', 'Pausar áudio');
    await expect(page.locator('.va-bar.played').first()).toBeVisible();
    expect(await page.locator('.va-bar.played').count()).toBeGreaterThanOrEqual(before);

    // player sobrevive ao reload (nota veio do storage)
    await page.reload();
    await page.waitForTimeout(2000);
    await page.locator('.tnode').first().click();
    await expect(page.locator('.vaudio')).toBeVisible();
    await expect(page.locator('.va-dur')).toHaveText('0:07');
  });

  test('peaks ausentes: o player calcula o waveform decodificando o audio', async ({ page, context }) => {
    // nota SEM peaks (ex.: gravada antes desta feature) -> barra esqueleto,
    // e o player tenta recalcular os picos buscando a URL.
    await context.route('**/audio/fala-velha.webm', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from(wavBuffer(), 'base64') }));

    await context.addInitScript((a) => {
      localStorage.setItem('notethread.v2', JSON.stringify({
        user: { name: 'Ana', mail: 'ana@test.com', provider: 'email' },
        threads: { t1: { id: 't1', name: 'Old', folderId: null, created: Date.now() - 1000 } },
        folders: {},
        notes: { t1: [{ clientId: 'a2', threadId: 't1', user: 'me', text: '', ts: Date.now() - 5000, images: [], audio: a }] },
        ui: { expanded: {}, sounds: { enabled: false } },
      }));
    }, { url: 'https://exemplo.test/audio/fala-velha.webm', mime: 'audio/wav', dur: 1, peaks: [], sender: { name: 'Ana', photo: '' } });

    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('.tnode').first().click();
    await expect(page.locator('.vaudio')).toBeVisible({ timeout: 10000 });

    // o esqueleto existe logo, mas depois de decodificar as barras ficam
    // com alturas variadas (o pico real foi aplicado)
    await expect.poll(async () => {
      const h = await page.$$eval('.va-bar', (els) => els.map((e) => e.style.getPropertyValue('--h')));
      return new Set(h).size;
    }, { timeout: 15000, message: 'os picos do áudio não foram recalculados' }).toBeGreaterThan(5);
  });
});
