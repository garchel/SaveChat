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
//
// RODA DE DENTRO DE UMA WORKTREE? Funciona, e é o caminho normal quando dois
// agentes trabalham em paralelo: o merge sai numa worktree descartável e o
// checkout principal nunca é tocado (ver "merge em staging" abaixo).

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'origin';
const TARGET = 'staging';
const args = process.argv.slice(2);
const wait = !args.includes('--no-wait');
const branch = args.find((a) => !a.startsWith('--')) || null;

const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', ...opts }).trim();
const fail = (msg) => { console.error(`\n  ✖ ${msg}\n`); process.exit(1); };
const ok = (msg) => console.log(`  ✔ ${msg}`);

// A raiz do projeto precisa ser o checkout PRINCIPAL, não a pasta onde este
// script está: rodando de dentro de `.worktrees/<branch>/`, `import.meta.dirname`
// aponta para a worktree, e aí o script se acha no checkout principal — faz
// `git switch staging` e toma o "already used by worktree" mesmo estando numa
// worktree. O caminho comum do .git é a única âncora idêntica nos dois lugares;
// o "diretório" do .git de uma worktree é um arquivo, não uma pasta.
const samePath = (a, b) =>
  a.replace(/\\/g, '/').replace(/\/$/, '') === b.replace(/\\/g, '/').replace(/\/$/, '');
const ROOT = path.dirname(sh('git rev-parse --path-format=absolute --git-common-dir'));
const inWorktree = !samePath(sh('git rev-parse --show-toplevel'), ROOT);

// ---------- 0. contexto ----------
const current = sh('git rev-parse --abbrev-ref HEAD');
const source = branch || current;
if (source === TARGET) fail(`já está em ${TARGET} — nada a promover`);
if (source === 'main') fail('main é produção:Trabalho nasce de staging, não da main');
if (inWorktree) console.log('  (promovendo de uma worktree — a raiz não será tocada)');

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

// ---------- 2.5. a ${TARGET} andou desde que a branch partiu? ----------
//
// O isolamento da worktree cobre os ARQUIVOS, não o merge. Dois agentes que
// promovem em paralelo partem da mesma base: o segundo faz merge em cima do
// merge do primeiro, e se ambos mexeram nos mesmos arquivos o conflito
// aparece no meio do caminho — tarde demais, com npm test/e2e já rodados
// sobre uma árvore que mudou embaixo deles.
//
// A falha aqui é BARATA e ANTES de qualquer validação. Se a staging andou
// desde que a branch partiu dela, o promote para e diz o que fazer.
//
// O critério é "a base da branch ainda é a ponta da staging": se for, o merge
// é linear e não há o que reconciliar. Se a staging tem commits que a branch
// nunca viu, outro agente promoveu algo que ainda precisa ser reconciliado.
//
// Consequência aceita: um promote por vez, na prática. Se dois agentes
// promoverem no mesmo minuto, o segundo recebe esta mensagem e rebaixa em
// ~10s. Melhor que um conflito resolvido no escuro.
//
// A referência é a staging REMOTA, nunca a local: a worktree principal costuma
// estar na `staging` alguns commits atrás da remota (outro agente acabou de
// promover e o fetch desta worktree ainda não viu). Comparar com a local
// acusaria uma defasagem que não existe.
const base = sh(`git merge-base ${ORIGIN}/${TARGET} ${source}`);
const stageNow = sh(`git rev-parse ${ORIGIN}/${TARGET}`);
if (base !== stageNow) {
  const novos = sh(`git log --oneline ${base}..${ORIGIN}/${TARGET}`).split('\n').filter(Boolean);
  console.log(`\n  ⚠ ${TARGET} andou desde que ${source} partiu dela.`);
  console.log(`    ${novos.length} commit(s) entraram enquanto você trabalhava:\n`);
  console.log(novos.slice(0, 8).map(l => '      ' + l).join('\n'));
  if (novos.length > 8) console.log(`      … e mais ${novos.length - 8}`);
  console.log(`\n    Rebaseie antes de promover:\n`);
  console.log(`      git fetch origin`);
  console.log(`      git rebase origin/${TARGET}`);
  console.log(`      npm test && npm run e2e`);
  console.log(`      git push --force-with-lease`);
  console.log(`      npm run promote`);
  console.log(`\n    Nada foi enviado para ${TARGET}.`);
  process.exit(1);
}
ok(`${TARGET} não andou desde que ${source} partiu dela`);

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
//
// Estando numa worktree de tarefa, NÃO podemos simplesmente `git switch
// staging`: o git recusa com "fatal: 'staging' is already used by worktree
// at ...", porque a staging está checked out na raiz. (E se não estivesse, o
// switch moveria o working tree da raiz por baixo de outro agente.)
//
// A saída é uma worktree descartável em detached sobre origin/staging: merge
// ali, revisão, push a partir dali. O checkout da raiz nunca é tocado.
console.log('');
sh(`git fetch ${ORIGIN}`);

