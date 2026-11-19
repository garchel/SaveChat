// Transcrição de mensagens de voz — compartilhada entre a bolha da conversa e
// o assistente de IA. O áudio vai ao Groq Whisper pelo proxy `/api/transcribe`
// (a chave fica no servidor). Áudios salvos no Supabase vão por URL; gravações
// locais (blob) vão em base64.
import { getSupa, USE_SUPABASE, SUPABASE_ANON_KEY } from './sync-supabase.js';
import { mediaUrl } from './media.js';

const PROXY = '/api/transcribe';
const MAX_LOCAL_BYTES = 2.5 * 1024 * 1024; // base64 cresce 4/3 e o corpo do proxy tem teto de 4 MB

async function sessionToken() {
  if (!USE_SUPABASE) return '';
  try {
    const supa = await getSupa();
    const { data: { session } } = await supa.auth.getSession();
    return (session && session.access_token) || '';
  } catch (e) {
    return '';
  }
}

// base64 em blocos: `String.fromCharCode(...bytes)` estoura a pilha em áudios
// de alguns minutos (o array inteiro vira argumento da chamada).
async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let raw = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    raw += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(raw);
}

async function blobFrom(source) {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source;
  let res;
  try {
    res = await fetch(source);
  } catch (e) {
    throw new Error('Não foi possível carregar o áudio.');
  }
  if (!res.ok) throw new Error('Não foi possível carregar o áudio.');
  return res.blob();
}

export async function transcribeAudio(source, { mime = '', token = '', bucket = 'note-audio' } = {}) {
  if (!source) throw new Error('Áudio indisponível.');

  // o proxy exige sessão: sem ela, falha antes de baixar o áudio
  const auth = token || await sessionToken();
  if (!auth) throw new Error('Entre na sua conta para transcrever o áudio.');

  let src = source;
  if (typeof src === 'string' && !/^(https?:|blob:|data:)/i.test(src)) {
    src = await mediaUrl(src, bucket, { expiresIn: 300 });
    if (!src) throw new Error('Áudio indisponível.');
  }

  let body;
  if (typeof src === 'string' && /^https?:\/\//i.test(src)) {
    body = { audioUrl: src, mime };
  } else {
    const blob = await blobFrom(src);
    if (!blob.size) throw new Error('Áudio vazio.');
    if (blob.size > MAX_LOCAL_BYTES) throw new Error('Áudio grande demais para transcrever. Envie um áudio mais curto.');
    body = { audioBase64: await toBase64(blob), mime: blob.type || mime || 'audio/webm' };
  }

  let response;
  try {
    response = await fetch(PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('Não foi possível falar com o serviço de transcrição.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data.error && data.error.message) || `Erro da API (${response.status})`);
  const out = String(data.text || '').trim();
  if (!out) throw new Error('Não consegui extrair fala deste áudio.');
  return out;
}
