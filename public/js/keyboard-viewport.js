// Teclado virtual: mantém o app inteiro acima da área coberta.
//
// Chrome Android já encolhe o layout quando o teclado abre por causa do
// `interactive-widget=resizes-content` no meta viewport (e o `100dvh` segue).
// iOS Safari e navegadores embutidos só encolhem a viewport VISUAL: o layout
// continua com a altura cheia e o composer termina atrás do teclado. Nesses
// casos reduzimos o `.app` para `visualViewport.height` (e compensamos o
// deslocamento da viewport visual com `--app-top`).

const MIN_KEYBOARD = 120;

export function keyboardOpen({ viewportHeight, layoutHeight, scale = 1, editing = false }) {
  if (!editing) return false;
  if (Number(scale) > 1.05) return false; // pinch-zoom também encolhe a viewport visual
  const vh = Number(viewportHeight);
  const lh = Number(layoutHeight);
  return vh > 0 && lh > 0 && vh < lh - MIN_KEYBOARD;
}

export function initKeyboardViewport() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  const root = document.documentElement;
  const mobile = () => window.matchMedia('(max-width: 760px)').matches;
  const editing = () => {
    const el = document.activeElement;
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
  };
  const clear = () => {
    root.style.removeProperty('--app-h');
    root.style.removeProperty('--app-top');
  };

  const apply = () => {
    if (!mobile()) { clear(); return; }
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const open = keyboardOpen({
      viewportHeight: vv.height,
      layoutHeight,
      scale: vv.scale,
      editing: editing(),
    });
    if (!open) { clear(); return; }
    // Se a conversa estava no fim, continua no fim depois de encolher.
    const box = document.getElementById('messages');
    const nearBottom = box && box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    root.style.setProperty('--app-top', `${Math.max(0, Math.round(vv.offsetTop || 0))}px`);
    if (nearBottom && box) {
      requestAnimationFrame(() => { if (box.isConnected) box.scrollTop = box.scrollHeight; });
    }
  };

  vv.addEventListener('resize', apply);
  // No iOS o `offsetTop` muda sem `resize` quando a viewport visual é deslocada.
  vv.addEventListener('scroll', apply);
  // O resize do teclado pode chegar depois do foco/blur.
  document.addEventListener('focusin', () => setTimeout(apply, 80));
  document.addEventListener('focusout', () => setTimeout(apply, 80));
  window.addEventListener('orientationchange', () => setTimeout(apply, 300));
  apply();
}
