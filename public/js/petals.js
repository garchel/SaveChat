// Pétalas flutuantes cozy — poucos glifos (pétalas, estrelinhas e corações) sobem
// lentamente pelo fundo do app. Sutil por design: poucas partículas, opacidade
// baixa, zero pointer-events, paleta derivada do tema atual.
// Toggle: Store.data.ui.petals (padrão OFF) — configurações → "Pétalas flutuantes".

const CHARS = ['🌸', '✦', '✧', '⋆', '♡', '❀', '✿'];
const COLORS = ['--accent', '--gold', '--accent-teal', '#c79ade', '#f09bb4'];

let container = null;
let running = false;
let timer = 0;

function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'petals-layer';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  return container;
}

// uma partícula: glifo que sobe do rodapé a 110vh com deriva horizontal e giro leve
function spawn() {
  const c = ensureContainer();
  const p = document.createElement('span');
  p.className = 'petal-bit';
  p.textContent = CHARS[(Math.random() * CHARS.length) | 0];
  const style = getComputedStyle(document.documentElement);
  const palette = COLORS.map((v) => (v.startsWith('--') ? (style.getPropertyValue(v).trim() || '#f09bb4') : v));
  const color = palette[(Math.random() * palette.length) | 0];
  p.style.color = color;
  p.style.fontSize = (10 + Math.random() * 10) + 'px';
  p.style.left = (Math.random() * 96) + 'vw';
  p.style.setProperty('--drift', (Math.random() * 48 - 24) + 'px');
  const dur = 14 + Math.random() * 10; // 14–24s de subida
  p.style.setProperty('--dur', dur + 's');
  p.style.setProperty('--spin', ((20 + Math.random() * 30) * (Math.random() < 0.5 ? -1 : 1)) + 'deg');
  p.addEventListener('animationend', remove);
  c.appendChild(p);
  // cleanup de segurança (aba em 2º plano atrasa animationend)
  setTimeout(() => { if (p.parentNode) p.remove(); }, (dur + 4) * 1000);
}

function remove(e) {
  if (e && e.target && e.target.parentNode) e.target.remove();
}

function tick() {
  spawn();
  timer = setTimeout(tick, 4200 + Math.random() * 3200);
}

export function startPetals() {
  if (running || reducedMotion()) return;
  running = true;
  for (let i = 0; i < 3; i++) spawn(); // preenche em estágios diferentes da subida
  timer = setTimeout(tick, 3000);
}

export function stopPetals() {
  running = false;
  if (timer) { clearTimeout(timer); timer = 0; }
  if (container) { container.remove(); container = null; }
}

export function setPetals(on) {
  if (on) startPetals(); else stopPetals();
}

export function petalsActive() {
  return running;
}
