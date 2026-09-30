// A checagem de rebasing do promote, provada num repositório descartável.
//
// Por que um repositório próprio: o teste precisa que "outro agente promova
// na staging". Numa cópia do repo real isso mexeria na staging de verdade —
// foi exatamente o que a primeira versão deste teste tentou fazer, e ela foi
// jogada fora. Aqui o 'origin' é um bare local em %TEMP%, apagado no fim.
import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// o cálculo, copiado de scripts/promote.mjs
const bloqueia = (clone, branch) => {
  const sh = c => execSync(c, { encoding: 'utf8', shell: true, cwd: clone }).trim();
  return sh(`git merge-base origin/staging ${branch}`) !== sh('git rev-parse origin/staging');
};

// `os.tmpdir()` e nao `process.env.TEMP || process.env.TMPDIR`: no Linux do CI
// TMPDIR nao existe e o path.join recebia undefined, derrubando o arquivo no
// import. tmpdir() ja sabe qual variavel usar em cada plataforma.
const repoDescartavel = () => {
  const tmp = path.join(os.tmpdir(), `promote-rebase-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const remoto = path.join(tmp, 'origin.git');
  const clone = path.join(tmp, 'clone');
  const sh = (c, cwd = tmp) => execSync(c, { encoding: 'utf8', shell: true, cwd }).trim();
  sh('git init --bare -q -b main origin.git');
  sh(`git clone -q "${remoto}" clone`);
  sh('git config user.email t@t.t && git config user.name t', clone);
  sh('git commit -q --allow-empty -m "base"', clone);
  sh('git push -q -u origin main', clone);
  sh('git branch staging && git push -q -u origin staging', clone);
  return { tmp, clone, remoto, sh };
};

describe('promote: checagem de rebasing contra a staging remota', () => {
  let r, clone, sh;

  beforeEach(() => { r = repoDescartavel(); clone = r.clone; sh = r.sh; });
  afterEach(() => { rmSync(r.tmp, { recursive: true, force: true }); });

  const comTrabalho = (branch, msg) => {
    sh(`git checkout -q -b ${branch}`, clone);
    sh(`git commit -q --allow-empty -m "${msg}"`, clone);
    sh(`git push -q -u origin ${branch}`, clone);
  };

  it('deixa passar quando a branch parte da ponta da staging', () => {
    comTrabalho('feat-a', 'feat: meu trabalho');
    assert.equal(bloqueia(clone, 'feat-a'), false);
  });

  it('bloqueia quando outro agente promoveu algo que a branch não viu', () => {
    comTrabalho('feat-a', 'feat: meu trabalho');
    // o outro agente promove na staging por cima do nosso trabalho
    sh('git checkout -q -b outro', clone);
    sh('git commit -q --allow-empty -m "outro: promote"', clone);
    sh('git merge -q --no-ff feat-a -m "merge: feat-a"', clone);
    sh('git push -q origin outro:staging', clone);
    sh('git checkout -q feat-a', clone);
    assert.equal(bloqueia(clone, 'feat-a'), true);
  });

  it('libera depois do rebase', () => {
    comTrabalho('feat-a', 'feat: meu trabalho');
    sh('git checkout -q -b outro', clone);
    sh('git commit -q --allow-empty -m "outro: promote"', clone);
    sh('git push -q origin outro:staging', clone);
    sh('git checkout -q feat-a', clone);
    assert.equal(bloqueia(clone, 'feat-a'), true);
    sh('git fetch -q origin', clone);
    sh('git rebase -q origin/staging', clone);
    assert.equal(bloqueia(clone, 'feat-a'), false);
  });

  it('não bloqueia quando só a branch ganhou commits', () => {
    comTrabalho('feat-a', 'feat: meu trabalho');
    assert.equal(bloqueia(clone, 'feat-a'), false);
    sh('git commit -q --allow-empty -m "feat: mais trabalho"', clone);
    assert.equal(bloqueia(clone, 'feat-a'), false);
  });

  it('a checagem no promote.mjs usa a staging REMOTA, não a local', () => {
    // A worktree principal fica na `staging` alguns commits atrás da remota
    // (outro agente acabou de promover). Comparar com a local acusaria uma
    // defasagem inexistente e bloquearia um trabalho bom — foi o primeiro
    // bug desta implementação.
    const src = readFileSync('scripts/promote.mjs', 'utf8');
    assert.match(src, /git merge-base \$\{ORIGIN\}\/\$\{TARGET\}/,
      'a checagem precisa comparar contra origin/staging');
    assert.doesNotMatch(src, /git merge-base \$\{TARGET\}/,
      'comparar com a staging LOCAL é o bug');
  });
});
