// Build leve: minifica CSS/JS de public/ → dist/ sem dependências externas.
// Uso: npm run build  (dev continua servindo public/ normalmente)
// Estratégia conservadora: remove comentários/whitespace redundantes.
// NÃO renomeia identificadores (segurança p/ ES Modules).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join, dirname, sep } from 'path';

const SRC = 'public';
const OUT = 'dist';

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')          // comentários
    .replace(/\s+/g, ' ')                       // whitespace múltiplo
    .replace(/\s*([{}:;,>~])\s*/g, '$1')        // espaços em torno de pontuação
    .replace(/;}/g, '}')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function minifyJs(js) {
  let out = '';
  let inStr = null, inTpl = false, inLine = false, inBlock = false, inRegex = false, prev = '';
  for (let i = 0; i < js.length; i++) {
    const c = js[i], next = js[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      out += c;
      if (c === '\\') { out += next; i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (!inRegex && (c === '"' || c === "'")) { inStr = c; out += c; prev = c; continue; }
    if (c === '`') { inTpl = !inTpl; out += c; prev = c; continue; }
    if (!inTpl && c === '/' && next === '/') { inLine = true; i++; continue; }
    if (!inTpl && c === '/' && next === '*') { inBlock = true; i++; continue; }
    out += c; prev = c;
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

// index.html em dev usa marcadores <!--#include file=partials/x.html--> (comentarios,
// que o browser ignora). Em producao o build troca cada marcador pelo conteudo do
// partial: o HTML volta a ser um arquivo unico, sem request extra e sem atraso de
// first paint. No lugar do marcador entra um comentario com o nome do arquivo, para
// o HTML gerado continuar legivel.
function resolvePartials(html, baseDir) {
  return html.replace(/<!--#include file=([^>]+?)-->/g, (_m, href) => {
    const f = join(baseDir, href);
    try {
      const body = readFileSync(f, 'utf8').replace(/^\s*<!--#include[^>]*-->\s*$/gm, '');
      const tag = '<!-- ' + href.split('/').pop() + ' -->';
      return tag + '\n' + body;
    } catch (err) {
      console.warn('build: partial não encontrado -> ' + href);
      return _m;
    }
  });
}

function walk(dir, cb) {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) walk(full, cb);
    else cb(full);
  }
}

// No dev, styles.css é um índice de @import (o código vive em styles/*.css).
// Cada @import é um request bloqueante e sequencial: o browser só descobre o
// 2º arquivo DEPOIS de aplicar o 1º, então o FCP paga a latência N vezes.
// Em produção não há ganho em manter isso separado — o build achata tudo num
// stylesheet só, na MESMA ordem dos @import (a cascata depende da ordem).
function resolveImports(css, baseDir) {
  if (!css.includes('@import')) return css;
  return css.replace(/@import url\("([^"]+)"\);?/g, (_m, href) => {
    const p = join(baseDir, href);
    try {
      const part = readFileSync(p, 'utf8');
      return '/* ==== ' + href.split('/').pop() + ' ==== */\n' + resolveImports(part, dirname(p));
    } catch (err) {
      console.warn('build: @import não encontrado -> ' + href);
      return '';
    }
  });
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

let origTotal = 0, minTotal = 0;
walk(SRC, (file) => {
  const rel = file.slice(SRC.length + 1);
  // partials/ e styles/ são as FONTES do que o build achata em index.html e
  // styles.css. Copiá-las para o dist duplicaria ~40KB + ~155KB que ninguém
  // carrega: no dist não existe @import nem marcador #include, então nada as
  // referencia. (O mesmo motivo faz o SW ainda precisar delas em public/.)
  if (rel.startsWith('partials' + sep) || rel.startsWith('styles' + sep)) return;
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const ext = file.split('.').pop();
  if (ext === 'css' || ext === 'js') {
    const raw = readFileSync(file, 'utf8');
    // achata @import ANTES de minificar (minificar antes quebraria o regex)
    const src = ext === 'css' ? resolveImports(raw, dirname(file)) : raw;
    const min = ext === 'css' ? minifyCss(src) : minifyJs(src);
    origTotal += src.length; minTotal += min.length;
    writeFileSync(dest, min);
  } else if (ext === 'html') {
    const raw = readFileSync(file, 'utf8');
    const outHtml = resolvePartials(raw, dirname(file));
    writeFileSync(dest, outHtml);
    origTotal += raw.length; minTotal += outHtml.length;
  } else {
    copyFileSync(file, dest);
    origTotal += statSync(file).size; minTotal += statSync(file).size;
  }
});

const saved = Math.round((1 - minTotal / origTotal) * 100);
console.log(`✓ build em dist/ — ${Math.round(origTotal / 1024)}KB → ${Math.round(minTotal / 1024)}KB (${saved}% menor)`);
