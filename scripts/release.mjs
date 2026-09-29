// Release — o ÚNICO lugar onde a versão sobe.
//
//   node scripts/release.mjs patch     # 1.16.0 -> 1.16.1
//   node scripts/release.mjs minor     # 1.16.0 -> 1.17.0
//   node scripts/release.mjs major     # 1.16.0 -> 2.0.0
//   node scripts/release.mjs 1.17.0    # versão explícita
//   node scripts/release.mjs --dry     # mostra o que faria, não mexe
//
// POR QUE ISTO EXISTE
//
// A convenção antiga era bumpar versão em TODA branch de trabalho. Isso
// garantia que duas branches em paralelo colissem nos mesmos cinco
// arquivos — `sw.js`, `index.html` (duas vezes), `package.json`,
// `CHANGELOG.md`, `tests/sync.test.js` — porque toda branch mexe neles.
// Três PRs seguidos abriram CONFLICTING por isso.
//
// A regra nova: **branch de trabalho NUNCA toca a versão**. A versão sobe
// aqui, num commit isolado, no momento da promoção. Como este commit é o
// único que mexe nesses cinco arquivos, ele não colide com mais nada.
//
// A suíte (`tests/sync.test.js`) garante a coerência: ela falha se os
// cinco arquivos discordarem entre si.
//
// USO
//
//   git switch main && git pull --ff-only
//   node scripts/release.mjs minor
//   npm run check && npm test
//   git commit -am "release: v1.17.0"   (o script já commita; use --no-commit se preferir revisar)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const fail = (m) => { console.error(`\n  ✖ ${m}\n`); process.exit(1); };
const ok = (m) => console.log(`  ✔ ${m}`);

const sh = (c) => execSync(c, { encoding: 'utf8', cwd: ROOT }).trim();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

const ARGS = process.argv.slice(2);
const dry = ARGS.includes('--dry');
const noCommit = ARGS.includes('--no-commit');
const kind = ARGS.find((a) => !a.startsWith('--'));

// ---------- guarda: só na main, e com a árvore limpa ----------
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  fail(`release roda na main (você está em ${branch})\n    A versão sobe quando o trabalho vira produção, não na branch.`);
}
if (sh('git status --porcelain')) {
  fail('árvore suja: commite antes de bumpar a versão');
}
ok('main, árvore limpa');

// ---------- versão atual ----------
const pkg = JSON.parse(read('package.json'));
const atual = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(atual)) fail(`package.json com versão inesperada: ${atual}`);

let proxima;
if (/^\d+\.\d+\.\d+$/.test(kind || '')) {
  proxima = kind;
} else {
  const [ma, mi, pa] = atual.split('.').map(Number);
  if (kind === 'major') proxima = `${ma + 1}.0.0`;
  else if (kind === 'minor') proxima = `${ma}.${mi + 1}.0`;
  else if (kind === 'patch') proxima = `${ma}.${mi}.${pa + 1}`;
  else fail('uso: node scripts/release.mjs <patch|minor|major|x.y.z> [--dry] [--no-commit]');
}

// ---------- o que a suíte exige estar coerente ----------
const CHANGELOG = 'public/CHANGELOG.md';
const SW = 'public/sw.js';
const INDEX = 'public/index.html';
const MENUS = 'public/partials/menus.txt';
const TEST = 'tests/sync.test.js';

// SW: o número é um contador, não a versão. Sobe sempre em 1.
const swAtual = (read(SW).match(/notethread-v(\d+)/) || [])[1];
if (!swAtual) fail(`não achei notethread-vN em ${SW}`);
const swNovo = String(Number(swAtual) + 1);

// ---------- ChangesNotices extras (opcional) ----------
const NOTA = ARGS.find((a) => a.startsWith('--nota='));
const EXTRA = [];
if (NOTA) EXTRA.push({ tipo: 'Modificado', texto: NOTA.slice('--nota='.length) });

const hoje = new Date().toISOString().slice(0, 10);

