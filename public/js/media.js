import { getSupa, USE_SUPABASE, SUPABASE_URL } from './sync-supabase.js';

const SIGNED_TTL = 3600;
const REFRESH_MARGIN = 30000;
const signedCache = new Map();

function decodePath(path) {
  try { return decodeURIComponent(path); } catch (e) { return path; }
}

export function mediaRefInfo(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  if (/^(data|blob):/i.test(raw)) return null;
  if (!/^https?:\/\//i.test(raw)) return { bucket: '', path: decodePath(raw.replace(/^\/+/, '')) };
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodePath(m[1]), path: decodePath(m[2]) };
  } catch (e) {
    return null;
  }
}

export async function mediaUrl(ref, bucket = 'note-images', { expiresIn = SIGNED_TTL } = {}) {
  const info = mediaRefInfo(ref);
  if (!info) return String(ref || '');
  if (!USE_SUPABASE) return '';
  const bucketName = info.bucket || bucket;
  const key = `${bucketName}/${info.path}`;
  const now = Date.now();
  const hit = signedCache.get(key);
  if (hit && hit.expiresAt > now + REFRESH_MARGIN) return hit.url;

  const supa = await getSupa();
  const ttl = Math.max(60, Number(expiresIn) || SIGNED_TTL);
  const { data, error } = await supa.storage.from(bucketName).createSignedUrl(info.path, ttl);
  if (error || !data || !data.signedUrl) throw error || new Error('Não foi possível assinar a mídia.');
  const signed = data.signedUrl.startsWith('http') ? data.signedUrl : `${SUPABASE_URL}${data.signedUrl}`;
  signedCache.set(key, { url: signed, expiresAt: now + ttl * 1000 });
  return signed;
}

export function clearMediaCache() {
  signedCache.clear();
}

export async function hydrateMedia(root, bucket = 'note-images') {
  if (!root || !root.querySelectorAll) return;
  const imgs = Array.from(root.querySelectorAll('img[data-media-ref]'));
  await Promise.all(imgs.map(async (img) => {
    const ref = img.dataset.mediaRef;
    try {
      const url = await mediaUrl(ref, img.dataset.mediaBucket || bucket);
      if (url) {
        img.src = url;
        img.removeAttribute('data-media-ref');
        img.removeAttribute('data-media-bucket');
      }
    } catch (e) {
      img.alt = 'anexo indisponível';
    }
  }));
}
