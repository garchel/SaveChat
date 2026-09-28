// Gerador de padrões de fundo — glifo escala DENTRO do tile fixo (320px).
// O slider muda só o tamanho do ícone; o espaçamento permanece constante.
export const PATTERN_TILE = 320;

// Cores base dos glifos — serão sobrescritas por CSS vars do tema em buildPattern
const GLYPH_BASE_COLORS = {
  stars: '#c9a86a',
  hearts: '#d98a8a',
  clouds: '#a9bfcf',
  leaves: '#8fb89a',
  circles: '#d9cdb8',
  dots: '#d9cdb8',
  sakura: '#e59ab2',
  butterflies: '#b48ed6',
  strawberries: '#e57373',
  rainbows: '#f0a04b',
};

// Desenho de cada glifo — strap true = contorno, fill true = preenchido
const GLYPHS = {
  stars: [
    { star: true, cx: 46, cy: 52, r: 12, sw: 2.4, stroke: true, fill: false },
    { star: true, cx: 216, cy: 204, r: 7.5, fill: true },
  ],
  hearts: [
    { heart: true, cx: 67, cy: 62, r: 15, sw: 2.4, stroke: true, fill: false, rot: -10 },
    { heart: true, cx: 236, cy: 222, r: 9, fill: true, rot: 12 },
  ],
  clouds: [
    { cloud: true, x: 34, y: 36, s: 1.0, sw: 2.4, stroke: true, fill: false },
    { cloud: true, x: 208, y: 188, s: 0.65, fill: true, opacity: .45 },
  ],
  leaves: [
    { leaf: true, cx: 54, cy: 52, r: 17, sw: 2.2, stroke: true, fill: false, rot: 28 },
    { leaf: true, cx: 229, cy: 210, r: 11, fill: true, rot: -30 },
  ],
  circles: [
    { circle: true, cx: 50, cy: 44, r: 12.5, sw: 2.4, stroke: true, fill: false },
    { circle: true, cx: 200, cy: 176, r: 6.5, sw: 2.2, stroke: true, fill: false },
    { circle: true, cx: 263, cy: 63, r: 4.5, fill: true },
  ],
  dots: [
    { dot: true, cx: 60, cy: 55, r: 5, fill: true },
    { dot: true, cx: 220, cy: 215, r: 3.5, fill: true },
    { dot: true, cx: 270, cy: 70, r: 2.8, fill: true },
    { dot: true, cx: 105, cy: 260, r: 4, fill: true },
  ],
  // ---- glifos cozy (rodada feminina/pop) ----
  sakura: [
    { sakura: true, cx: 60, cy: 58, r: 13, sw: 2.2, stroke: true, fill: false, rot: 12 },
    { sakura: true, cx: 226, cy: 214, r: 8.5, fill: true, rot: -24 },
    { petal: true, cx: 258, cy: 74, r: 6.5, fill: true, rot: 40 },
  ],
  butterflies: [
    { butterfly: true, cx: 58, cy: 60, r: 14, sw: 2.2, stroke: true, fill: false, rot: -8 },
    { butterfly: true, cx: 224, cy: 210, r: 9, fill: true, rot: 22 },
  ],
  strawberries: [
    { strawberry: true, cx: 58, cy: 58, r: 13, sw: 2.2, stroke: true, fill: false, rot: -10 },
    { strawberry: true, cx: 228, cy: 212, r: 8.5, fill: true, rot: 18 },
  ],
  rainbows: [
    { rainbow: true, cx: 52, cy: 56, r: 14, sw: 2.2, stroke: true, fill: false },
    { rainbow: true, cx: 226, cy: 214, r: 9, sw: 2, stroke: true, fill: false },
    { star: true, cx: 262, cy: 66, r: 5, fill: true },
  ],
};

