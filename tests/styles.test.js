const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

// O CSS foi fatiado em public/styles/*.css e styles.css virou índice de
// @import. Estes testes existem para a refatoração não poder voltar atrás sem
// quebrar nada, já que a CASCATA depende da ordem (várias regras deste projeto
// vencem por ordem de declaração, não por especificidade).
describe('CSS modularizado', () => {
  const index = readFileSync('public/styles.css', 'utf8');

  it('styles.css é um índice só de @import (nenhuma regra solta)', () => {
    const semImports = index.replace(/@import url\("[^"]+"\);?/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    assert.equal(semImports, '', 'styles.css não deveria ter regras fora dos @import');
  });

  it('todo @import aponta para um arquivo que existe', () => {
    const parts = Array.from(index.matchAll(/@import url\("([^"]+)"\);?/g)).map((m) => m[1]);
    assert.ok(parts.length > 0, 'nenhum @import no índice');
    for (const p of parts) {
      const full = join('public', p);
      assert.ok(existsSync(full), `@import aponta para arquivo inexistente: ${p}`);
    }
  });

  it('nenhum arquivo de estilo ficou de fora do precache do SW', () => {
    // sem isso o app abre offline sem CSS nenhum (a página fica crua)
    const sw = readFileSync('public/sw.js', 'utf8');
    const onDisk = readdirSync('public/styles').filter((f) => f.endsWith('.css'));
    for (const f of onDisk) {
      assert.ok(sw.includes(`'./styles/${f}'`), `styles/${f} ausente do precache do SW`);
    }
  });

  it('a ordem dos @import preserva a ordem do arquivo original', () => {
    // O guard contra reordenar: os blocos temáticos guardam o marcador ==== do
    // monolito, e esses marcadores precisam seguir a ordem original.
    const parts = Array.from(index.matchAll(/@import url\("styles\/([^"]+)"\);?/g)).map((m) => m[1]);
        // o marcador ==== pode ocupar DUAS linhas (nome longo + nota explicativa
        // depois dos sinais), então casa na forma multilinha também
        const ordem = parts.map((f) => {
      const src = readFileSync(join('public', 'styles', f), 'utf8');
      // nome da seção: o que está entre o primeiro e o segundo bloco de sinais ====
      const m = src.match(/={5,}\s*(.+?)\s*={5,}/);
      return m ? m[1].replace(/\(\s*$/, '').trim() : null;
    }).filter(Boolean);

    // a ordem original do monólito, pelos marcadores que ele tinha
    const esperado = [
      'TEMAS', 'AUTH', 'APP LAYOUT — COZY 3 COLS', 'RESPONSIVE', 'MEJORAS UI/UX v6',
      'MARKDOWN NAS NOTAS', 'MENÇÕES @', 'LIGHTBOX DE IMAGENS', 'ORDENAÇÃO (settings)',
      'BARRA DE FORMATAÇÃO DO COMPOSER', 'TÍTULO DA CONVERSA EDITÁVEL', 'DRAG & DROP DE THREADS',
      'BOTÃO DE PERIGO (modal de exclusão)', 'ANIMAÇÕES (≤0.25s)', 'FASE 3 — DELIGHT (MOTION_DESIGN.md)',
      'EXPLORER: Novo + Lupa · painel de busca · seletor de páginas', 'BOOT SPLASH (primeira carga / PWA)',
    ];
    for (const sec of esperado) {
      const idx = ordem.indexOf(sec);
      assert.ok(idx >= 0, `seção "${sec}" não encontrada entre os arquivos de estilo`);
    }
    // a ordem relativa entre as seções continua a original
    const indices = esperado.map((s) => ordem.indexOf(s));
    const ordenados = [...indices].sort((a, b) => a - b);
    assert.deepEqual(indices, ordenados, 'as seções foram reordenadas — a cascata pode ter mudado');
  });

  it('o build achata os @import (produção não paga 19 requests)', () => {
    const build = readFileSync('scripts/build.mjs', 'utf8');
    assert.match(build, /resolveImports/, 'build.mjs precisa resolver os @import antes de minificar');
  });

  it('o build não copia partials/ nem styles/ para o dist', () => {
    // as duas pastas são a FONTE do que o build achata. No dist não existe
    // @import nem marcador #include, então ninguém referencia esses arquivos:
    // copiar as duas somava ~195KB de lixo no deploy.
    const build = readFileSync('scripts/build.mjs', 'utf8');
    assert.match(build, /partials/,
      'build.mjs precisa pular a pasta partials/');
    assert.match(build, /styles/,
      'build.mjs precisa pular a pasta styles/');
    // e o pulo precisa acontecer ANTES do copyFile, não depois
    const skip = build.indexOf("rel.startsWith('partials'");
    const copia = build.indexOf('copyFileSync(file, dest)');
    assert.ok(skip > 0 && skip < copia,
      'o pulo de partials/ e styles/ precisa vir antes da cópia do arquivo');
  });
});
