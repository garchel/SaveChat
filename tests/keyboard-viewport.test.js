// Teclado virtual no celular: o app precisa encolher para a área visível.
// Cobre a decisão pura (o que conta como teclado) + a integração que aplica
// as variáveis CSS e a configuração estática (viewport/SW/check).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');

const src = (p) => readFileSync(p, 'utf8');

describe('keyboard-viewport', () => {
  it('só considera teclado com um campo editável focado e diferença grande', async () => {
    const { keyboardOpen } = await import('../public/js/keyboard-viewport.js');
    assert.equal(keyboardOpen({ viewportHeight: 500, layoutHeight: 844, editing: true }), true);
    assert.equal(keyboardOpen({ viewportHeight: 500, layoutHeight: 844, editing: false }), false,
      'sem foco não há teclado (ex.: barra do navegador)');
    assert.equal(keyboardOpen({ viewportHeight: 800, layoutHeight: 844, editing: true }), false,
      'diferença pequena é chrome do navegador, não teclado');
    assert.equal(keyboardOpen({ viewportHeight: 500, layoutHeight: 844, scale: 2, editing: true }), false,
      'pinch-zoom não pode encolher o app');
    assert.equal(keyboardOpen({ viewportHeight: 0, layoutHeight: 844, editing: true }), false);
  });

  it('aplica --app-h com o campo focado e limpa ao fechar', async () => {
    const { initKeyboardViewport } = await import('../public/js/keyboard-viewport.js');
    const listeners = {};
    const vv = {
      height: 500, scale: 1, offsetTop: 0,
      addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    const style = {
      props: {},
      setProperty(k, v) { this.props[k] = v; },
      removeProperty(k) { delete this.props[k]; },
    };
    const box = { isConnected: true, scrollTop: 500, scrollHeight: 900, clientHeight: 400 };
    const old = {
      window: global.window, document: global.document,
      raf: global.requestAnimationFrame,
    };
    global.window = {
      visualViewport: vv,
      innerHeight: 844,
      matchMedia: () => ({ matches: true }),
      addEventListener() {},
    };
    global.document = {
      documentElement: { style, clientHeight: 844 },
      activeElement: { tagName: 'DIV', isContentEditable: true },
      getElementById: (id) => (id === 'messages' ? box : null),
      addEventListener() {},
    };
    global.requestAnimationFrame = (fn) => fn();
    try {
      initKeyboardViewport();
      assert.equal(style.props['--app-h'], '500px', 'o app deve encolher para a área visível');
      assert.equal(style.props['--app-top'], '0px');
      assert.equal(box.scrollTop, 900, 'a conversa deve continuar ancorada no fim');
      vv.height = 844;
      listeners.resize();
      assert.equal(style.props['--app-h'], undefined, 'ao fechar, volta para 100dvh');
    } finally {
      global.window = old.window;
      global.document = old.document;
      global.requestAnimationFrame = old.raf;
    }
  });

  it('o layout mobile usa as variáveis e removeu a faixa morta da barra antiga', () => {
    const css = src('public/styles/04-responsive.css');
    assert.match(css, /height: var\(--app-h, 100dvh\)/);
    assert.match(css, /margin-top: var\(--app-top, 0px\)/);
    assert.ok(!/calc\(62px \+ env\(safe-area-inset-bottom/.test(css),
      'a barra inferior foi removida em 1.21.0; 62px de padding deixava o composer flutuando');
  });

  it('viewport pede ao Chrome Android para redimensionar o conteúdo', () => {
    const html = src('public/index.html');
    assert.match(html, /interactive-widget=resizes-content/);
    assert.match(html, /viewport-fit=cover/, 'a correção não pode perder a safe-area');
  });

  it('o gerenciador é carregado no init, precacheado e checado', () => {
    assert.match(src('public/app.js'), /import \{ initKeyboardViewport \} from '\.\/js\/keyboard-viewport\.js'/);
    assert.match(src('public/app.js'), /async init\(\) \{\s*initKeyboardViewport\(\);/);
    assert.match(src('public/sw.js'), /'\.\/js\/keyboard-viewport\.js'/);
    assert.match(src('package.json'), /node --check public\/js\/keyboard-viewport\.js/);
    assert.ok(!/visualViewport\.addEventListener/.test(src('public/js/ui/composer.js')),
      'o handler antigo (scrollIntoView) deve sair para não brigar com o gerenciador');
  });
});
