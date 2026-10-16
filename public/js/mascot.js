// Mascote (avatar da IA) — configuração e desenho.
//
// A animação é CSS (styles/19-ai-avatar.css); aqui mora só o DADO: quais
// cores/olhos/acessórios/boca existem e como o estado vira markup. Cada
// acessório é um path SVG único usado tanto no <svg> do CSS quanto… só no
// CSS, porque no app o avatar é só CSS (sem Canvas).
//
// Preferência de APARÊNCIA do mascote: fica em `ui.mascot`, que é o escopo
// do DISPOSITIVO (fora de SCOPE_KEYS em store.js) — mesma decisão de
// `tasksOwn`: não deve atravessar contas nem pedir schema no servidor.

import { Store } from './store.js';

// helpers de path (mesmos do protótipo) -------------------------------------
export const P_ell = (cx, cy, rx, ry) => `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0z`;
export const P_cir = (cx, cy, r) => P_ell(cx, cy, r, r);
export const P_rr = (x, y, w, h, r) => `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0,1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0,1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0,1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0,1 ${r},${-r}z`;

// OLHOS — viewBox 0 0 100 100, um por olho.
// f: preenchimento · s: traço · lw: espessura
export const MASCOT_EYES = {
  round: { paths: [{ d: P_ell(50, 50, 36, 44), f: 'eye' }], glint: [{ d: P_cir(38, 34, 12), f: 'w' }] },
  oval: { paths: [{ d: P_ell(50, 50, 28, 44), f: 'eye' }], glint: [{ d: P_cir(41, 34, 10), f: 'w' }] },
  slit: { paths: [{ d: P_ell(50, 50, 36, 43), f: 'eye' }, { d: P_ell(50, 50, 11, 38), f: 'body' }] },
  sleepy: { paths: [{ d: 'M20,58 C34,42 66,42 80,58', s: 'eye', lw: 10 }] },
  heart: { paths: [{ d: 'M50,88 C6,58 14,22 34,22 C44,22 50,30 50,36 C50,30 56,22 66,22 C86,22 94,58 50,88 Z', f: 'eye' }] },
  star: { paths: [{ d: 'M50,6 L61,38 L95,38 L67,58 L79,92 L50,70 L21,92 L33,58 L5,38 L39,38 Z', f: 'eye' }] },
  visor: { paths: [{ d: P_rr(6, 32, 88, 36, 18), f: 'eye' }], glint: [{ d: P_cir(30, 50, 9), f: 'body' }, { d: P_cir(70, 50, 9), f: 'body' }] },
};

// BOCAS — mesma convenção dos olhos (o traço é a boca fechada).
export const MASCOT_MOUTHS = {
  'm-smile': { paths: [{ d: 'M22,44 C34,64 66,64 78,44', s: 'eye', lw: 9 }] },
  'm-o': { paths: [{ d: P_ell(50, 50, 16, 20), f: 'eye' }], glint: [{ d: P_ell(50, 42, 7, 6), f: 'body' }] },
  'm-flat': { paths: [{ d: P_rr(28, 44, 44, 9, 4.5), f: 'eye' }] },
  'm-grin': { paths: [{ d: 'M16,34 C16,68 84,68 84,34 Z', f: 'eye' }], glint: [{ d: P_ell(50, 56, 18, 10), f: 'body' }] },
};

