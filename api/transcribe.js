// Proxy de transcrição (Groq Whisper) — Vercel Function.
//
// O app é estático: tudo em `public/` chega ao navegador, então a chave da
// Groq fica em `GROQ_API_KEY` (variável de ambiente do projeto) e só é usada
// aqui. O endpoint exige a sessão do Supabase do usuário, como o /api/ai, para
// ninguém consumir a cota do projeto sem estar logado.
//
// O cliente manda a URL pública do áudio (bucket do Supabase) ou o áudio em
// base64 (gravação local / página da IA). A URL só é aceita se for do próprio
// projeto e do storage público — evita que o endpoint vire um proxy SSRF.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dcttsnttbtsvpnfwtoaj.supabase.co';
const MODEL = process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo';
const MAX_BODY_BYTES = 4 * 1024 * 1024; // teto do corpo JSON na Vercel
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // limite do plano free da Groq é 25 MB
const TIMEOUT_MS = 50000; // maxDuration = 60s em vercel.json

const send = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
};

const fail = (res, status, message) => send(res, status, { error: { message, code: status } });

function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
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

function normalizeMime(mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase();
  return /^audio\/[a-z0-9.+-]+$/.test(m) ? m : 'audio/webm';
}

function extensionFor(mime) {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  return 'webm';
}

function allowedAudioUrl(raw) {
  let url;
  let base;
  try {
    url = new URL(String(raw));
    base = new URL(SUPABASE_URL);
  } catch {
    return false;
  }
  return url.protocol === 'https:' &&
    url.origin === base.origin &&
    url.pathname.startsWith('/storage/v1/object/public/');
}

async function loadAudio(payload) {
  if (typeof payload.audioUrl === 'string' && payload.audioUrl) {
    if (!allowedAudioUrl(payload.audioUrl)) return { error: [400, 'Endereço de áudio inválido.'] };
    let r;
    try {
      r = await fetch(payload.audioUrl);
    } catch {
      return { error: [502, 'Não foi possível baixar o áudio.'] };
    }
    if (!r.ok) return { error: [502, 'Não foi possível baixar o áudio.'] };
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared > MAX_AUDIO_BYTES) return { error: [413, 'Áudio grande demais para transcrever (máx. 24 MB).'] };
    const buffer = Buffer.from(await r.arrayBuffer());
    if (!buffer.length) return { error: [400, 'Áudio vazio.'] };
    if (buffer.length > MAX_AUDIO_BYTES) return { error: [413, 'Áudio grande demais para transcrever (máx. 24 MB).'] };
    return { buffer, mime: normalizeMime(payload.mime || r.headers.get('content-type')) };
  }

  if (typeof payload.audioBase64 === 'string' && payload.audioBase64) {
    const buffer = Buffer.from(payload.audioBase64, 'base64');
    if (!buffer.length) return { error: [400, 'Áudio inválido.'] };
    if (buffer.length > MAX_AUDIO_BYTES) return { error: [413, 'Áudio grande demais para transcrever (máx. 24 MB).'] };
    return { buffer, mime: normalizeMime(payload.mime) };
  }

  return { error: [400, 'Áudio não informado.'] };
}

async function callGroq(buffer, mime, apiKey) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `audio.${extensionFor(mime)}`);
  form.append('model', MODEL);
  form.append('language', 'pt');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    const raw = await r.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    if (r.ok) {
      const text = String(data.text || '').trim();
      return text ? { text } : { error: [422, 'Não consegui extrair fala deste áudio.'] };
    }
    if (r.status === 429) return { error: [429, 'Muitas transcrições em pouco tempo. Tente de novo em instantes.'] };
    if (r.status === 401 || r.status === 403) return { error: [502, 'A transcrição não está configurada corretamente no servidor.'] };
    if (r.status === 413) return { error: [413, 'Áudio grande demais para transcrever.'] };
    return { error: [502, (data.error && data.error.message) || 'Não foi possível transcrever este áudio agora.'] };
  } catch (e) {
    if (e.name === 'AbortError') return { error: [504, 'A transcrição demorou para responder.'] };
    return { error: [502, 'Falha ao falar com o serviço de transcrição.'] };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido.');

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return fail(res, 503, 'A transcrição ainda não foi configurada neste servidor. Avise o administrador.');
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return fail(res, 401, 'Entre na sua conta para transcrever o áudio.');

  const anonKey = String(req.headers.apikey || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!anonKey) return fail(res, 503, 'Configuração do Supabase ausente no servidor.');
  if (!(await isValidSession(token, anonKey))) return fail(res, 401, 'Sessão expirada. Entre de novo para transcrever.');

  let payload;
  try {
    payload = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, e.message || 'Corpo inválido.');
  }

  const audio = await loadAudio(payload || {});
  if (audio.error) return fail(res, audio.error[0], audio.error[1]);

  const out = await callGroq(audio.buffer, audio.mime, apiKey);
  if (out.error) return fail(res, out.error[0], out.error[1]);
  return send(res, 200, { text: out.text });
};
