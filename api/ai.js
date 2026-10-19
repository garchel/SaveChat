// Proxy do assistente de IA (Vercel Function).
//
// POR QUE ESTE ARQUIVO EXISTE
// O SaveChat é um site estático: tudo em `public/` chega ao navegador, então
// qualquer chave colocada no cliente é pública (e ficaria no histórico do
// git). A chave do Gemini vive em `GEMINI_API_KEY` — variável de ambiente do
// projeto na Vercel, configurada no painel — e só é usada aqui, no servidor.
//
// SEM CHAVE VÁLIDA, NINGUÉM USA A COTA DO PROJETO: o endpoint exige a sessão
// do Supabase do usuário (Authorization: Bearer <access_token>) e a valida
// contra o próprio Supabase antes de repassar a chamada.
//
// O cliente continua podendo usar a própria chave (BYOK): nesse caso ele
// fala direto com o Google e nem toca aqui. Este caminho é o padrão.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Valor público (o mesmo de public/index.html); dá para sobrescrever por
// env var se o projeto do Supabase mudar.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dcttsnttbtsvpnfwtoaj.supabase.co';

const MAX_BODY_BYTES = 4 * 1024 * 1024; // teto do corpo da função na Vercel
const MAX_OUTPUT_TOKENS = 4096;
const MODEL_RE = /^gemini-[a-z0-9][a-z0-9.-]{1,60}$/;
const RETRYABLE = new Set([429, 503]);
const ATTEMPTS = 2;
// Quando o modelo pedido está em pico (503) ou sem cota (429), tenta um
// modelo estável da mesma família antes de desistir. Fica tudo dentro do
// orçamento de tempo da função (maxDuration = 60s em vercel.json).
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash'];
const TOTAL_BUDGET_MS = 50000;
const ATTEMPT_TIMEOUT_MS = 20000;

const send = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
};

const fail = (res, status, message) => send(res, status, { error: { message, code: status } });

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Corpo grande demais'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Corpo inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function isValidSession(token, anonKey) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function callGemini(model, body, apiKey) {
  const models = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let last = null;

  for (const current of models) {
    const url = `${GEMINI_BASE}/${encodeURIComponent(current)}:generateContent`;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) return last || { status: 504, text: '{"error":{"message":"A IA demorou para responder."}}' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, ATTEMPT_TIMEOUT_MS));
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: controller.signal,
        });
        const text = await r.text();
        last = { status: r.status, text };
        if (r.ok) return last;
        // Pedido inválido (4xx) não melhora trocando de modelo.
        if (!RETRYABLE.has(r.status)) return last;
      } catch (e) {
        last = {
          status: 502,
          text: JSON.stringify({ error: { message: e.name === 'AbortError' ? 'A IA demorou para responder.' : 'Falha ao falar com o Gemini.' } }),
        };
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  return last;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido.');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(res, 503, 'O assistente ainda não foi configurado neste servidor. Adicione sua chave em Configurar IA ou avise o administrador.');
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return fail(res, 401, 'Entre na sua conta para usar a IA.');

  // A anon key do Supabase é pública (vai no HTML) e o cliente a envia no
  // header `apikey`, como qualquer cliente Supabase. Ela só identifica o
  // projeto na validação abaixo; a autorização é o token do usuário.
  const anonKey = String(req.headers.apikey || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!anonKey) return fail(res, 503, 'Configuração do Supabase ausente no servidor.');
  if (!(await isValidSession(token, anonKey))) return fail(res, 401, 'Sessão expirada. Entre de novo para usar a IA.');

  let payload;
  try {
    payload = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, e.message || 'Corpo inválido.');
  }

  const model = payload && payload.model;
  const geminiBody = payload && payload.payload;
  if (typeof model !== 'string' || !MODEL_RE.test(model)) return fail(res, 400, 'Modelo inválido.');
  if (!geminiBody || typeof geminiBody !== 'object') return fail(res, 400, 'Pedido inválido.');

  // O cliente não decide o teto de saída: sem isso, um POST manual poderia
  // pedir uma geração caríssima com a cota do projeto.
  const generationConfig = Object.assign({}, geminiBody.generationConfig);
  const wanted = Number(generationConfig.maxOutputTokens) || MAX_OUTPUT_TOKENS;
  generationConfig.maxOutputTokens = Math.min(wanted, MAX_OUTPUT_TOKENS);
  const body = JSON.stringify(Object.assign({}, geminiBody, { generationConfig }));

  const out = await callGemini(model, body, apiKey);
  res.statusCode = out.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(out.text);
};
