// O nome sequencial das worktrees (--as <prefixo> → hermes1, hermes2, …),
// provado num repositório descartável. Ver scripts/wt.mjs.
import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `os.tmpdir()` e nao `process.env.TEMP || process.env.TMPDIR`: no Linux do CI
// TMPDIR nao existe e o path.join recebia undefined, derrubando o arquivo
// inteiro no import (6 suites vermelhas). TMPDIR e so uma das variaveis que o
// Node consulta; tmpdir() ja sabe qual usar em cada plataforma.
const WT = path.join(os.tmpdir(), `wt-seq-${process.pid}`);

const sh = (c, cwd = WT) => execSync(c, { encoding: 'utf8', shell: true, cwd }).trim();

function repoNovo() {
  rmSync(WT, { recursive: true, force: true });
  mkdirSync(WT, { recursive: true });
  const repo = path.join(WT, 'repo');
  sh('git init --bare -q -b staging origin.git');
  sh(`git clone -q "${path.join(WT, 'origin.git')}" repo`);
  sh('git config user.email t@t.t && git config user.name t', repo);
  sh('git commit -q --allow-empty -m base', repo);
  mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  copyFileSync('scripts/wt.mjs', path.join(repo, 'scripts', 'wt.mjs'));
  // o .gitignore é commitado ANTES: `ensureWorktreesIgnored` commita o
  // próprio, e num repo novo ele seria a única pendência — o wt.mjs se
  // recusaria a segunda criação por "árvore suja".
  writeFileSync(path.join(repo, '.gitignore'), '.worktrees/\n');
  sh('git add -A && git commit -q -m "chore: ignore"', repo);
  sh('git push -q -u origin staging', repo);
  return repo;
}

const dirs = (repo) => {
  try { return readdirSync(path.join(repo, '.worktrees')).sort(); } catch { return []; }
};
const run = (repo, args) => {
  try { return sh(`node scripts/wt.mjs ${args}`, repo); }
  catch (e) { return 'ERRO: ' + String(e.stderr || e.message).trim().slice(0, 120); }
};
const wtNew = (repo, ...a) => run(repo, ['new', ...a].join(' '));
const wtRemove = (repo, n) => run(repo, `remove ${n}`);

describe('wt.mjs: nome sequencial por prefixo (--as)', () => {
  let repo;
  beforeEach(() => { repo = repoNovo(); });

  it('numera em sequência a partir de 1, sem pular nem repetir', () => {
    wtNew(repo, 'fix/a', '--as', 'hermes');
    wtNew(repo, 'fix/b', '--as', 'hermes');
    wtNew(repo, 'fix/c', '--as', 'hermes');
    assert.deepEqual(dirs(repo).filter(d => /^hermes\d$/.test(d)), ['hermes1', 'hermes2', 'hermes3']);
  });

  it('prefixos diferentes não colidem entre si', () => {
    wtNew(repo, 'fix/a', '--as', 'hermes');
    wtNew(repo, 'fix/b', '--as', 'maia');
    const d = dirs(repo);
    assert.ok(d.includes('hermes1') && d.includes('maia1'),
      `esperava hermes1 e maia1, veio ${JSON.stringify(d)}`);
  });

  it('sem --as mantém o diretório como slug da branch', () => {
    // o comportamento antigo não pode quebrar: worktrees que já existem pelo
    // nome da branch continuam válidas
    wtNew(repo, 'fix/sem-flag');
    assert.ok(dirs(repo).includes('sem-flag'));
  });

  it('remove aceita o nome sequencial do diretório', () => {
    wtNew(repo, 'fix/a', '--as', 'hermes');
    wtNew(repo, 'fix/b', '--as', 'hermes');
    const r = wtRemove(repo, 'hermes2');
    assert.ok(!r.startsWith('ERRO'), `remove falhou: ${r}`);
    assert.ok(!dirs(repo).includes('hermes2'));
    // e as outras ficam intactas — remover uma não pode derrubar as vizinhas
    assert.ok(dirs(repo).includes('hermes1'));
  });

  it('remove ainda aceita o slug da branch', () => {
    wtNew(repo, 'fix/a', '--as', 'hermes');
    wtNew(repo, 'fix/sem-flag');
    const r = wtRemove(repo, 'fix/sem-flag');
    assert.ok(!r.startsWith('ERRO'), `remove pela branch falhou: ${r}`);
    assert.ok(!dirs(repo).includes('sem-flag'));
  });

  it('reusa o menor número livre, sem colidir com nenhuma worktree viva', () => {
    // o invariante que importa: nunca dois agentes com o mesmo número. Um
    // buraco na sequência é inofensivo; uma colisão sobrescreve o trabalho
    // de outro agente.
    wtNew(repo, 'fix/a', '--as', 'hermes');
    wtNew(repo, 'fix/b', '--as', 'hermes');
    wtNew(repo, 'fix/c', '--as', 'hermes');
    wtRemove(repo, 'hermes3');
    wtNew(repo, 'fix/d', '--as', 'hermes');
    const d = dirs(repo).filter(x => /^hermes\d$/.test(x));
    assert.equal(d.length, 3, `esperava 3 worktrees, veio ${JSON.stringify(d)}`);
    assert.equal(new Set(d.map(x => x.replace(/\D/g, ''))).size, d.length,
      `número repetido entre ${JSON.stringify(d)} — dois agentes no mesmo diretório`);
  });

  it('list marca o número do agente na saída', () => {
    wtNew(repo, 'fix/a', '--as', 'hermes');
    const out = sh('node scripts/wt.mjs list', repo);
    assert.match(out, /hermes#1/, 'list precisa mostrar hermes#N para o usuário escanear');
  });
});
