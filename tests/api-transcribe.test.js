// Testes do proxy de transcrição (api/transcribe.js).
//
// O contrato de segurança: a chave da Groq fica no servidor, o endpoint exige
// sessão do Supabase, só baixa áudio do storage público do próprio projeto e
// não aceita URL arbitrária (SSRF).

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/transcribe.js');

const realFetch = global.fetch;
const AUDIO_URL = 'https://dcttsnttbtsvpnfwtoaj.supabase.co/storage/v1/object/public/note-audio/fala.webm';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(s) { this.body = String(s); },
  };
}

function mockReq({ method = 'POST', token = 'tok', apikey = 'anon-de-teste', body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (apikey) headers.apikey = apikey;
  return {
    method,
    headers,
    body: body || { audioBase64: Buffer.from([1, 2, 3, 4]).toString('base64'), mime: 'audio/webm' },
  };
}

const supabaseOk = () => ({ ok: true, status: 200, text: async () => '{}' });
const groqOk = (text) => ({ ok: true, status: 200, text: async () => JSON.stringify({ text }) });
const json = (status, obj) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj) });
const audioOk = (bytes) => ({
  ok: true,
  status: 200,
  headers: { get: (k) => (k.toLowerCase() === 'content-length' ? String(bytes.length) : null) },
  arrayBuffer: async () => Uint8Array.from(bytes).buffer,
});

// Só o Supabase responde; qualquer tentativa de falar com a Groq estoura.
function onlySupabase(ok = true) {
  return async (url) => {
    if (String(url).includes('/auth/v1/user')) return ok ? supabaseOk() : { ok: false, status: 401 };
    throw new Error('não deveria chamar a Groq: ' + url);
  };
}

beforeEach(() => {
  process.env.GROQ_API_KEY = 'chave-groq-de-teste';
  delete process.env.SUPABASE_ANON_KEY;
});
afterEach(() => {
  global.fetch = realFetch;
  delete process.env.GROQ_API_KEY;
  delete process.env.SUPABASE_ANON_KEY;
});

describe('api/transcribe.js (proxy do Groq Whisper)', () => {
  it('rejeita método diferente de POST', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    assert.equal(res.statusCode, 405);
  });

  it('503 quando GROQ_API_KEY não está configurada', async () => {
    delete process.env.GROQ_API_KEY;
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 503);
    assert.match(JSON.parse(res.body).error.message, /configurad/i);
  });

  it('401 sem token de sessão', async () => {
    const res = mockRes();
    await handler(mockReq({ token: '' }), res);
    assert.equal(res.statusCode, 401);
  });

  it('503 quando falta a anon key do Supabase', async () => {
    const res = mockRes();
    await handler(mockReq({ apikey: '' }), res);
    assert.equal(res.statusCode, 503);
    assert.match(JSON.parse(res.body).error.message, /Supabase/i);
  });

  it('401 quando o Supabase recusa a sessão', async () => {
    global.fetch = onlySupabase(false);
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 401);
    assert.match(JSON.parse(res.body).error.message, /sess/i);
  });

  it('recusa URL de áudio fora do storage público do projeto (SSRF)', async () => {
    let outside = false;
    global.fetch = async (url) => {
      if (String(url).includes('/auth/v1/user')) return supabaseOk();
      outside = true;
      throw new Error('não deveria buscar URL externa');
    };
    const res = mockRes();
    await handler(mockReq({ body: { audioUrl: 'https://evil.test/fala.webm' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(outside, false);
    assert.match(JSON.parse(res.body).error.message, /Endereço de áudio inválido/);
  });

  it('manda o áudio em base64 ao Whisper com a chave só no servidor', async () => {
    let call = null;
    global.fetch = async (url, opts) => {
      if (String(url).includes('/auth/v1/user')) return supabaseOk();
      call = { url: String(url), opts };
      return groqOk('  olá das notas  ');
    };
    const res = mockRes();
    await handler(mockReq(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { text: 'olá das notas' });
    assert.match(call.url, /api\.groq\.com\/openai\/v1\/audio\/transcriptions$/);
    assert.equal(call.opts.headers.Authorization, 'Bearer chave-groq-de-teste');
    assert.ok(!res.body.includes('chave-groq-de-teste'), 'a chave não pode vazar na resposta');

    const form = call.opts.body;
    assert.equal(form.get('model'), 'whisper-large-v3-turbo');
    assert.equal(form.get('language'), 'pt');
    assert.equal(form.get('response_format'), 'json');
    const file = form.get('file');
    assert.equal(file.type, 'audio/webm');
    assert.equal(file.name, 'audio.webm');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from([1, 2, 3, 4]));
  });

  it('baixa a URL pública do Supabase e repassa ao Whisper', async () => {
    let call = null;
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return supabaseOk();
      if (u === AUDIO_URL) return audioOk([5, 6, 7, 8]);
      call = { url: u, opts };
      return groqOk('fala do bucket');
    };
    const res = mockRes();
    await handler(mockReq({ body: { audioUrl: AUDIO_URL, mime: 'audio/webm' } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { text: 'fala do bucket' });
    const file = call.opts.body.get('file');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from([5, 6, 7, 8]));
  });

  it('429 da Groq vira mensagem de limite para o cliente', async () => {
    global.fetch = async (url) => {
      if (String(url).includes('/auth/v1/user')) return supabaseOk();
      return json(429, { error: { message: 'rate limit' } });
    };
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 429);
    assert.match(JSON.parse(res.body).error.message, /Muitas transcrições/);
  });

  it('resposta sem fala vira 422 em vez de texto vazio', async () => {
    global.fetch = async (url) => {
      if (String(url).includes('/auth/v1/user')) return supabaseOk();
      return groqOk('   ');
    };
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 422);
    assert.match(JSON.parse(res.body).error.message, /extrair fala/);
  });
});