function starPath(cx, cy, r) {
  let pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)} ${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

// desloca o matiz de uma cor hex (graos) — usado no arco-íris multicolor
function shiftHue(hex, deg) {
  try {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    let r = parseInt(h.slice(0, 2), 16) / 255, g2 = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g2, b), min = Math.min(r, g2, b);
    let hue = 0;
    const l = (max + min) / 2;
    const d = max - min;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === r) hue = ((g2 - b) / d) % 6;
      else if (max === g2) hue = (b - r) / d + 2;
      else hue = (r - g2) / d + 4;
      hue *= 60;
    }
    hue = (hue + deg + 360) % 360;
    // HSL → hex
    const c = (1 - Math.abs(2 * l - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (hue < 60) [rr, gg, bb] = [c, x, 0];
    else if (hue < 120) [rr, gg, bb] = [x, c, 0];
    else if (hue < 180) [rr, gg, bb] = [0, c, x];
    else if (hue < 240) [rr, gg, bb] = [0, x, c];
    else if (hue < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + to(rr) + to(gg) + to(bb);
  } catch { return hex; }
}

// Seeded random para jitter determinístico (evita padrão em grade)
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  h = (h ^ 0x9e3779b9) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

function glyphInner(g, scale, jitterX, jitterY, color) {
  let inner = '';
  const jx = jitterX, jy = jitterY;
  const strokeColor = g.stroke ? color : null;
  const fillColor = g.fill ? color : 'none';
  if (g.star) {
    const cx = g.cx + jx, cy = g.cy + jy;
    inner = `<path d="${starPath(cx, cy, g.r * scale)}" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/>`;
  } else if (g.heart) {
    const cx = g.cx + jx, cy = g.cy + jy;
    const r = g.r * scale;
    const d = `M${cx} ${cy + r * 0.95} C${cx - r * 1.3} ${cy}, ${cx - r} ${cy - r * 0.75}, ${cx - r * 0.35} ${cy - r * 0.78} C${cx - r * 0.08} ${cy - r * 0.8}, ${cx} ${cy - r * 0.55}, ${cx} ${cy - r * 0.35} C${cx} ${cy - r * 0.55}, ${cx + r * 0.08} ${cy - r * 0.8}, ${cx + r * 0.35} ${cy - r * 0.78} C${cx + r} ${cy - r * 0.75}, ${cx + r * 1.3} ${cy}, ${cx} ${cy + r * 0.95} Z`;
    inner = `<path d="${d}" transform="rotate(${g.rot || 0} ${cx} ${cy})" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/>`;
  } else if (g.cloud) {
    const cx = g.x + jx, cy = g.y + jy;
    inner = `<g transform="translate(${cx} ${cy}) scale(${scale})"><path d="M8 26 a7.2 7.2 0 0 1 2.7-13.8 A10.8 10.8 0 0 1 32.5 18 a6.3 6.3 0 0 1 .9 11.1 z" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${g.sw}"` : ''}${g.opacity ? ` opacity="${g.opacity}"` : ''} stroke-linecap="round"/></g>`;
  } else if (g.leaf) {
    const r = g.r * scale;
    const cx = g.cx + jx, cy = g.cy + jy;
    const d = `M${cx} ${cy - r} C${cx + r * 1.0} ${cy - r * 0.55}, ${cx + r * 1.05} ${cy + r * 0.45}, ${cx} ${cy + r} C${cx - r * 1.05} ${cy + r * 0.45}, ${cx - r} ${cy - r * 0.55}, ${cx} ${cy - r} Z`;
    inner = `<g transform="rotate(${g.rot || 0} ${cx} ${cy})">` +
      `<path d="${d}" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/>` +
      (g.fill ? '' : `<line x1="${cx}" y1="${cy - r * 0.72}" x2="${cx}" y2="${cy + r * 0.82}" stroke="${strokeColor}" stroke-width="${(g.sw || 2) * 0.8 * scale}" stroke-linecap="round"/><line x1="${cx}" y1="${cy + r * 1.02}" x2="${cx}" y2="${cy + r * 1.42}" stroke="${strokeColor}" stroke-width="${(g.sw || 2) * 0.8 * scale}" stroke-linecap="round"/>`) +
      `</g>`;
  } else if (g.circle) {
    const cx = g.cx + jx, cy = g.cy + jy;
    inner = `<circle cx="${cx}" cy="${cy}" r="${g.r * scale}" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''}/>`;
  } else if (g.dot) {
    const cx = g.cx + jx, cy = g.cy + jy;
    inner = `<circle cx="${cx}" cy="${cy}" r="${g.r * scale}" fill="${color}"/>`;
  } else if (g.sakura) {
    // flor de cerejeira: 5 pétalas com RECORTE em V na ponta (traço real da cerejeira)
    // + estames pontilhados ao redor do centro
    const cx = g.cx + jx, cy = g.cy + jy, r = g.r * scale;
    let petals = '';
    for (let i = 0; i < 5; i++) {
      const ang = -90 + i * 72 + (g.rot || 0);
      petals += `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${ang.toFixed(1)})">` +
        `<path d="M0 ${-r * 0.18} C${-r * 0.52} ${-r * 0.34}, ${-r * 0.6} ${-r * 0.68}, ${-r * 0.27} ${-r * 0.96} L0 ${-r * 0.76} L${r * 0.27} ${-r * 0.96} C${r * 0.6} ${-r * 0.68}, ${r * 0.52} ${-r * 0.34}, 0 ${-r * 0.18} Z" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/></g>`;
    }
    let stamen = '';
    for (let i = 0; i < 5; i++) {
      const a = (-90 + i * 72 + 36) * Math.PI / 180;
      stamen += `<circle cx="${(cx + Math.cos(a) * r * 0.2).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.2).toFixed(1)}" r="${(r * 0.055 * scale).toFixed(2)}" fill="${strokeColor || color}"/>`;
    }
    inner = petals + stamen;
  } else if (g.petal) {
    // pétala solta com o mesmo recorte em V (companheira da sakura)
    const cx = g.cx + jx, cy = g.cy + jy, r = g.r * scale;
    const d = `M0 ${-r * 0.2} C${-r * 0.7} ${-r * 0.42}, ${-r * 0.78} ${-r * 0.78}, ${-r * 0.3} ${-r * 0.98} L0 ${-r * 0.76} L${r * 0.3} ${-r * 0.98} C${r * 0.78} ${-r * 0.78}, ${r * 0.7} ${-r * 0.42}, 0 ${-r * 0.2} Z`;
    inner = `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${g.rot || 0})"><path d="${d}" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/></g>`;
  } else if (g.butterfly) {
    // borboleta: 2 PARES de asas (superior grande, inferior pequena) + corpo com
    // cabecinha + antenas com bolinhas na ponta
    const cx = g.cx + jx, cy = g.cy + jy, r = g.r * scale;
    const sw2 = (g.sw || 2) * scale;
    const wing = (sx) =>
      // asa superior: grande e arredondada, dominando a silhueta
      `<path d="M0 ${-r * 0.12} C${sx * r * 0.4} ${-r * 1.15}, ${sx * r * 1.45} ${-r * 1.0}, ${sx * r * 1.3} ${-r * 0.28} C${sx * r * 1.2} ${r * 0.1}, ${sx * r * 0.5} ${r * 0.15}, 0 ${-r * 0.02} Z" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${sw2}"` : ''} stroke-linejoin="round"/>` +
      // asa inferior: bem visível, arredondada para baixo
      `<path d="M0 ${r * 0.08} C${sx * r * 0.35} ${r * 0.14}, ${sx * r * 0.9} ${r * 0.28}, ${sx * r * 0.75} ${r * 0.82} C${sx * r * 0.6} ${r * 1.18}, ${sx * r * 0.15} ${r * 1.05}, 0 ${r * 0.55} Z" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${sw2 * 0.9}"` : ''} stroke-linejoin="round"/>`;
    inner = `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${g.rot || 0})">` +
      wing(-1) + wing(1) +
      `<line x1="0" y1="${-r * 0.28}" x2="0" y2="${r * 0.55}" stroke="${strokeColor || color}" stroke-width="${sw2 * 0.8}" stroke-linecap="round"/>` +
      `<circle cx="0" cy="${-r * 0.32}" r="${(r * 0.13).toFixed(2)}" fill="${strokeColor || color}"/>` +
      `<path d="M0 ${-r * 0.42} C${-r * 0.22} ${-r * 0.75}, ${-r * 0.42} ${-r * 0.7}, ${-r * 0.5} ${-r * 0.92} M0 ${-r * 0.42} C${r * 0.22} ${-r * 0.75}, ${r * 0.42} ${-r * 0.7}, ${r * 0.5} ${-r * 0.92}" fill="none" stroke="${strokeColor || color}" stroke-width="${sw2 * 0.55}" stroke-linecap="round"/>` +
      `<circle cx="${-r * 0.5}" cy="${-r * 0.92}" r="${(r * 0.06).toFixed(2)}" fill="${strokeColor || color}"/><circle cx="${r * 0.5}" cy="${-r * 0.92}" r="${(r * 0.06).toFixed(2)}" fill="${strokeColor || color}"/>` +
      `</g>`;
  } else if (g.strawberry) {
    // morango: corpo gordinho + COROA de folhas + sementinhas
    const cx = g.cx + jx, cy = g.cy + jy, r = g.r * scale;
    const sw2 = (g.sw || 2) * scale;
    const body = `M${cx} ${cy + r} C${cx - r * 1.3} ${cy + r * 0.18}, ${cx - r * 0.98} ${cy - r * 0.62}, ${cx} ${cy - r * 0.6} C${cx + r * 0.98} ${cy - r * 0.62}, ${cx + r * 1.3} ${cy + r * 0.18}, ${cx} ${cy + r} Z`;
    const crown = `M${cx - r * 0.6} ${cy - r * 0.5} L${cx - r * 0.38} ${cy - r * 1.12} L${cx - r * 0.14} ${cy - r * 0.66} L${cx} ${cy - r * 1.22} L${cx + r * 0.14} ${cy - r * 0.66} L${cx + r * 0.38} ${cy - r * 1.12} L${cx + r * 0.6} ${cy - r * 0.5}`;
    const seedPts = [[-0.34, 0.05], [0.34, 0.05], [-0.18, 0.38], [0.18, 0.38], [0, 0.62], [-0.05, 0.2], [0.05, 0.2]];
    const seeds = seedPts.map(([sx2, sy2]) => `<ellipse cx="${(cx + sx2 * r).toFixed(1)}" cy="${(cy + sy2 * r).toFixed(1)}" rx="${(r * 0.06).toFixed(2)}" ry="${(r * 0.095).toFixed(2)}" fill="${strokeColor || color}" opacity=".6"/>`).join('');
    inner = `<g transform="rotate(${g.rot || 0} ${cx} ${cy})">` +
      `<path d="${body}" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${sw2}"` : ''} stroke-linejoin="round"/>` +
      `<path d="${crown}" fill="none" stroke="${strokeColor || color}" stroke-width="${sw2 * 0.8}" stroke-linejoin="round" stroke-linecap="round"/>` +
      seeds +
      `</g>`;
  } else if (g.rainbow) {
    // arco-íris: 3 faixas com matizes derivados da COR DO TEMA (-38°/0°/+38°)
    // + nuvens fofas nas duas pontas + estrelinha
    const cx = g.cx + jx, cy = g.cy + jy, r = g.r * scale;
    const sw2 = (g.sw || 2) * scale;
    const c1 = shiftHue(color, -38), c2 = color, c3 = shiftHue(color, 38);
    const arcs = [[1, c1], [0.72, c2], [0.46, c3]]
      .map(([k, cc]) => `<path d="M${(cx - r * k).toFixed(1)} ${cy.toFixed(1)} A${(r * k).toFixed(1)} ${(r * k).toFixed(1)} 0 0 1 ${(cx + r * k).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="${cc}" stroke-width="${sw2}" stroke-linecap="round"/>`)
      .join('');
    // nuvem fill sólido: path do g.cloud (~44×30 unid.), largura alvo ≈ r*1.3
    const s = (r * 1.3 / 44).toFixed(4);
    const cloud = (x) => `<g transform="translate(${x.toFixed(1)} ${cy.toFixed(1)}) scale(${s}) translate(-22 -19)"><path d="M8 26 a7.2 7.2 0 0 1 2.7-13.8 A10.8 10.8 0 0 1 32.5 18 a6.3 6.3 0 0 1 .9 11.1 z" fill="${c2}" opacity=".95"/></g>`;
    const star = `<path d="${starPath(cx, cy - r * 1.3, r * 0.22)}" fill="${c1}" opacity=".9"/>`;
    inner = `<g>${arcs}${cloud(cx - r * 0.98)}${cloud(cx + r * 0.98)}${star}</g>`;
  } else {
    const cx = (g.cx || 0) + jx, cy = (g.cy || 0) + jy;
    inner = `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-(g.cx || 0)} ${-(g.cy || 0)})"><path d="${g.d}" fill="${fillColor}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/></g>`;
  }
  return inner;
}

export function buildPattern(name, scale) {
  const glyphs = GLYPHS[name];
  if (!glyphs) return '';
  // cor do tema atual
  let color = GLYPH_BASE_COLORS[name] || '#c9a86a';
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--glyph-${name}`).trim();
    if (v) color = v;
  } catch {}
  const rng = seededRandom(name);
  const parts = glyphs.map((g) => {
    const jx = (rng() - 0.5) * 20;
    const jy = (rng() - 0.5) * 20;
    // g.stroke/g.fill são flags booleanas do desenho; a COR vem sempre do tema
    return glyphInner(g, scale, jx, jy, color);
  }).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${PATTERN_TILE}' height='${PATTERN_TILE}'>${parts}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}
