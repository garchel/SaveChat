// Confete cozy — explosão suave de estrelinhas e pétalas a partir de um âncora.
// Respeita prefers-reduced-motion (não anima nada nesse caso).
const CHARS = ['✦', '✧', '⋆'];
// paleta: accent/gold/teal do tema + rosa/lilás fixos
const COLORS = ['--accent', '--gold', '--accent-teal', '#c79ade', '#f09bb4'];

export function burstConfetti(anchor, opts = {}) {
  if (!anchor) return;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + Math.min(rect.height / 2, 60);
    const style = getComputedStyle(document.documentElement);
    const palette = COLORS.map((c) => (c.startsWith('--') ? (style.getPropertyValue(c).trim() || '#f09bb4') : c));
    const n = opts.count || 16;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-bit';
      const isChar = Math.random() < 0.55;
      if (isChar) {
        p.textContent = CHARS[(Math.random() * CHARS.length) | 0];
        p.style.fontSize = 12 + Math.random() * 8 + 'px';
      } else {
        p.classList.add('cf-petal'); // pétala/bolinha
        p.style.width = p.style.height = 6 + Math.random() * 5 + 'px';
      }
      const color = palette[(Math.random() * palette.length) | 0];
      p.style.color = color;
      if (!isChar) p.style.background = color;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const dist = 50 + Math.random() * 90;
      p.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist + 30).toFixed(0) + 'px');
      p.style.setProperty('--rot', ((Math.random() - 0.5) * 260).toFixed(0) + 'deg');
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.animationDelay = (Math.random() * 120) + 'ms';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  } catch { /* noop */ }
}
