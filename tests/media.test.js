const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');
const loadMedia = () => import('../public/js/media.js');

describe('mídia privada', () => {
  it('extrai bucket e path de URL pública, assinada ou de path puro', async () => {
    const { mediaRefInfo } = await loadMedia();
    assert.deepEqual(
      mediaRefInfo('https://proj.supabase.co/storage/v1/object/public/note-images/u/1.jpg'),
      { bucket: 'note-images', path: 'u/1.jpg' },
    );
    assert.deepEqual(
      mediaRefInfo('https://proj.supabase.co/storage/v1/object/sign/note-audio/u/fala.webm?token=abc'),
      { bucket: 'note-audio', path: 'u/fala.webm' },
    );
    assert.deepEqual(mediaRefInfo('u/2%20foto.jpg'), { bucket: '', path: 'u/2 foto.jpg' });
  });

  it('não trata data/blob/URL externa como mídia do storage', async () => {
    const { mediaRefInfo } = await loadMedia();
    assert.equal(mediaRefInfo('data:image/png;base64,abc'), null);
    assert.equal(mediaRefInfo('blob:https://app.test/123'), null);
    assert.equal(mediaRefInfo('https://exemplo.test/foto.jpg'), null);
    assert.equal(mediaRefInfo(''), null);
  });

  it('devolve URL externa/data sem tentar assinar', async () => {
    const { mediaUrl } = await loadMedia();
    assert.equal(await mediaUrl('https://exemplo.test/foto.jpg', 'note-images'), 'https://exemplo.test/foto.jpg');
    assert.equal(await mediaUrl('data:image/png;base64,abc', 'note-images'), 'data:image/png;base64,abc');
  });

  it('sem Supabase, path de storage não vira URL silenciosamente', async () => {
    const { mediaUrl } = await loadMedia();
    assert.equal(await mediaUrl('u/1.jpg', 'note-images'), '');
  });

  it('uploads novos guardam path e não getPublicUrl', () => {
    const composer = readFileSync('public/js/ui/composer.js', 'utf8');
    const audio = readFileSync('public/js/ui/composer-audio.js', 'utf8');
    assert.ok(!composer.includes('getPublicUrl'), 'imagem não pode guardar URL pública');
    assert.ok(!audio.includes('getPublicUrl'), 'áudio não pode guardar URL pública');
    assert.match(composer, /this\.pendingImages\.push\(path\)/);
    assert.match(audio, /return path;/);
    assert.match(audio, /path: path \|\| null/);
  });

  it('supabase.sql deixa os buckets privados e remove leitura pública', () => {
    const sql = readFileSync('supabase.sql', 'utf8');
    assert.match(sql, /values \('note-images', 'note-images', false\)/);
    assert.match(sql, /values \('note-audio', 'note-audio', false, 26214400\)/);
    assert.match(sql, /drop policy if exists "public read images" on storage\.objects;/);
    assert.match(sql, /drop policy if exists "public read audio" on storage\.objects;/);
    assert.ok(!/create policy "public read/.test(sql), 'não pode recriar policy pública');
  });

  it('logout limpa o cache de URLs assinadas', () => {
    const auth = readFileSync('public/js/ui/auth.js', 'utf8');
    assert.match(auth, /clearMediaCache\(\)/);
  });

  it('media.js está no precache do SW e no npm run check', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    assert.ok(sw.includes("'./js/media.js'"), 'media.js ausente do precache do SW');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.ok(pkg.scripts.check.includes('node --check public/js/media.js'));
  });
});
