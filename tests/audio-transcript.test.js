// Transcrição das mensagens de voz: markup do toggle na bolha, contrato do
// evento de sync e o cliente do provedor (proxy Groq/base64/erros).
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

describe('contexto da IA', () => {
  it('inclui a transcrição do áudio nas notas recentes', async () => {
    const { WorkspaceAiMethods } = await import('../public/js/ui/workspace-ai.js');
    const { Store } = await import('../public/js/store.js');
    const prev = Store.data;
    Store.data = {
      threads: { t1: { id: 't1', name: 'Vozes', created: 1 } },
      notes: {
        t1: [
          { clientId: 'a', threadId: 't1', text: '', audio: { url: 'x', transcript: 'comprar leite amanhã' } },
          { clientId: 'b', threadId: 't1', text: 'nota escrita' },
        ],
      },
    };
    try {
      const ctx = WorkspaceAiMethods._buildAiContext();
      assert.match(ctx, /\[áudio transcrito\] comprar leite amanhã/,
        'a transcrição precisa entrar no contexto da IA');
      assert.match(ctx, /\[nota:b\] nota escrita/, 'as notas de texto continuam no contexto, agora com o ID');
    } finally {
      Store.data = prev;
    }
  });
});

describe('cliente de transcrição', () => {
  const AUDIO = 'https://exemplo.test/fala.webm';
  const blob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });

  it('manda a URL pública para o proxy com a sessão', async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), opts });
      return { ok: true, status: 200, json: async () => ({ text: '  olá mundo  ' }) };
    };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    const out = await transcribeAudio(AUDIO, { mime: 'audio/webm', token: 'tok-teste' });

    assert.equal(out, 'olá mundo');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/transcribe');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok-teste');
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.audioUrl, AUDIO);
    assert.equal(body.mime, 'audio/webm');
    assert.equal(body.key, undefined, 'a chave do Gemini não participa mais da transcrição');
  });

  it('gravação local (blob) vai em base64 para o proxy', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      assert.equal(url, '/api/transcribe');
      body = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ text: 'fala local' }) };
    };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    const out = await transcribeAudio(blob(), { token: 'tok-teste' });

    assert.equal(out, 'fala local');
    assert.equal(body.audioBase64, Buffer.from([1, 2, 3, 4]).toString('base64'));
    assert.equal(body.mime, 'audio/webm');
  });

  it('sem sessão: orienta a entrar antes de chamar o proxy', async () => {
    let called = false;
    global.fetch = async () => { called = true; throw new Error('não deveria chamar'); };
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    await assert.rejects(transcribeAudio(AUDIO), /Entre na sua conta para transcrever/);
    assert.equal(called, false);
  });

  it('erro do provedor chega legível na bolha', async () => {
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'muitas transcrições' } }) });
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    await assert.rejects(transcribeAudio(AUDIO, { token: 'tok' }), /muitas transcrições/);
  });

  it('resposta sem fala vira erro em vez de bolha vazia', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ text: '   ' }) });
    const { transcribeAudio } = await import('../public/js/transcribe.js');
    await assert.rejects(transcribeAudio(AUDIO, { token: 'tok' }), /Não consegui extrair fala/);
  });
});
