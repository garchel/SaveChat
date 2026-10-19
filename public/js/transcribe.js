// Transcrição de mensagens de voz — compartilhada entre a bolha da conversa e
// o assistente de IA. O áudio é lido da própria nota (URL pública do bucket ou
// objectURL local) e vai ao Gemini pelo provedor do app (`/api/ai`) ou, para
// quem configurou a própria chave, direto no Google (BYOK).
import { getSupa, USE_SUPABASE, SUPABASE_ANON_KEY } from './sync-supabase.js';

// Duplicado de propósito de `TRANSCRIBE_MODEL` em workspace-ai.js: a regra do
// repo é replicar constantes de módulo em vez de criar dependência entre eles.
const TRANSCRIBE_MODEL = 'gemini-3.6-flash';
const PROMPT = 'Transcreva este áudio em português brasileiro, fielmente, sem comentários. Responda APENAS com a transcrição.';

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

export async function transcribeAudio(url, { key = '', mime = '' } = {}) {
  if (!url) throw new Error('Áudio indisponível.');
  // falha antes de baixar o áudio: sem sessão não há como autenticar no proxy
  let token = '';
  if (!key) {
    token = await sessionToken();
    if (!token) throw new Error('Entre na sua conta para transcrever o áudio.');
  }

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('Não foi possível carregar o áudio.');
  }
  if (!res.ok) throw new Error('Não foi possível carregar o áudio.');
  const blob = await res.blob();

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: PROMPT },
        // `blob.type` pode vir vazio/octet-stream de um storage: a nota guarda
        // o MIME real da gravação, então ele é o plano B.
        { inlineData: { mimeType: blob.type || mime || 'audio/webm', data: await toBase64(blob) } },
      ],
    }],
    // sem "thinking": a transcrição é uma tarefa direta e o orçamento curto
    // (1024 tokens) seria consumido por raciocínio, devolvendo texto vazio.
    generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  };

  let response;
  if (key) {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(TRANSCRIBE_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
    });
  } else {
    response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ model: TRANSCRIBE_MODEL, payload }),
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data.error && data.error.message) || `Erro da API (${response.status})`);
  const out = (((data.candidates || [])[0] || {}).content && data.candidates[0].content.parts || [])
    .map((p) => p.text || '').join('').trim();
  if (!out) throw new Error('Não consegui extrair fala deste áudio.');
  return out;
}
