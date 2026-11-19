const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// O minificador do build já truncou uma linha real em produção:
//   return toBase64(v).replace(/\//g, '_').replace(/=+$/g, '');
// virou `.replace(/\` — o `\/` seguido do `/` delimitador forma `//`, o scanner
// antigo lia como comentário de linha e o dist inteiro deixava de bootar com
// "Invalid regular expression: missing /". Estes testes travam a classe do bug.
describe('build: minifyJs preserva regex literal', async () => {
  const { minifyJs } = await import('../scripts/build.mjs');

  it('regex com barra escapada sobrevive (caso real do crypto.js)', () => {
    const src = "return toBase64(value).replace(/\\//g, '_').replace(/=+$/g, '');";
    const out = minifyJs(src);
    assert.equal(out.trim(), src);
    // o regex precisa continuar fechado
    assert.match(out, /replace\(\/\\\/\/g/);
  });

  it('nao trata // dentro de regex como comentario', () => {
    const out = minifyJs("const re = /https?:\\/\\//;");
    assert.match(out, /\/https\?:\\\/\\\//);
  });

  it('regex com classe de caracteres contendo barra', () => {
    const out = minifyJs("const re = /[a/b]/g;");
    assert.match(out, /\[a\/b\]/);
  });

  it('division nao vira regex', () => {
    const out = minifyJs('const r = a / b; const s = x / 2 / 3;');
    assert.match(out, /a \/ b/);
    assert.match(out, /x \/ 2 \/ 3/);
  });

  it('regex depois de return (palavra-chave)', () => {
    const out = minifyJs('function f(){ return /ab+c/i.test(x); }');
    assert.match(out, /return \/ab\+c\/i/);
  });

  it('remove comentario de linha e de bloco', () => {
    const out = minifyJs('const a = 1; // some\n/* some\ntambem */\nconst b = 2;');
    assert.equal(out.includes('some'), false);
    assert.equal(out.includes('tambem'), false);
    assert.match(out, /const a = 1;/);
    assert.match(out, /const b = 2;/);
  });

  it('preserva // dentro de string e de template', () => {
    const out = minifyJs("const u = 'https://x/y'; const t = `a // b ${u}`;");
    assert.match(out, /'https:\/\/x\/y'/);
    assert.match(out, /`a \/\/ b \$\{u\}`/);
  });

  it('aspas escapadas nao encerram a string', () => {
    const out = minifyJs("const s = 'a\\'b'; const n = 1;");
    assert.match(out, /'a\\'b'/);
    assert.match(out, /const n = 1/);
  });
});
