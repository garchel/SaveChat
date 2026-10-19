// Transcrição das mensagens de voz: markup do toggle na bolha, contrato do
// evento de sync e o cliente do provedor (BYOK/sem sessão/erros).
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

describe('bolha de áudio com transcrição', () => {
  it('audioHtml desenha a seta (só a ponta) e a área entre aspas', async () => {
    const { audioHtml } = await import('../public/js/audio.js');
    const html = audioHtml({
      clientId: 'abc123',
      audio: { url: 'https://exemplo.test/fala.webm', mime: 'audio/webm', dur: 7, peaks: [0.4, 1], sender: { name: 'Paulo' } },
    });
    assert.match(html, /class="va-row"/, 'o player precisa de uma linha própria');
    assert.match(html, /class="va-tr-toggle"/, 'seta de transcrição ausente');
    assert.match(html, /aria-expanded="false"/, 'a seta começa fechada');
    assert.match(html, /aria-controls="va-tr-abc123"/, 'a seta precisa apontar para o texto');
    assert.match(html, /6 9 12 15 18 9/, 'o ícone deve ser o chevron (sem haste)');
    assert.match(html, /<p class="va-transcript" id="va-tr-abc123" hidden><\/p>/,
      'a transcrição nasce vazia e escondida (só aparece no clique)');
  });

  it('messages-bubble liga o toggle e salva em audio.transcript', () => {
    const src = readFileSync('public/js/ui/messages-bubble.js', 'utf8');
    assert.match(src, /onTranscript: \(box, note\) => this\.toggleVoiceTranscript\(box, note\)/);
    assert.match(src, /async toggleVoiceTranscript\(box, note\)/);
    assert.match(src, /latest\.audio = Object\.assign\(\{\}, latest\.audio, \{ transcript: text \}\);/);
    assert.match(src, /Sync\.send\('note:transcript'/);
    assert.match(src, /tr\.textContent = `“\$\{text\}”`;/, 'o texto deve aparecer entre aspas');
  });

  it('o player entrega o clique sem conhecer Store/Sync', () => {
    const src = readFileSync('public/js/audio.js', 'utf8');
    assert.match(src, /bindAudioPlayer\(rootEl, note, opts = \{\}\)/);
    assert.match(src, /opts\.onTranscript\(box, note\)/);
    assert.ok(!/from '\.\/store\.js'/.test(src), 'audio.js não deve depender do Store');
  });

  it('note:transcript atualiza só a coluna audio', () => {
    const src = readFileSync('public/js/sync-supabase.js', 'utf8');
    assert.match(src, /type === 'note:transcript'/);
    assert.match(src, /update\(\{ audio: payload\.audio \|\| null \}\)/);
  });

  it('transcribe.js está no precache e no npm run check', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    assert.ok(sw.includes("'./js/transcribe.js'"), 'transcribe.js ausente do precache do SW');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.ok(pkg.scripts.check.includes('node --check public/js/transcribe.js'));
  });
});

describe('cliente de transcrição', () => {
  const AUDIO = 'https://exemplo.test/fala.webm';
  const blob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });

  it('BYOK: lê o áudio e chama o Gemini direto com o modelo estável', async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), opts });
      if (String(url) === AUDIO) return { ok: true, blob: async () => blob() };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '  olá mundo  ' }] } }] }) };
    };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    const out = await transcribeAudio(AUDIO, { key: 'chave-teste' });

    assert.equal(out, 'olá mundo');
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /gemini-3\.6-flash:generateContent/);
    assert.equal(calls[1].opts.headers['x-goog-api-key'], 'chave-teste');
    const body = JSON.parse(calls[1].opts.body);
    assert.equal(body.generationConfig.maxOutputTokens, 1024);
    assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0,
      'sem thinking: respostas curtas saíam vazias (MAX_TOKENS)');
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'audio/webm');
    assert.equal(body.contents[0].parts[1].inlineData.data, Buffer.from([1, 2, 3, 4]).toString('base64'));
  });

  it('sem sessão e sem chave: orienta a entrar antes de baixar o áudio', async () => {
    let called = false;
    global.fetch = async () => { called = true; throw new Error('não deveria chamar'); };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    await assert.rejects(transcribeAudio(AUDIO), /Entre na sua conta para transcrever/);
    assert.equal(called, false);
  });

  it('erro do provedor chega legível na bolha', async () => {
    global.fetch = async (url) => {
      if (String(url) === AUDIO) return { ok: true, blob: async () => blob() };
      return { ok: false, status: 503, json: async () => ({ error: { message: 'modelo ocupado' } }) };
    };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    await assert.rejects(transcribeAudio(AUDIO, { key: 'k' }), /modelo ocupado/);
  });

  it('resposta sem fala vira erro em vez de bolha vazia', async () => {
    global.fetch = async (url) => {
      if (String(url) === AUDIO) return { ok: true, blob: async () => blob() };
      return { ok: true, json: async () => ({ candidates: [{ content: {} }] }) };
    };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    await assert.rejects(transcribeAudio(AUDIO, { key: 'k' }), /Não consegui extrair fala/);
  });
});