// ACESSÓRIOS — viewBox 0 0 100 100.
// w: largura como % da caixa do avatar · y: centro como % · x: centro como %
// f: 'acc' (cor do acessório) | 'body' (cor do blob) | 'gold'
export const MASCOT_ACC = {
  none: { w: 0, y: 0, x: 50, paths: [] },

  earCat: { front: false, w: 84, y: 17, x: 50, paths: [
    { d: 'M2,96 C1,70 5,40 13,22 Q17,9 27,19 C35,36 41,62 43,86 Q45,97 31,98 Q11,99 2,96 Z', f: 'acc' },
    { d: 'M98,96 C99,70 95,40 87,22 Q83,9 73,19 C65,36 59,62 57,86 Q55,97 69,98 Q89,99 98,96 Z', f: 'acc' },
    { d: 'M19,88 C18,70 20,50 24,38 Q26,32 30,38 C35,50 38,70 39,86 Q40,92 33,93 Q24,94 19,88 Z', f: 'body' },
    { d: 'M81,88 C82,70 80,50 76,38 Q74,32 70,38 C65,50 62,70 61,86 Q60,92 67,93 Q76,94 81,88 Z', f: 'body' }] },

  earDog: { front: false, w: 86, y: -3, x: 50, paths: [
    { d: 'M42,100 C24,98 8,82 4,60 C1,46 10,36 22,40 C34,48 40,72 42,100 Z', f: 'acc' },
    { d: 'M58,100 C76,98 92,82 96,60 C99,46 90,36 78,40 C66,48 60,72 58,100 Z', f: 'acc' },
    { d: 'M35,92 C23,88 13,76 10,64 C8,56 13,51 19,54 C27,59 32,76 35,92 Z', f: 'body' },
    { d: 'M65,92 C77,88 87,76 90,64 C92,56 87,51 81,54 C73,59 68,76 65,92 Z', f: 'body' }] },

  earBunny: { front: false, w: 64, y: -6, x: 50, paths: [
    { d: 'M20,100 C10,76 8,32 18,12 C23,1 33,7 35,18 C41,42 33,78 28,100 Z', f: 'acc' },
    { d: 'M80,100 C90,76 92,32 82,12 C77,1 67,7 65,18 C59,42 67,78 72,100 Z', f: 'acc' },
    { d: 'M23,95 C17,73 16,35 22,19 C25,12 30,16 31,25 C35,45 29,75 26,95 Z', f: 'body' },
    { d: 'M77,95 C83,73 84,35 78,19 C75,12 70,16 69,25 C65,45 71,75 74,95 Z', f: 'body' }] },

  crown: { w: 42, y: 17, x: 50, paths: [
    { d: 'M4,92 L12,16 L38,46 L50,6 L62,46 L88,16 L96,92 Z', f: 'acc' },
    { d: P_cir(12, 12, 7), f: 'gold' }, { d: P_cir(50, 3, 7), f: 'gold' }, { d: P_cir(88, 12, 7), f: 'gold' }] },

  halo: { front: false, w: 30, y: 9, x: 50, paths: [{ d: P_ell(50, 50, 46, 20), s: 'gold', lw: 13 }] },

  antenna: { front: false, w: 17, y: 11, x: 50, paths: [
    { d: 'M50,100 V34', s: 'acc', lw: 10 }, { d: P_cir(50, 24, 20), f: 'acc' },
    { d: P_cir(43, 17, 6), f: 'gold' }] },

  cap: { w: 52, y: 19, x: 50, paths: [
    { d: 'M8,66 a42,42 0 0,1 84,0 z', f: 'acc' },
    { d: 'M62,62 Q84,64 98,74 Q78,84 60,74 Z', f: 'acc' },
    { d: P_cir(50, 24, 6), f: 'gold' }] },

  headphones: { w: 116, y: 24, x: 50, paths: [
    { d: 'M6,52 a44,44 0 0,1 88,0', s: 'acc', lw: 12 },
    { d: P_rr(0, 48, 20, 40, 9), f: 'acc' }, { d: P_rr(80, 48, 20, 40, 9), f: 'acc' }] },

  flower: { w: 36, y: 14, x: 74, paths: [
    { d: P_ell(50, 20, 15, 22), f: 'acc' }, { d: P_ell(50, 80, 15, 22), f: 'acc' },
    { d: P_ell(20, 50, 22, 15), f: 'acc' }, { d: P_ell(80, 50, 22, 15), f: 'acc' },
    { d: P_cir(50, 50, 14), f: 'gold' }] },

  tie: { w: 28, y: 82, x: 50, paths: [
    { d: 'M50,8 L86,34 L50,62 L14,34 Z', f: 'acc' }, { d: 'M36,58 h28 l8,34 h-44 Z', f: 'acc' }] },

  collar: { w: 100, y: 80, x: 50, paths: [
    { d: 'M2,34 C2,20 98,20 98,34 L98,50 C98,62 2,62 2,50 Z', f: 'acc' },
    { d: P_cir(50, 60, 13), f: 'gold' }, { d: 'M41,60 h18', s: 'acc', lw: 5 }] },
};

