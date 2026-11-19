const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync, statSync } = require('fs');
const { join, dirname } = require('path');

// Guarda do contrato entre o build e a produção: a Vercel serve dist/ (antes
// servia public/, o que anulava todo o build). Estes testes são o que impede o
// dist de voltar a ser um artefato quebrado ou incompleto.
//
// Dois casos reais motivaram o arquivo:
//  - o sw.js precacheava styles/*.css, que o build omite → cache.addAll() com
//    21×404 derrubava o install do service worker inteiro;
//  - o JS empacotado deixou de copiar scripts clássicos (error-tracking.js),
//    que o index.html referencia → 404 silencioso no boot.
describe('build de produção (dist)', () => {
  const dist = 'dist';
  let html = '';
  let appFile = '';
  let cssFile = '';

  before(async () => {
    const { build } = await import('../scripts/build.mjs');
    await build();
    html = readFileSync(join(dist, 'index.html'), 'utf8');
    const mCss = html.match(/href="(styles\.[0-9a-f]{8}\.css)"/);
    const mApp = html.match(/src="(app\.[A-Z0-9]+\.js)"/);
    cssFile = mCss && mCss[1];
    appFile = mApp && mApp[1];
  });

  it('index.html aponta para app e css com hash, e eles existem', () => {
    assert.ok(cssFile, 'index.html não aponta para styles.<hash>.css');
    assert.ok(appFile, 'index.html não aponta para app.<hash>.js');
    assert.ok(existsSync(join(dist, cssFile)), 'CSS referenciado não existe');
    assert.ok(existsSync(join(dist, appFile)), 'JS referenciado não existe');
  });

  it('CSS do dist está achatado (sem @import)', () => {
    const css = readFileSync(join(dist, cssFile), 'utf8');
    assert.equal(css.includes('@import'), false, 'CSS do dist ainda tem @import');
  });

  it('HTML do dist não tem marcador de partial', () => {
    assert.equal(html.includes('<!--#include'), false, 'index.html do dist ainda tem #include');
  });

  it('scripts clássicos do index.html existem no dist', () => {
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    const faltando = srcs.filter((s) => !/^https?:/.test(s) && !existsSync(join(dist, s)));
    assert.deepEqual(faltando, [], 'script referenciado pelo HTML não existe no dist');
  });

  it('todo asset do sw.js do dist existe de fato', () => {
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    const m = sw.match(/ASSETS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(m, 'ASSETS não encontrado no sw.js');
    const list = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    const faltando = list.filter((p) => p !== './' && p !== '.' && !existsSync(join(dist, p.replace(/^\.\//, ''))));
    assert.deepEqual(faltando, [], 'sw.js do dist precacheia arquivos inexistentes');
    // e tem de precachear o app/css com hash, senão o offline fica sem o app
    assert.ok(list.some((p) => p.includes(appFile)), 'sw.js não precacheia ' + appFile);
    assert.ok(list.some((p) => p.includes(cssFile)), 'sw.js não precacheia ' + cssFile);
    // e o inverso: nada de styles/partials, que o build não emite
    assert.equal(sw.includes('./styles/'), false, 'sw.js do dist ainda lista styles/');
    assert.equal(sw.includes('./partials/'), false, 'sw.js do dist ainda lista partials/');
  });

  it('todo chunk/import referenciado pelo app existe no dist', () => {
    const src = readFileSync(join(dist, appFile), 'utf8');
    const refs = [...src.matchAll(/['"]\.?\/?(js\/[A-Za-z0-9_.-]+\.js)['"]/g)].map((m) => m[1]);
    const faltando = [...new Set(refs)].filter((r) => !existsSync(join(dist, r)));
    assert.deepEqual(faltando, [], 'chunk referenciado pelo bundle não existe no dist');
  });

  it('os módulos não foram copiados soltos (o grafo está empacotado)', () => {
    // se o esbuild parar de empacotar por algum motivo, os ~50 módulos voltam
    // a aparecer aqui — e o número de requests explode de novo
    const dir = join(dist, 'js');
    const soltos = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith('.js') && !/\.[A-Z0-9]{8,}\.js$/.test(f) && f !== 'error-tracking.js' && f !== 'friendly-names.js')
      : [];
    assert.ok(soltos.length <= 2, 'módulos soltos no dist: ' + soltos.slice(0, 6).join(', '));
  });

  it('supabase vem do pacote local, não do esm.sh', () => {
    // empacotar o Supabase tira ~20 requests de terceiro do boot; se o plugin
    // parar de resolver, esses módulos voltam silenciosamente pela URL
    const src = readFileSync(join(dist, appFile), 'utf8');
    assert.equal(src.includes('esm.sh/@supabase'), false, 'Supabase ainda vem do CDN no dist');
    assert.ok(src.includes('createClient'), 'createClient não está no bundle');
  });

  it('todo arquivo JS do dist tem tamanho razoável (nada vazio)', () => {
    const vazios = [];
    (function walk(d) {
      for (const f of readdirSync(d)) {
        const full = join(d, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (f.endsWith('.js') && statSync(full).size < 50) vazios.push(full);
      }
    })(dist);
    assert.deepEqual(vazios, [], 'arquivos JS suspeitos (vazios) no dist');
  });
});
