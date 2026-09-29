// Worktree de tarefa — o isolamento entre agentes.
//
//   node scripts/wt.mjs new <branch>      # cria a worktree e prepara o workspace
//   node scripts/wt.mjs list              # worktrees vivas
//   node scripts/wt.mjs remove <branch>   # descarta (recusa se suja)
//
// O QUE ISTO SUBSTITUI: `git switch <branch>`.
//
// Por quê: branch é um ponteiro, não um diretório. Duas conversas com o mesmo
// cwd compartilham UM working tree — `git switch` move o índice e os arquivos
// do processo inteiro, e o outro agente acorda na branch nova com o trabalho
// dele em cima. Não há como isolar isso por sessão. A worktree é o único
// isolamento real: cada agente ganha um diretório próprio.
//
// Uso pelo agente: no começo de uma tarefa, `node scripts/wt.mjs new
// feature/x` e trabalhar a partir do path impresso. O Hermes também tem o
// atalho ⌘⇧B / `/worktree new` — mas este script o agente consegue chamar
// sem depender de UI.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WT_DIR = path.join(ROOT, '.worktrees');
const BASE_DEFAULT = 'staging';

const args = process.argv.slice(2);
const cmd = args[0];
const fail = (m) => { console.error(`\n  ✖ ${m}\n`); process.exit(1); };
const ok = (m) => console.log(`  ✔ ${m}`);

const git = (...a) => execSync('git ' + a.join(' '), { encoding: 'utf8', cwd: ROOT }).trim();
const isMainCheckout = () => {
  try {
    return fs.existsSync(path.join(ROOT, '.git'));
  } catch {
    return false;
  }
};

// O worktree é a raiz de todas as branches de subsistema. Sem essa linha a
// pasta aparece como untracked e o promote aborta na árvore limpa. O commit é
// automático de propósito: deixar a linha pendente faria o próximo `wt.mjs new`
// (e o `promote`) recusarem por árvore suja — um atrito auto-infligido logo
// depois de instalar a ferramenta que deveria evitá-lo.
function ensureWorktreesIgnored() {
  const gi = path.join(ROOT, '.gitignore');
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (cur.split('\n').some((l) => l.trim() === '.worktrees/')) return;
  const add = (cur && !cur.endsWith('\n') ? '\n' : '') +
    '\n# worktrees de tarefa (um por agente) — nunca versionado\n.worktrees/\n';
  fs.writeFileSync(gi, cur + add);
  ok('.worktrees/ adicionado ao .gitignore');

  try {
    git('ls-files', '--error-unmatch', '.gitignore');
    git('add', '.gitignore');
    // A mensagem precisa de aspas: o helper git() concatena os args e passa
    // a string pro shell, então "chore: ignora .worktrees (worktree por
    // agente)" sem aspas vira `-m chore:` + tentativas de abrir paths
    // .worktrees(...) e o commit falha em silêncio. E --no-verify porque o
    // commit é nosso, não do usuário — o hook de pre-commit não tem nada a
    // ver com um .gitignore de uma linha.
    git('commit', '--no-verify', '-m', '"chore: ignora .worktrees (worktree por agente)"');
    ok('.gitignore commitado');
  } catch {
    console.log('\n  ⚠ o .gitignore não está versionado. Comite-o antes de promover,\n    senão promote aborta na árvore suja.\n');
  }
}