// SILHUETAS: só escolhem a @keyframes do border-radius (ver 19-ai-avatar.css)
export const MASCOT_SHAPES = ['blobEllipse', 'blobFlat', 'blobTall', 'blobDrop', 'blobGrain', 'blobBean'];

export const MASCOT_DEFAULTS = {
  name: 'Bento',
  // distingue "nome escolhido pelo usuário" de "ainda está no padrão".
  // O modal de primeiro login só aparece quando nameSet é false.
  nameSet: false,
  // vazio = herda a cor do tema
  bodyA: '', bodyB: '', eyeColor: '', accColor: '',
  shape: 'blobEllipse',
  eyes: 'round',
  mouth: 'm-smile',
  acc: 'earCat',
  blush: '1',
};

// ---- estado -----------------------------------------------------------------

// Sanitiza o que vier do Store: storage é dado de usuário, pode estar
// velho (chave removida) ou adulterado. Chave desconhecida cai no default.
export function mascotSanitize(raw) {
  const d = MASCOT_DEFAULTS;
  const r = (raw && typeof raw === 'object') ? raw : {};
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '');
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 18) : d.name,
    // um nome salvo que não veio do padrão conta como escolhido
    nameSet: r.nameSet === true,
    bodyA: hex(r.bodyA),
    bodyB: hex(r.bodyB),
    eyeColor: hex(r.eyeColor),
    accColor: hex(r.accColor),
    shape: MASCOT_SHAPES.indexOf(r.shape) >= 0 ? r.shape : d.shape,
    eyes: MASCOT_EYES[r.eyes] ? r.eyes : d.eyes,
    mouth: MASCOT_MOUTHS[r.mouth] ? r.mouth : d.mouth,
    acc: MASCOT_ACC[r.acc] ? r.acc : d.acc,
    blush: r.blush === '0' ? '0' : '1',
  };
}

export function mascotFromStore() {
  return mascotSanitize(Store.data && Store.data.ui && Store.data.ui.mascot);
}

export function mascotToStore(patch) {
  Store.data.ui = Store.data.ui || {};
  const merged = { ...mascotFromStore(), ...patch };
  // escrever um nome = o usuário escolheu um nome (o modal deixa de aparecer)
  if (typeof patch.name === 'string' && patch.name.trim()) merged.nameSet = true;
  Store.data.ui.mascot = mascotSanitize(merged);
  Store.save();
  return Store.data.ui.mascot;
}

// ---- sorteio ----------------------------------------------------------------

// Paletas curadas, não hex aleatório: dois `#rrggbb` sorteados ao acaso dão
// corpo quase branco com sombra quase preta, ou olhos da mesma cor do corpo
// (some). Cada par já nasce com contraste e a sombra mais escura que o corpo.
const MASCOT_PALETTES = [
  { bodyA: '#E8865A', bodyB: '#9E4E28' }, // pêssego
  { bodyA: '#7FB2E5', bodyB: '#3A5F8F' }, // azul
  { bodyA: '#8FD3A2', bodyB: '#3D7A55' }, // verde
  { bodyA: '#E5A9C8', bodyB: '#8C4A73' }, // rosa
  { bodyA: '#D9A441', bodyB: '#8A6414' }, // âmbar
  { bodyA: '#B49BE8', bodyB: '#5B418F' }, // violeta
  { bodyA: '#E5DCC8', bodyB: '#8C8270' }, // creme
  { bodyA: '#6FD0C8', bodyB: '#2A7A72' }, // água
];

