// Build de produção: public/ → dist/.
// Uso: npm run build  (dev continua servindo public/ normalmente)
//
// O dist é o que a Vercel publica. Ele difere do public/ em três pontos, e os
// três existem por medição, não por gosto:
//
//  1. CSS achatado (índice de @import → 1 arquivo). Cada @import é um request
//     bloqueante e sequencial: o browser só descobre o seguinte depois de
//     aplicar o anterior.
//  2. JS empacotado (esbuild) em poucos arquivos, em vez de ~50 módulos. Os
//     módulos são buscados em paralelo (HTTP/2), mas o grafo só fica pronto
//     depois do último — cada um paga latência e parse.
//  3. Partials inline (index.html deixa de buscar markup em runtime).
//
// app e styles saem do build com hash no nome, o que permite cache imutável
// (vercel.json): o arquivo muda de nome quando muda de conteúdo, então o
// browser nunca precisa revalidar.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync, renameSync, rmSync } from 'fs';
import { join, dirname, sep, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { build as esbuild } from 'esbuild';

const SRC = 'public';
const OUT = 'dist';

const hash8 = (txt) => createHash('sha1').update(txt).digest('hex').slice(0, 8);

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
//
// Hoje só o sw.js passa por aqui (o JS do app vai pelo esbuild), mas o bug
// vale para qualquer arquivo que use esta função.
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
// styles/*.css, os partials e os ~50 módulos JS; o dist não tem nenhum deles
// (foram achatados/empacotados) — e um cache.addAll() com um 404 derruba o
// install inteiro, matando offline e updates em produção.
// Aqui o build remove da lista, no sw.js do dist, tudo que não existe no dist
// e acrescenta os arquivos com hash que ele mesmo gerou.
// É genérico de propósito: vale para qualquer asset futuro que deixe de existir.
function pruneSwAssets(sw, outDir, adicionar) {
  return sw.replace(/ASSETS\s*=\s*\[([\s\S]*?)\];/, (_m, body) => {
    const entries = body.split(',').map((s) => s.trim()).filter(Boolean);
    const kept = entries.filter((entry) => {
      const raw = entry.replace(/^['"]|['"]$/g, '');
      if (raw === './' || raw === '.') return true;
      return existsSync(join(outDir, raw.replace(/^\.\//, '')));
    });
    const extras = (adicionar || []).map((f) => "'./" + f + "'").filter((e) => kept.indexOf(e) < 0);
    const dropped = entries.length - kept.length;
    if (dropped > 0) console.log('build: sw.js do dist sem ' + dropped + ' asset(s) que não existem no dist');
    return 'ASSETS = [\n  ' + kept.concat(extras).join(',\n  ') + ',\n];';
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

// Empacota o app. `splitting` mantém o import() dinâmico (catálogo de emojis)
// como chunk separado — e ele só é baixado quando o picker abre.
// URLs absolutas (esm.sh) são carregadas em runtime, nunca empacotadas.
async function bundleApp(outDir) {
  const res = await esbuild({
    entryPoints: [join(SRC, 'app.js')],
    outdir: outDir,
    bundle: true,
    format: 'esm',
    splitting: true,
    minify: true,
    target: 'es2020',
    entryNames: 'app.[hash]',
    chunkNames: 'js/[name].[hash]',
    external: ['https://*', 'http://*'],
    metafile: true,
    logLevel: 'silent',
  });
  const outputs = Object.keys(res.metafile.outputs).map((p) => p.replace(/^dist[\\/]/, '').replace(/\\/g, '/'));
  const entryEntry = Object.entries(res.metafile.outputs)
    .find(([, v]) => v.entryPoint && v.entryPoint.replace(/\\/g, '/').endsWith('public/app.js'));
  const entry = entryEntry ? entryEntry[0].replace(/^dist[\\/]/, '').replace(/\\/g, '/') : null;
  // arquivos que ENTRARAM no bundle: só eles deixam de ser copiados soltos.
  // O resto (error-tracking.js e outros scripts clássicos) continua sendo
  // copiado — sem isso o index.html aponta para um 404 silencioso.
  const inputs = new Set(Object.keys(res.metafile.inputs).map((p) => p.replace(/\\/g, '/')));
  return { outputs, entry, inputs };
}

async function build() {
  limparOut(OUT);
  mkdirSync(OUT, { recursive: true });

  // ---- 1. estáticos: tudo que NÃO é JS de módulo (imagens, fontes, manifest) ----
  let origTotal = 0, minTotal = 0;

  // O bundle roda PRIMEIRO para sabermos exatamente quais arquivos entraram
  // nele: só esses deixam de ser copiados soltos. Scripts clássicos que o
  // index.html referencia (error-tracking.js) continuam no dist.
  const { outputs: jsOutputs, entry: appFile, inputs } = await bundleApp(OUT);
  if (!appFile) throw new Error('build: esbuild não devolveu o entry de app.js');
  const empacotado = (file) => inputs.has(file.replace(/\\/g, '/'));

  // o JS sai do tamanho ORIGINAL daqui (ele não é copiado, é empacotado) —
  // sem isto o build "cresce" no relatório, porque o bundle entra no minTotal
  // sem o equivalente no origTotal
  walk(SRC, (f) => { if (f.endsWith('.js')) origTotal += statSync(f).size; });
  walk(SRC, (file) => {
    const rel = file.slice(SRC.length + 1);
    // partials/ e styles/ são as FONTES do que o build achata em index.html e
    // styles.css. Copiá-las para o dist duplicaria ~40KB + ~155KB que ninguém
    // carrega: no dist não existe @import nem marcador #include, então nada as
    // referencia. (O mesmo motivo faz o SW ainda precisar delas em public/.)
    if (rel.startsWith('partials' + sep) || rel.startsWith('styles' + sep)) return;
    const ext = file.split('.').pop();
    // só o que ENTROU no bundle é omitido; sw.js e scripts clássicos
    // (error-tracking.js) continuam sendo copiados
    if (ext === 'js' && empacotado(file)) return;
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (ext === 'css') {
      const raw = readFileSync(file, 'utf8');
      // achata @import ANTES de minificar (minificar antes quebraria o regex)
      const src = resolveImports(raw, dirname(file));
      const min = minifyCss(src);
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

  // ---- 2. tamanho do JS empacotado (o bundle já foi gerado no passo 1) ----
  minTotal += jsOutputs.reduce((s, f) => s + statSync(join(OUT, f)).size, 0);

  // ---- 3. CSS com hash (habilita cache imutável) ----
  const cssFile = 'styles.' + hash8(readFileSync(join(OUT, 'styles.css'))) + '.css';
  renameSync(join(OUT, 'styles.css'), join(OUT, cssFile));

  // ---- 4. index.html aponta para os nomes com hash ----
  const indexPath = join(OUT, 'index.html');
  writeFileSync(indexPath, readFileSync(indexPath, 'utf8')
    .replace(/href="styles\.css"/g, 'href="' + cssFile + '"')
    .replace(/src="app\.js"/g, 'src="' + appFile + '"'));

  // ---- 5. sw.js coerente com o que existe (e com os nomes com hash) ----
  const swPath = join(OUT, 'sw.js');
  const chunks = jsOutputs.filter((f) => f !== appFile);
  writeFileSync(swPath, pruneSwAssets(minifyJs(readFileSync(swPath, 'utf8')), OUT, [appFile, cssFile].concat(chunks)));

  const saved = Math.round((1 - minTotal / origTotal) * 100);
  console.log(`✓ build em dist/ — ${Math.round(origTotal / 1024)}KB → ${Math.round(minTotal / 1024)}KB (${saved}% menor)`);
  console.log(`  app: ${appFile} · css: ${cssFile} · ${chunks.length} chunk(s)`);
}

// Roda só quando executado direto (`node scripts/build.mjs`). Sem a guarda,
// importar este módulo num teste executaria o build inteiro como efeito
// colateral — o teste do minificador precisa das funções, não do dist.
const _isMain = process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
if (_isMain) {
  build().catch((err) => { console.error('build falhou:', err && err.message); process.exit(1); });
}

export { minifyJs, minifyCss, resolveImports, resolvePartials, pruneSwAssets, bundleApp, build };