const slug = (b) => b.replace(/^[a-z]+\//, '').replace(/[^a-zA-Z0-9._-]/g, '-');

function cmdNew() {
  const branch = args[1];
  if (!branch) fail('uso: node scripts/wt.mjs new <branch> [--base <ref>]');
  const bi = args.indexOf('--base');
  const base = bi > -1 ? args[bi + 1] : BASE_DEFAULT;

  if (!isMainCheckout()) {
    fail('você já está dentro de uma worktree — uma worktree por agente.\n    Para outra tarefa: rode a partir do repo raiz.');
  }
  if (git('branch', '--show-current') === 'main') {
    fail('main é produção — crie a worktree a partir de ' + BASE_DEFAULT);
  }
  if (git('status', '--porcelain')) {
    fail('árvore suja: commite ou descarte antes. Nada de worktree sobre HEAD em movimento.');
  }

  ensureWorktreesIgnored();
  ok('árvore limpa');

  git('fetch', 'origin', '--quiet');
  // Base = a branch local se existir, senão a remota. Trabalho nasce de
  // homologação, não de produção.
  let baseRef;
  try {
    git('rev-parse', '--verify', base);
    baseRef = base;
  } catch {
    baseRef = `origin/${base}`;
  }
  try {
    git('rev-parse', '--verify', baseRef);
  } catch {
    fail(`base ${base} não existe`);
  }

  const name = slug(branch);
  const wtPath = path.join(WT_DIR, name);
  if (fs.existsSync(wtPath)) {
    const cur = execSync(`git -C "${wtPath}" branch --show-current`, { encoding: 'utf8' }).trim();
    if (cur === branch) {
      ok(`reaproveitando a worktree existente de ${branch}`);
    } else {
      fail(`${wtPath} já existe com a branch ${cur} — remova com: node scripts/wt.mjs remove ${name}`);
    }
  } else {
    fs.mkdirSync(WT_DIR, { recursive: true });
    try {
      git('worktree', 'add', '-b', branch, wtPath, baseRef);
    } catch (e) {
      // A branch já existe mas sem worktree: converte, não falha.
      if (String(e.message).includes('already exists')) {
        git('worktree', 'add', wtPath, branch);
      } else {
        throw e;
      }
    }
    ok(`worktree criada em .worktrees/${name}`);
  }

  // node_modules: junction, não cópia. A worktree está dentro do repo, então
  // `npm install` aqui duplicaria 45M por branch e o lockfile poderia divergir
  // do da raiz. Junction funciona sem privilégio de admin no Windows.
  for (const dep of ['node_modules', 'server/node_modules']) {
    const target = path.join(ROOT, dep);
    const link = path.join(wtPath, dep);
    if (!fs.existsSync(target) || fs.existsSync(link)) continue;
    fs.mkdirSync(path.dirname(link), { recursive: true });
    try {
      fs.symlinkSync(target, link, 'junction');
      ok(`junction ${dep} → raiz`);
    } catch (e) {
      console.log(`  ⚠ não consegui criar o junction de ${dep} (${e.code}) — rode npm install aí se precisar.`);
    }
  }

  // O e2e sobe um servidor na 4173 com reuseExistingServer. Duas worktrees
  // rodando e2e ao mesmo tempo = a segunda testa o servidor da primeira, em
  // silêncio, e "confirma" uma árvore que não é a dela. O comando impresso
  // abaixo fixa uma porta própria por worktree.
  const idx = fs.readdirSync(WT_DIR).indexOf(name);
  const port = 4200 + (idx < 0 ? 0 : idx);

  console.log('\n  Trabalhe a partir daqui:\n');
  console.log(`    cd "${wtPath}"\n`);
  console.log('  Ao terminar, promova com:\n');
  console.log(`    node scripts/promote.mjs ${branch}\n`);
  console.log(`  E2E desta worktree (porta própria, ${port}):\n`);
  console.log(`    cd "${wtPath}" && PORT=${port} npm run e2e\n`);
  ok(`base: ${baseRef}`);
  console.log('');
}

function cmdList() {
  console.log('\n  Worktrees:\n');
  const out = git('worktree', 'list');
  for (const line of out.split('\n')) {
    const [p, , ref] = line.trim().split(/\s+/);
    if (!p) continue;
    const isMain = p === ROOT.replace(/\\/g, '/');
    let dirty = '';
    try {
      const s = execSync(`git -C "${p}" status --porcelain`, { encoding: 'utf8' }).trim();
      if (s) dirty = `  ⚠ ${s.split('\n').length} arquivo(s) alterado(s)`;
    } catch { /* worktree já removido */ }
    console.log(`    ${isMain ? '▪' : '▫'} ${(ref || '').replace(/[[\]]/g, '').padEnd(34)} ${p}${dirty}`);
  }
  console.log('');
}

function cmdRemove() {
  const name = args[1];
  if (!name) fail('uso: node scripts/wt.mjs remove <branch-slug>');
  const wtPath = path.join(WT_DIR, name);
  if (!fs.existsSync(wtPath)) fail(`${wtPath} não existe`);
  const s = execSync(`git -C "${wtPath}" status --porcelain`, { encoding: 'utf8' }).trim();
  if (s) {
    console.error('\n  ✖ a worktree tem trabalho não commitado:\n');
    console.error(s.split('\n').map((l) => '      ' + l).join('\n'));
    console.error('\n    commite, promova, ou remova a pasta à mão para descartar.\n');
    process.exit(1);
  }
  git('worktree', 'remove', '--force', wtPath);
  git('worktree', 'prune');
  ok(`worktree ${name} removida`);
}

if (cmd === 'new') cmdNew();
else if (cmd === 'list') cmdList();
else if (cmd === 'remove') cmdRemove();
else {
  console.log(`
  Worktree de tarefa — isolamento entre agentes

    node scripts/wt.mjs new <branch>      cria a worktree e prepara o workspace
    node scripts/wt.mjs list              worktrees vivas
    node scripts/wt.mjs remove <slug>     descarta (recusa se suja)

  Substitui git switch para trabalho paralelo. Ver CONTRIBUTING.md.
`);
}