// tons escuros para olhos e acessórios: funcionam sobre qualquer corpo da lista
const MASCOT_DETAILS = ['#3A2419', '#26303A', '#3C2A4A', '#1F3D2B', '#4A2A2A'];

// Gera uma aparência nova. NÃO mexe no nome: é a identidade que o usuário
// escolheu, não uma característica sorteável.
export function mascotRandomize() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pal = pick(MASCOT_PALETTES);
  return {
    shape: pick(MASCOT_SHAPES),
    eyes: pick(Object.keys(MASCOT_EYES)),
    mouth: pick(Object.keys(MASCOT_MOUTHS)),
    acc: pick(Object.keys(MASCOT_ACC)),
    blush: Math.random() < 0.5 ? '1' : '0',
    bodyA: pal.bodyA,
    bodyB: pal.bodyB,
    eyeColor: pick(MASCOT_DETAILS),
    accColor: pick(MASCOT_DETAILS),
  };
}

// true = ainda está no nome padrão, nunca foi escolhido pelo usuário
export function mascotNameUnset() {
  return !mascotFromStore().nameSet;
}

// ---- desenho ----------------------------------------------------------------

const EYE_CSS = { eye: 'var(--ai-av-eye)', body: 'var(--ai-av-c1)', w: '#fff' };

const pathsSvg = (list, colorMap) => list.map((p) => {
  if (p.f) return `<path d="${p.d}" fill="${colorMap[p.f] || p.f}"/>`;
  return `<path d="${p.d}" fill="none" stroke="${colorMap[p.s] || p.s}" stroke-width="${p.lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}).join('');

const eyeSvg = (key) => {
  const e = MASCOT_EYES[key]; if (!e) return '';
  let s = pathsSvg(e.paths, EYE_CSS);
  if (e.glint) s += pathsSvg(e.glint, EYE_CSS);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
};

const mouthSvg = (key) => {
  const m = MASCOT_MOUTHS[key]; if (!m) return '';
  let s = pathsSvg(m.paths, EYE_CSS);
  if (m.glint) s += pathsSvg(m.glint, EYE_CSS);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
};

// w/y/x em % da caixa do avatar; o desenho usa o viewBox 0 0 100 100.
// Tudo em PORCENTAGEM, nunca em px: o tamanho final da caixa é decidido pelo
// CSS (--ai-av: 44px no tile, 64px no painel, 118px na página da IA), então um
// boxPx chutado pelo JS posicionava o acessório numa caixa diferente da
// renderizada — ele vazava para fora e era cortado. Como .ai-av é quadrada,
// % em top e height resolve igual a % em left/width.
const accSvg = (key) => {
  const a = MASCOT_ACC[key];
  if (!a || !a.paths.length) return '';
  const left = a.x - a.w / 2;
  const top = a.y - a.w / 2;
  const col = { acc: 'var(--ai-av-acc)', body: 'var(--ai-av-c1)', gold: '#f5b942' };
  // orelhas/auréola/antena ficam ATRÁS do corpo (z 0); coroa/boné/fone na frente
  const layer = a.front === false ? '' : ' ai-av__acc--front';
  return `<span class="ai-av__acc${layer}" style="left:${left}%;top:${top}%;width:${a.w}%;height:${a.w}%">`
    + `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${pathsSvg(a.paths, col)}</svg></span>`;
};

// Ícone de uma opção, para os chips do painel mostrarem o desenho em vez do
// nome. É muito mais compacto (12 acessórios cabem em 2 linhas) e o usuário
// reconhece a peça pelo desenho. Mesmas custom properties do avatar, então
// respeita as cores escolhidas sem código extra.
export function mascotIconSvg(kind, key) {
  // par de olhos: o mascote tem dois, então o ícone mostra dois
  if (kind === 'eyes') return eyeSvg(key) + eyeSvg(key);
  if (kind === 'mouth') return mouthSvg(key);
  if (kind === 'acc') {
    const a = MASCOT_ACC[key];
    if (!a || !a.paths.length) return '';
    const col = { acc: 'var(--ai-av-acc)', body: 'var(--ai-av-c1)', gold: '#f5b942' };
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${pathsSvg(a.paths, col)}</svg>`;
  }
  return '';
}

