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

// Regressão do flicker da conversa aberta: o wallpaper (`.chat::before`)
// ficava com `z-index: auto` e competia na ordem do DOM com o compositor
// (z:5) e o banner (sem z). O sintoma era o padrão piscar sobre a área de
// mensagens a cada re-render. A correção fecha a pilha de planos no `.chat`.
describe('Pilha de planos da conversa', () => {
  const css = readFileSync('public/styles/03b-chat-bolhas.css', 'utf8');
  const regraPlanos = css.slice(css.indexOf('PILHA DE PLANOS DA CONVERSA'));
  const wallpaper = (css.match(/\.chat::before\s*\{([^}]*)\}/) || [, ''])[1];

  it('o wallpaper fica no plano 0 e não intercepta clique', () => {
    assert.match(wallpaper, /z-index:\s*0/, 'o wallpaper precisa de z-index: 0 explícito');
    assert.match(wallpaper, /pointer-events:\s*none/, 'o wallpaper não pode interceptar clique');
  });

  it('.chat é contexto de empilhamento próprio (isolation: isolate)', () => {
    // sem isso os filhos escapam do contexto e a ordem do DOM volta a decidir
    assert.match(css, /\.chat\s*\{[^}]*isolation:\s*isolate/, '.chat precisa de isolation: isolate');
  });

  it('nome, botão de fixar, campo de entrada e mensagens dividem o MESMO plano', () => {
    // Os quatro precisam de z-index IDÊNTICO. Se divergirem, a ordem do DOM
    // (ou um @import posterior) volta a decidir quem fica na frente.
    // A busca ancoreia no ÚLTIMO bloco: a regra do compositor (mais acima no
    // arquivo) também declara z-index e seria capturada antes.
    const bloco = (regraPlanos.match(/([^{}]+)\{([^}]*z-index[^}]*)\}/g) || []).pop() || '';
    for (const sel of ['.chat-header', '.composer.cozy-composer', '#btn-pin', '#messages']) {
      assert.ok(bloco.includes(sel), `faltou ${sel} na regra de plano único`);
    }
    const z = (bloco.match(/z-index:\s*([^;]+)/) || [])[1];
    assert.equal(z, '1', 'os quatro precisam do mesmo z-index (1)');
  });

  it('a regra de plano vem DEPOIS da regra do compositor (cascata por ordem)', () => {
    // A regra do compositor (linha ~38) também declara z-index e tem
    // especificidade 0-2-0. Se a regra de plano único subir no arquivo, ela
    // perde. Este teste é o guard contra alguém reorganizar o arquivo.
    const iCompositor = css.indexOf('.composer.cozy-composer {');
    const iPlanos = css.indexOf('PILHA DE PLANOS DA CONVERSA');
    assert.ok(iCompositor > 0 && iPlanos > iCompositor,
      'a regra de plano único precisa ficar depois da regra do compositor no arquivo');
  });

  it('o z-index do btn-pin só existe na regra de plano (nada de conflito)', () => {
    // Antes: `.btn-pin { z-index: 20 }` no 03b e `.btn-pin { z-index: 5 }` no
    // 18-boot-splash. Os DOIS eram código morto (o #btn-pin da regra de plano
    // vencia por especificidade 0-1-0 vs 0-1-0, import posterior), mas deixavam
    // dois valores concorrentes autorais. O plano único é a única fonte.
    const arquivos = ['public/styles/03b-chat-bolhas.css', 'public/styles/18-boot-splash.css'];
    for (const f of arquivos) {
      const texto = readFileSync(f, 'utf8');
      const semComentario = texto.replace(/\/\*[\s\S]*?\*\//g, '');
      const decl = semComentario.match(/\.btn-pin\s*\{[^}]*z-index/g);
      assert.equal(decl, null, `${f} voltou a declarar z-index no .btn-pin — só a regra de plano pode`);
    }
    // e a regra de plano realmente fixa o btn-pin
    assert.match(regraPlanos, /#btn-pin/, 'a regra de plano precisa incluir #btn-pin');
  });

  it('o selo friendly-names fica acima do compositor, não sobre ele', () => {
    // Era `bottom: 16px` com z-9999: o compositor ocupa os 16px de cada lado
    // e ~160px de altura, então o selo cobria o campo de entrada. Medido no
    // browser: 196px deixa o selo acima da faixa e da barra de formatação.
    const ft = readFileSync('public/styles/05-ui-ux-v6.css', 'utf8')
      .match(/\.friendly-toggle\s*\{([^}]*)\}/)[1];
    const bottom = parseInt((ft.match(/bottom:\s*(\d+)px/) || [])[1], 10);
    assert.ok(bottom >= 190, `bottom do selo muito baixo (${bottom}px) — volta a cobrir o compositor`);
  });
});