let scratch = null;
if (inWorktree) {
  scratch = path.join(ROOT, '.worktrees', `.promote-${source.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  fs.rmSync(scratch, { recursive: true, force: true });
  sh(`git worktree add --detach "${scratch}" ${ORIGIN}/${TARGET}`);
} else {
  sh(`git switch ${TARGET}`);
  sh(`git merge --ff-only ${ORIGIN}/${TARGET}`);
}

const where = scratch || ROOT;

// Limpeza EXPLÍCITA, não um `finally`: `process.exit()` no Node não executa
// um `finally` pendente, e este script sai por ele em três caminhos (nada
// novo, --no-wait, CI verde/vermelho). Com `finally`, a worktree scratch
// sobrevivia nesses saídas e aparecia para sempre em `git worktree list`.
const cleanup = () => {
  if (!scratch) return;
  try {
    sh(`git worktree remove --force "${scratch}"`);
    sh('git worktree prune');
  } catch (e) {
    console.log(`  ⚠ não consegui remover a worktree temporária ${scratch} (${e.message.split('\n')[0]})`);
    console.log(`    remova com: git worktree remove --force "${scratch}"\n`);
  }
};

// Merge em staging. Conflito deixa marcadores no index; a worktree scratch é
// removida --force logo abaixo, então o merge tem de ser refeito à mão.
let merged;
try {
  sh(`git merge --no-ff ${source} -m "merge: ${source}"`, { cwd: where });
  merged = true;
} catch {
  if (sh('git status --porcelain', { cwd: where })) {
    cleanup();
    fail(`conflito de merge em ${TARGET} — o merge precisa ser refeito à mão`);
  }
  merged = false; // já estava contido
}

ok(merged ? `merge de ${source} em ${TARGET}` : `${source} já estava em ${TARGET}`);
if (scratch) ok('merge feito numa worktree descartável — a raiz não foi tocada');

// ---------- 5. revisão honesta do que vai subir ----------
// Antes do push, não depois: o propósito é você ver o diff e poder abortar.
const diff = sh(`git diff --stat ${ORIGIN}/${TARGET}..HEAD`, { cwd: where });
if (!diff) {
  cleanup();
  console.log('\n  Nada novo para enviar.\n');
  process.exit(0);
}
console.log('\n  Vai subir para ' + TARGET + ':');
console.log(diff.split('\n').map((l) => '    ' + l).join('\n'));
console.log('');

// ---------- 6. push ----------
// O sha sai ANTES do cleanup: `cleanup()` apaga a worktree scratch, e um
// `git rev-parse` com cwd num diretário que não existe mais morre com ENOENT
// — o script falharia DEPOIS de ter promotionado com sucesso.
const sha = sh('git rev-parse --short HEAD', { cwd: where });
try {
  if (scratch) sh(`git push ${ORIGIN} HEAD:${TARGET}`, { cwd: scratch });
  else sh(`git push ${ORIGIN} ${TARGET}`);
} catch (e) {
  cleanup();
  throw e;
}
ok(`push para ${ORIGIN}/${TARGET}`);
cleanup();

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
