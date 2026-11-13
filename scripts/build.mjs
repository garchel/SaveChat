// Build leve: minifica CSS/JS de public/ → dist/ sem dependências externas.
// Uso: npm run build  (dev continua servindo public/ normalmente)
// Estratégia conservadora: remove comentários/whitespace redundantes.
// NÃO renomeia identificadores (segurança p/ ES Modules).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join, dirname, sep, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

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

// Minificador de JS: remove comentários preservando strings, templates e
// REGEX LITERAIS.
//
// Por que o scanner é necessário: um `//` dentro de um regex literal não é
// comentário. A versão anterior testava só `c === '/' && next === '/'` e por
// isso truncava a linha em `.replace(/\//g, '_')` — o `\/` seguido do `/`
// delimitador forma `//`. O resultado era um regex sem fechamento
// ("Invalid regular expression: missing /") que derrubava o grafo de módulos
// inteiro: o app não bootava do dist.
const REGEX_PREV = new Set('(,=:[!&|?{};+-*%~^<>'.split(''));
// depois destas palavras um `/` é regex, não divisão (`return /re/`)
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'delete', 'void', 'instanceof', 'in', 'of', 'new', 'do', 'else', 'yield', 'await', 'throw']);
const IDENT_CHAR = /[A-Za-z0-9_$]/;

function minifyJs(js) {
  let out = '';
  let prev = '';   // último caractere significativo emitido
  let word = '';   // última palavra (para reconhecer keywords)
  let i = 0;

  const emit = (ch) => {
    out += ch;
    if (!/\s/.test(ch)) {
      prev = ch;
      if (IDENT_CHAR.test(ch)) word += ch; else word = '';
    }
  };

  while (i < js.length) {
    const c = js[i], next = js[i + 1];

    // comentário de linha
    if (c === '/' && next === '/') {
      while (i < js.length && js[i] !== '\n') i++;
      continue;
    }
    // comentário de bloco
    if (c === '/' && next === '*') {
      i += 2;
      while (i < js.length && !(js[i] === '*' && js[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // string simples
    if (c === '"' || c === "'") {
      out += c; i++;
      while (i < js.length) {
        const ch = js[i];
        out += ch;
        if (ch === '\\') { out += js[i + 1] || ''; i += 2; continue; }
        i++;
        if (ch === c) break;
      }
      prev = c; word = '';
      continue;
    }
    // template literal: copiado verbatim (interpolação inclusive). Não vale a
    // pena interpretar `${}` para economizar bytes; copiar é sempre seguro.
    if (c === '`') {
      out += c; i++;
      while (i < js.length) {
        const ch = js[i];
        out += ch;
        if (ch === '\\') { out += js[i + 1] || ''; i += 2; continue; }
        i++;
        if (ch === '`') break;
      }
      prev = '`'; word = '';
      continue;
    }
    // regex literal: só quando o contexto permite (início de expressão)
    if (c === '/') {
      const podeRegex = prev === '' || REGEX_PREV.has(prev) || REGEX_KEYWORDS.has(word);
      if (podeRegex) {
        out += c; i++;
        let inClass = false;
        while (i < js.length) {
          const ch = js[i];
          out += ch;
          if (ch === '\\') { out += js[i + 1] || ''; i += 2; continue; }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) { i++; break; }
          i++;
        }
        while (i < js.length && /[a-z]/i.test(js[i])) { out += js[i]; i++; } // flags
        prev = '/'; word = '';
        continue;
      }
    }
    emit(c);
    i++;
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

// O sw.js precacheia a lista ASSETS. Em public/ ela inclui os 21 arquivos de
// styles/*.css e os partials; o dist NÃO os tem (foram achatados em
// styles.css e index.html) — e um cache.addAll() com um 404 derruba o install
// inteiro, matando offline e updates em produção.
// Aqui o build remove da lista, no sw.js do dist, tudo que não existe no dist.
// É genérico de propósito: vale para qualquer asset futuro que o build deixe
// de emitir, sem ninguém precisar lembrar de editar duas listas.
function pruneSwAssets(sw, outDir) {
  return sw.replace(/ASSETS\s*=\s*\[([\s\S]*?)\];/, (_m, body) => {
    const entries = body.split(',').map((s) => s.trim()).filter(Boolean);
    const kept = entries.filter((entry) => {
      const raw = entry.replace(/^['"]|['"]$/g, '');
      if (raw === './' || raw === '.') return true;
      return existsSync(join(outDir, raw.replace(/^\.\//, '')));
    });
    const dropped = entries.length - kept.length;
    if (dropped > 0) console.log('build: sw.js do dist sem ' + dropped + ' asset(s) que não existem no dist');
    return 'ASSETS = [\n  ' + kept.join(',\n  ') + ',\n];';
  });
}

// Limpa o dist antes de gerar. No Windows a pasta pode estar "presa" por um
// processo com cwd dentro dela (ex.: `npm run preview` aberto): rmSync então
// dá EPERM. Nesse caso removemos o que der, arquivo por arquivo — os que
// restarem serão sobrescritos pelo próprio build.
function limparOut(dir) {
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
    return;
  } catch { /* pasta em uso: cai no fallback */ }
  for (const f of readdirSync(dir)) {
    try { rmSync(join(dir, f), { recursive: true, force: true }); } catch { /* sobrescrito depois */ }
  }
}

function build() {
limparOut(OUT);
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
    const final = rel === 'sw.js' ? pruneSwAssets(min, OUT) : min;
    origTotal += src.length; minTotal += final.length;
    writeFileSync(dest, final);
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
}

// Roda só quando executado direto (`node scripts/build.mjs`). Sem a guarda,
// importar este módulo num teste executaria o build inteiro como efeito
// colateral — o teste do minificador precisa das funções, não do dist.
const _isMain = process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
if (_isMain) build();

export { minifyJs, minifyCss, resolveImports, resolvePartials, pruneSwAssets, build };
