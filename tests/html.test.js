const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('fs');
const path = require('path');

// O index.html foi modularizado: login, explorer, workspace e menus agora
// moram em public/partials/*.txt e entram no lugar de marcadores
// <!--#include file=...--> (comentários, que o browser ignora). O build inlina
// tudo em produção, então dist/index.html continua sendo um arquivo único.
//
// Estes testes cobrem as duas faces dessa divisão: o source (dev, com marcadores)
// e o HTML montado (produção, sem marcadores).
describe('HTML modularizado', () => {
  const index = readFileSync('public/index.html', 'utf8');

  const partialsDir = 'public/partials';
  const partials = existsSync(partialsDir) ? readdirSync(partialsDir) : [];

  const marcadores = Array.from(index.matchAll(/<!--#include file=([^>]+?)-->/g)).map((m) => m[1]);

  it('index.html tem marcadores de include', () => {
    assert.ok(marcadores.length > 0, 'nenhum marcador <!--#include--> no index.html');
  });

  it('todo marcador aponta para um partial que existe', () => {
    for (const rel of marcadores) {
      const alvo = path.join('public', rel);
      assert.ok(existsSync(alvo), `marcador aponta para arquivo inexistente: ${rel}`);
    }
  });

  it('todo partial está no precache do SW (dev offline quebraria sem ele)', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    for (const f of partials) {
      assert.ok(sw.includes(`'./partials/${f}'`), `partials/${f} ausente do precache do SW`);
    }
  });

  it('partials.js está no precache e no npm run check', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    assert.ok(sw.includes("'./js/partials.js'"), 'partials.js ausente do precache do SW');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.ok(pkg.scripts.check.includes('node --check public/js/partials.js'),
      'partials.js não passa por node --check');
  });

  it('o regex do partials.js casa o nodeValue real de um comentário', () => {
    // BUG REAL que quebrou o app inteiro: no DOM, o nodeValue de um COMMENT é o
    // texto DENTRO dos delimitadores. <!--#include file=x.txt--> tem
    // nodeValue === '#include file=x.txt'. Um regex que exige os delimitadores
    // nunca acha o marcador, os partials nunca entram e o app morre com
    // "Cannot read properties of null" bem longe da causa.
    const src = readFileSync('public/js/partials.js', 'utf8');
    const re = src.match(/const MARK = (\/.*\/[gimsuy]*);/);
    assert.ok(re, 'MARK não encontrado em partials.js');
    const rx = new RegExp(re[1].slice(1, -1).replace(/^\^\\s\*#include/, '^\\s*#include'));
    assert.ok(rx.test('#include file=partials/login.txt'),
      'MARK não casa o nodeValue de um comentário (#include file=...)');
    assert.ok(!/<!--/.test(re[1]),
      'MARK não deve exigir os delimitadores <!-- e -->, que não existem no nodeValue');
  });

  it('o build inlina os partials (produção sem request extra)', () => {
    const build = readFileSync('scripts/build.mjs', 'utf8');
    assert.match(build, /resolvePartials/, 'build.mjs precisa resolver os marcadores');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.ok(pkg.scripts.build.includes('scripts/build.mjs'), 'npm run build não usa scripts/build.mjs');
  });

  it('o HTML montado tem todos os elementos que o app procura no boot', () => {
    // os ids que app.js/UI.init() acessam logo no começo — se um sumir do
    // partial, o app quebra com TypeError em vez de erro legível.
    // O HTML montado = index + partials: o composer e o popover de perfil
    // continuam no index, os demais vieram dos partials.
    const montado = index + partials.map((f) => readFileSync(path.join(partialsDir, f), 'utf8')).join('');
    const IDS = ['auth-screen', 'sidebar', 'tree', 'composer-input', 'btn-send',
      'ai-page', 'daily-page', 'ctx-menu', 'msg-popover', 'modal',
      'profile-popover', 'about-app-version'];
    const faltando = IDS.filter((id) => !montado.includes(`id="${id}"`));
    assert.deepEqual(faltando, [], `ids ausentes nos partials: ${faltando.join(', ')}`);
  });

  it('a versão aparece no HTML montado (o teste do Sobre lê o arquivo montado)', () => {
    const montado = index + partials.map((f) => readFileSync(path.join(partialsDir, f), 'utf8')).join('');
    const v = index.match(/window\.APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
    assert.ok(montado.includes(`>${v}</span>`),
      `a seção Sobre (em menus.txt) não mostra ${v} — o teste do Sobre passa a ler o HTML montado`);
  });
});
