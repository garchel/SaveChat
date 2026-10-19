// Testes do proxy do assistente (api/ai.js).
//
// O que importa aqui é o contrato de segurança: a chave do Gemini nunca sai
// do servidor, o endpoint não funciona sem sessão do Supabase, o modelo é
// validado e o cliente não consegue pedir uma geração acima do teto.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/ai.js');

const realFetch = global.fetch;

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
    body: body || { model: 'gemini-3.8-flash', payload: { contents: [{ role: 'user', parts: [{ text: 'oi' }] }] } },
  };
}

const json = (status, obj) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj) });
const geminiOk = (text = 'Olá') => json(200, { candidates: [{ content: { parts: [{ text }] } }] });
const supabaseOk = () => ({ ok: true, status: 200, text: async () => '{}' });

// Só o Supabase responde; qualquer tentativa de falar com o Gemini estoura.
function onlySupabase(ok = true) {
  return async (url) => {
    if (String(url).includes('/auth/v1/user')) return ok ? supabaseOk() : { ok: false, status: 401 };
    throw new Error('não deveria chamar o Gemini: ' + url);
  };
}

beforeEach(() => { process.env.GEMINI_API_KEY = 'chave-de-teste'; delete process.env.SUPABASE_ANON_KEY; });
afterEach(() => { global.fetch = realFetch; delete process.env.GEMINI_API_KEY; delete process.env.SUPABASE_ANON_KEY; });

describe('api/ai.js (proxy do Gemini)', () => {
  it('rejeita método diferente de POST', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    assert.equal(res.statusCode, 405);
  });

  it('503 quando GEMINI_API_KEY não está configurada', async () => {
    delete process.env.GEMINI_API_KEY;
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

  it('503 quando o cliente não manda a anon key e o servidor não tem env', async () => {
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

  it('repassa a resposta e manda a chave só para o Gemini', async () => {
    let call = null;
    let authCall = null;
    global.fetch = async (url, opts) => {
      if (String(url).includes('/auth/v1/user')) { authCall = { url: String(url), opts }; return supabaseOk(); }
      call = { url: String(url), opts };
      return geminiOk('Olá das notas');
    };
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Olá das notas/);
    assert.match(call.url, /gemini-3\.8-flash:generateContent$/);
    assert.equal(call.opts.headers['x-goog-api-key'], 'chave-de-teste');
    // a anon key é repassada ao Supabase, não ao Gemini
    assert.equal(authCall.opts.headers.apikey, 'anon-de-teste');
    assert.equal(authCall.opts.headers.Authorization, 'Bearer tok');
    // a chave não pode aparecer na resposta ao cliente
    assert.ok(!res.body.includes('chave-de-teste'));
  });

  it('limita maxOutputTokens ao teto do servidor', async () => {
    let sent = null;
    global.fetch = async (url, opts) => {
      if (String(url).includes('/auth/v1/user')) return supabaseOk();
      sent = JSON.parse(opts.body);
      return geminiOk();
    };
    const res = mockRes();
    await handler(mockReq({ body: { model: 'gemini-3.8-flash', payload: { contents: [], generationConfig: { maxOutputTokens: 999999 } } } }), res);
    assert.equal(sent.generationConfig.maxOutputTokens, 4096);
  });

  it('rejeita modelo fora do padrão Gemini', async () => {
    global.fetch = onlySupabase(true);
    const res = mockRes();
    await handler(mockReq({ body: { model: 'gpt-4', payload: {} } }), res);
    assert.equal(res.statusCode, 400);
  });

  it('tenta de novo quando o Gemini responde 503 (pico de demanda)', async () => {
    let calls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('/auth/v1/user')) return supabaseOk();
      calls += 1;
      if (calls === 1) return json(503, { error: { message: 'high demand' } });
      return geminiOk('depois do retry');
    };
    const res = mockRes();
    await handler(mockReq(), res);
    assert.equal(calls, 2);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /retry/);
  });

  it('troca para um modelo estável quando o pedido segue em 503', async () => {
    const seen = [];
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return supabaseOk();
      seen.push(u.match(/models\/([^:]+):/)[1]);
      if (u.includes('/gemini-3.8-flash:')) return json(503, { error: { message: 'high demand' } });
      return geminiOk('do fallback');
    };
    const res = mockRes();
    await handler(mockReq({ body: { model: 'gemini-3.8-flash', payload: { contents: [] } } }), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /do fallback/);
    assert.ok(seen.includes('gemini-3.6-flash'), 'tentou o modelo de fallback');
  });
});