// `state` ∈ idle | thinking | speaking. A caixa é quadrada e o tamanho final
// vem do CSS — nenhum tamanho em px é passado daqui.
export function mascotAvatarHtml(state = 'idle', cfg = mascotFromStore()) {
  const c = mascotSanitize(cfg);
  const style = [
    c.bodyA ? `--mascot-c1:${c.bodyA}` : '',
    c.bodyB ? `--mascot-c2:${c.bodyB}` : '',
    c.eyeColor ? `--mascot-eye:${c.eyeColor}` : '',
    c.accColor ? `--mascot-acc:${c.accColor}` : '',
  ].filter(Boolean).join(';');
  return `<span class="ai-av" data-state="${state}" data-shape="${c.shape}" data-eyes="${c.eyes}" data-blush="${c.blush}"${style ? ` style="${style}"` : ''} aria-hidden="true">`
    + '<span class="ai-av__shadow"></span>'
    + '<span class="ai-av__sq">'
    + '<span class="ai-av__shell"></span>'
    + `<span class="ai-av__core"><span class="ai-av__face">`
    + `<span class="ai-av__eyes"><i>${eyeSvg(c.eyes)}</i><i>${eyeSvg(c.eyes)}</i></span>`
    + `<span class="ai-av__mouth">${mouthSvg(c.mouth)}</span>`
    + '<span class="ai-av__blush ai-av__blush--l"></span><span class="ai-av__blush ai-av__blush--r"></span>'
    + '</span></span>'
    + accSvg(c.acc)
    + '</span></span>';
}

// Reaplica a config em todos os avatares já na tela (tile da sidebar, estado
// vazio da IA, indicador "pensando"). Os controles escrevem em `data-*` e em
// custom properties, então basta um scan.
const setVar = (el, name, val) => {
  if (val) el.style.setProperty(name, val); else el.style.removeProperty(name);
};

export function mascotApplyAll() {
  const cfg = mascotFromStore();
  document.querySelectorAll('.ai-av').forEach((el) => {
    el.dataset.shape = cfg.shape;
    el.dataset.eyes = cfg.eyes;
    el.dataset.blush = cfg.blush;
    setVar(el, '--mascot-c1', cfg.bodyA);
    setVar(el, '--mascot-c2', cfg.bodyB);
    setVar(el, '--mascot-eye', cfg.eyeColor);
    setVar(el, '--mascot-acc', cfg.accColor);
    el.querySelectorAll('.ai-av__eyes i').forEach((i) => { i.innerHTML = eyeSvg(cfg.eyes); });
    const mouth = el.querySelector('.ai-av__mouth');
    if (mouth) mouth.innerHTML = mouthSvg(cfg.mouth);
    // acessório: precisa entrar DENTRO de __sq (o wrapper achatado), senão a
    // orelha fica com altura cheia enquanto o corpo está achatado em 60%.
    // Como a posição é em %, não há nada a medir — reemite o mesmo markup.
    const sq = el.querySelector('.ai-av__sq');
    const old = el.querySelector('.ai-av__acc');
    if (old) old.remove();
    const a = MASCOT_ACC[cfg.acc];
    if (a && a.paths.length && sq) {
      const holder = document.createElement('div');
      holder.innerHTML = accSvg(cfg.acc);
      const node = holder.firstElementChild;
      if (node) sq.appendChild(node);
    }
    const name = el.parentElement && el.parentElement.querySelector('.ai-mascot-name');
    if (name) name.textContent = cfg.name;
  });
  const nameField = document.getElementById('mascot-name');
  if (nameField && document.activeElement !== nameField) nameField.value = cfg.name;
}