// ---------- mostra o plano ----------
console.log(`\n  ${atual} → ${proxima}   (SW v${swAtual} → v${swNovo})\n`);
if (dry) {
  console.log('  --dry: nada foi escrito.\n');
  for (const f of [SW, INDEX, MENUS, 'package.json', TEST, CHANGELOG]) console.log('    ' + f);
  console.log('');
  process.exit(0);
}

// ---------- aplica ----------
// 1. package.json
pkg.version = proxima;
write('package.json', JSON.stringify(pkg, null, 2) + '\n');
ok(`package.json → ${proxima}`);

// 2. sw.js (contador, +1)
write(SW, read(SW).replace(`notethread-v${swAtual}`, `notethread-v${swNovo}`));
ok(`sw.js → v${swNovo}`);

// 3. index.html — APP_VERSION
let idx = read(INDEX);
if (!idx.includes(`APP_VERSION = '${atual}'`)) {
  fail(`index.html não tem APP_VERSION = '${atual}' — bumps manuais anteriores?`);
}
idx = idx.replace(`APP_VERSION = '${atual}'`, `APP_VERSION = '${proxima}'`);
write(INDEX, idx);
ok(`index.html → ${proxima}`);

// 4. menus.txt — a versão da seção Sobre
let menus = read(MENUS);
if (menus.includes(`>${atual}<`)) {
  menus = menus.replace(`>${atual}<`, `>${proxima}<`);
  write(MENUS, menus);
  ok(`menus.txt (Sobre) → ${proxima}`);
} else {
  fail(`menus.txt não tem >${atual}< — bumps manuais anteriores?`);
}

// 5. CHANGELOG — entrada nova no topo
let ch = read(CHANGELOG);
const titulo = `## [${proxima}] — ${hoje}`;
if (ch.includes(titulo)) fail(`${titulo} já existe no CHANGELOG`);
const corpo = EXTRA.length
  ? EXTRA.map((e) => `### ${e.tipo}\n- ${e.texto}`).join('\n')
  : `### Alterado\n- (descreva a mudança com --nota=...)`;
const iCabecalho = ch.indexOf('\n## [');
const entrada = `\n${titulo}\n${corpo}\n`;
ch = iCabecalho === -1
  ? ch + entrada
  : ch.slice(0, iCabecalho) + entrada + ch.slice(iCabecalho);
write(CHANGELOG, ch);
ok(`CHANGELOG → ${titulo}`);

// 6. tests/sync.test.js — o valor esperado do cache
let tst = read(TEST);
if (!tst.includes(`sw.js é v${swAtual}`)) {
  fail(`tests/sync.test.js não espera v${swAtual} — bumps manuais anteriores?`);
}
tst = tst.replace(`sw.js é v${swAtual}`, `sw.js é v${swNovo}`).replace(/notethread-v\d+/g, `notethread-v${swNovo}`);
write(TEST, tst);
ok(`sync.test.js → v${swNovo}`);

// ---------- 7. a suíte decide se a promoção é válida ----------
console.log('\n  Validando a coerência da versão…');
const r = (await import('node:child_process')).spawnSync('npm', ['test'], { cwd: ROOT, shell: true, stdio: 'pipe', encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stdout || '', r.stderr || '');
  fail('a suíte recusou o bump — os cinco arquivos não ficaram coerentes');
}
ok('suíte verde: os cinco arquivos concordam');

// ---------- 8. commit ----------
if (noCommit) {
  console.log('\n  --no-commit: mudanças no working tree, revise e commite.\n');
  process.exit(0);
}
sh(`git add -A`);
sh(`git commit -m "release: v${proxima}"`);
ok(`commit release: v${proxima}`);
console.log(`
  ─────────────────────────────────────────────
   v${proxima} pronto. Agora: npm run check
   (o e2e não é necessário para um bump puro —
    nenhum comportamento mudou)
  ─────────────────────────────────────────────
`);
