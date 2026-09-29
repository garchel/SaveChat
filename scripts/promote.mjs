// Promove a branch de trabalho para staging e espera o CI.
//
//   node scripts/promote.mjs                      # branch atual
//   node scripts/promote.mjs fix/modal-altura     # branch específica
//   node scripts/promote.mjs --no-wait            # só merge + push
//
// O que ele FAZ (e só isto):
//   1. valida a árvore limpa e a branch de origem
//   2. roda check + test + e2e local (nada vai para staging sem isso)
//   3. merge --no-ff em staging, push
//   4. acompanha o CI e mostra o veredito
//
// O que ele NÃO faz: abrir PR, mergear em main, deploy. A promoção
// para produção é decisão sua, depois do teste manual em staging.

import { execSync, spawnSync } from 'node:child_process';

const ORIGIN = 'origin';
const TARGET = 'staging';
const args = process.argv.slice(2);
const wait = !args.includes('--no-wait');
const branch = args.find((a) => !a.startsWith('--')) || null;

const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', ...opts }).trim();
const fail = (msg) => { console.error(`\n  ✖ ${msg}\n`); process.exit(1); };
const ok = (msg) => console.log(`  ✔ ${msg}`);

// ---------- 0. contexto ----------
const current = sh('git rev-parse --abbrev-ref HEAD');
const source = branch || current;

if (source === TARGET) fail(`já está em ${TARGET} — nada a promover`);
if (source === 'main') fail('main é produção:Trabalho nasce de staging, não da main');

console.log(`\n  Promovendo  ${source}  →  ${TARGET}\n`);

// ---------- 1. árvore limpa ----------
if (sh('git status --porcelain')) {
  fail('árvore suja: commite ou descarte antes de promover');
}
ok('árvore limpa');

// ---------- 2. branch existe no remoto ----------
try {
  sh(`git rev-parse --verify ${ORIGIN}/${source}`);
} catch {
  fail(`${ORIGIN}/${source} não existe — rode: git push -u origin ${source}`);
}
ok(`branch remota ${ORIGIN}/${source} existe`);

// ---------- 3. validação local (o portão) ----------
console.log('\n  Validando localmente…');
const step = (label, cmd) => {
  const r = spawnSync(cmd, { shell: true, stdio: 'pipe', encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || '', r.stderr || '');
    fail(`${label} falhou — nada foi para ${TARGET}`);
  }
  ok(label);
};
step('check (sintaxe)', 'npm run check');
step('test (unit)', 'npm test');
step('e2e (fluxo crítico)', 'npm run e2e');

// ---------- 4. merge em staging ----------
console.log('');
sh(`git fetch ${ORIGIN}`);
sh(`git switch ${TARGET}`);
sh(`git merge --ff-only ${ORIGIN}/${TARGET}`);

// se staging já contém a branch (merge anterior), o merge é no-op
let merged;
try {
  sh(`git merge --no-ff ${source} -m "merge: ${source}"`);
  merged = true;
} catch {
  if (sh('git status --porcelain')) fail('conflito de merge — resolva manualmente');
  merged = false; // já estava contido
}
ok(merged ? `merge de ${source} em ${TARGET}` : `${source} já estava em ${TARGET}`);

// ---------- 5. revisão honesta do que vai subir ----------
const diff = sh(`git diff --stat ${ORIGIN}/${TARGET}..HEAD`);
if (!diff) {
  console.log('\n  Nada novo para enviar.\n');
  process.exit(0);
}
console.log(`\n  Vai subir para ${TARGET}:`);
console.log(diff.split('\n').map((l) => '    ' + l).join('\n'));
console.log('');

// ---------- 6. push ----------
sh(`git push ${ORIGIN} ${TARGET}`);
ok(`push para ${ORIGIN}/${TARGET}`);

const sha = sh('git rev-parse --short HEAD');
console.log(`\n  ${TARGET} em ${sha}\n`);

// ---------- 7. CI ----------
if (!wait) { console.log('  (--no-wait: CI não aguardado)\n'); process.exit(0); }

console.log('  Acompanhando o CI…\n');
let last = '';
let runId = '';
for (let i = 0; i < 60; i++) {
  let out;
  try {
    // sem jq: o --jq com interpolação é finalizado pelo cmd do Windows.
    // --json sem formatador + parse do próprio node é portável.
    const raw = sh('gh run list --branch ' + TARGET + ' --limit 1 --json databaseId,status,conclusion,headSha');
    const run = JSON.parse(raw)[0];
    out = run ? `${run.databaseId} ${run.status} ${run.conclusion} ${run.headSha}` : 'sem run';
  } catch {
    out = 'sem gh cli';
  }
  const parts = out.split(' ');
  // só acompanha o run do commit que acabamos de subir: um run anterior
  // ainda em voo não é o nosso (e nem entra no log de status)
  if (parts[3] && parts[3].startsWith(sha)) {
    runId = parts[0];
    if (out !== last && !out.startsWith('sem gh')) {
      console.log('    ' + parts.slice(0, 3).join(' '));
      last = out;
    }
    if (parts[2] === 'success') {
      console.log(`\n  ✔ CI verde em ${TARGET} — pode testar com: npm run preview\n`);
      process.exit(0);
    }
    if (parts[2] === 'failure' || parts[2] === 'cancelled') {
      console.log(`\n  ✖ CI ${parts[2]} em ${TARGET}\n`);
      console.log(`    Logs: gh run view ${runId} --log-failed\n`);
      process.exit(1);
    }
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log('\n  ⏱ CI ainda rodando — acompanhe com: gh run list --branch staging\n');
