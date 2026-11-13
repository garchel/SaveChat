const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync, rmSync } = require('fs');
const { join } = require('path');

// Guarda do contrato entre o build e a produção: a Vercel passou a servir
// dist/ (antes servia public/, o que anulava todo o build). Estes testes são o
// que impede o dist de voltar a ser um artefato quebrado ou incompleto.
//
// O caso real que motivou o arquivo: o sw.js precacheia styles/*.css, que o
// build omite do dist. Em produção o cache.addAll() tomaria 21 × 404 e o
// install do service worker falharia inteiro (sem offline, sem update).
describe('build de produção (dist)', () => {
  let dist;

  before(async () => {
    const { build } = await import('../scripts/build.mjs');
    build();
    dist = 'dist';
  });

  it('existe e tem os dois arquivos de entrada', () => {
    assert.ok(existsSync(join(dist, 'index.html')), 'index.html ausente');
    assert.ok(existsSync(join(dist, 'styles.css')), 'styles.css ausente');
  });

  it('CSS do dist está achatado (sem @import)', () => {
    const css = readFileSync(join(dist, 'styles.css'), 'utf8');
    assert.equal(css.includes('@import'), false, 'dist/styles.css ainda tem @import');
  });

  it('HTML do dist não tem marcador de partial', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    assert.equal(html.includes('<!--#include'), false, 'dist/index.html ainda tem #include');
  });

  it('todo asset do sw.js do dist existe de fato', () => {
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    const m = sw.match(/ASSETS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(m, 'ASSETS não encontrado no sw.js');
    const list = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    const faltando = list.filter((p) => p !== './' && p !== '.' && !existsSync(join(dist, p.replace(/^\.\//, ''))));
    assert.deepEqual(faltando, [], 'sw.js do dist precacheia arquivos inexistentes');
    // e o inverso: nada de styles/partials, que o build não emite
    assert.equal(sw.includes('./styles/'), false, 'sw.js do dist ainda lista styles/');
    assert.equal(sw.includes('./partials/'), false, 'sw.js do dist ainda lista partials/');
  });

  it('todo módulo do dist mantém seus imports resolvíveis', () => {
    // Um import quebrado derruba o grafo inteiro em runtime (o app não boota)
    const dir = join(dist, 'js');
    const arquivos = [];
    (function walk(d) {
      for (const f of readdirSync(d)) {
        const full = join(d, f);
        if (require('fs').statSync(full).isDirectory()) walk(full);
        else if (f.endsWith('.js')) arquivos.push(full);
      }
    })(dir);
    const quebrados = [];
    for (const f of arquivos) {
      const src = readFileSync(f, 'utf8');
      const re = /(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g;
      let m;
      while ((m = re.exec(src))) {
        const target = join(require('path').dirname(f), m[1]);
        if (!existsSync(target)) quebrados.push(f + ' -> ' + m[1]);
      }
    }
    assert.deepEqual(quebrados, [], 'imports apontando para arquivo inexistente no dist');
  });
});
