// E2E: o CSP de produção não pode bloquear o áudio do bucket nem o avatar do
// Google. O player usa `<audio src="https://<projeto>.supabase.co/...">` e o
// remetente usa `https://lh3.googleusercontent.com/...`; sem `media-src`/
// `img-src` liberados o Chrome recusa os dois. O teste lê a política real do
// vercel.json e aplica na resposta do documento, como a Vercel faz.
const { test, expect } = require('@playwright/test');
const { readFileSync } = require('fs');

test.use({ serviceWorkers: 'block' });

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const AUDIO_URL = 'https://fake.supabase.co/storage/v1/object/public/note-audio/fala.wav';

function policyFromVercel() {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const all = cfg.headers.find((h) => h.source === '/(.*)').headers;
  return all.find((h) => h.key === 'Content-Security-Policy').value;
}

function wav(seconds = 4) {
  const sr = 8000, n = sr * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 4000), 44 + i * 2);
  }
  return buf;
}

function makeSeed(photo = '') {
  return {
    user: { name: 'Paulo', mail: 'paulo@test.com', provider: 'email' },
    threads: { t1: { id: 't1', name: 'Áudio', folderId: null, created: Date.now() - 1000 } },
    folders: {},
    notes: { t1: [{
      clientId: 'n1', threadId: 't1', user: 'me', text: '', ts: Date.now() - 5000,
      images: [], audio: {
        url: AUDIO_URL, mime: 'audio/wav', dur: 4, peaks: [0.2, 0.6, 1, 0.4],
        sender: { name: 'Paulo', photo },
      },
    }] },
    ui: { mascot: { nameSet: true }, expanded: {}, sounds: { enabled: false } },
  };
}

async function applyProductionCsp(page) {
  await page.route((url) => url.pathname === '/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policyFromVercel() },
    });
  });
}

async function openAudio(page, seed) {
  await page.addInitScript((s) => {
    localStorage.setItem('notethread.v2', JSON.stringify(s));
  }, seed);
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.locator('.tnode[data-tid="t1"]').first().click();
  await expect(page.locator('.vaudio')).toBeVisible();
}

test('o CSP de produção libera o áudio e o play vira pause', async ({ page, context }) => {
  await context.route('https://fake.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }));
  await applyProductionCsp(page);

  const cspErrors = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to load (media|the media)/i.test(m.text())) cspErrors.push(m.text());
  });

  await openAudio(page, makeSeed());

  await page.locator('.va-play').click();
  await expect(page.locator('.va-play')).toHaveAttribute('aria-label', 'Pausar áudio');
  await expect(page.locator('.vaudio.playing')).toBeVisible();

  await page.locator('.va-play').click();
  await expect(page.locator('.va-play')).toHaveAttribute('aria-label', 'Reproduzir áudio');
  expect(cspErrors, cspErrors.join('\n')).toEqual([]);
});

test('o CSP de produção libera a foto de perfil do Google', async ({ page, context }) => {
  await context.route('https://lh3.googleusercontent.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  await applyProductionCsp(page);

  await openAudio(page, makeSeed('https://lh3.googleusercontent.com/a/test.png'));

  const img = page.locator('.vaudio img.va-av');
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.vaudio .va-av-ini')).toHaveCount(0);
});

test('foto que falha cai para a inicial do remetente', async ({ page, context }) => {
  await context.route('https://fake.supabase.co/**', (route) => {
    if (route.request().url().includes('avatar-404')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() });
  });
  await applyProductionCsp(page);

  await openAudio(page, makeSeed('https://fake.supabase.co/avatar-404.png'));

  await expect(page.locator('.vaudio .va-av-ini')).toBeVisible();
  await expect(page.locator('.vaudio .va-av-ini')).toHaveText('P');
  await expect(page.locator('.vaudio img.va-av')).toHaveCount(0);
});
