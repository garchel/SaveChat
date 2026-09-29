const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('fs');
const path = require('path');

// messages.js (1.092 linhas) foi fatiado em 5 mixins. Como todos entram no
// mesmo UI plano via Object.assign, um método perdido não quebra o bundle —
// quebra em runtime, quando alguém clica. Estes testes travam o contrato.
const MODULOS = [
  'public/js/ui/messages.js',
  'public/js/ui/messages-bubble.js',
  'public/js/ui/messages-reactions.js',
  'public/js/ui/messages-edit.js',
  'public/js/ui/messages-scroll.js',
];

// a superfície pública que o resto do app chama
const CONTRATO = [
  // fluxo da conversa
  'openThread', 'renderMessages', 'setChatActiveUi', 'renderBacklinks',
  'toggleBacklinksPopover', '_bindChatTitleMenu', 'applyThreadHeaderColor',
  '_readableTextColor', 'dedupeBubblesDom', '_bindEmptyCta',
  // bolha
  'bubbleEl', 'daySepEl', 'toggleNoteCheckbox', '_checkListComplete',
  'openLightbox', '_applyCozyEmptyCopy',
  // reações e popover
  'toggleReaction', '_quickReactions', '_bumpReactionUse', '_reactionsHtml',
  'bindMsgPopover', '_syncReactionButtons', '_showRpView',
  '_openReactionPicker', '_clampMsgPopover', 'openMsgPopover',
  // edição
  'editNoteInline', 'confirmDeleteNote', 'copyNote', 'editTags',
  'togglePin', 'bindPinButton', 'updatePinButton', 'togglePinPopover',
  'showNotePreview', 'closeNotePreview', 'bindPinPopover', '_replaceBubble',
  // scroll
  'setupInfiniteScroll', '_showLoadSkeleton', '_hideLoadSkeleton',
];

describe('messages modularizado', () => {
  const metodos = {};
  for (const m of MODULOS) {
    if (!existsSync(m)) { it(`modulo ${m} existe`, () => assert.fail(m + ' não encontrado')); continue; }
    const src = readFileSync(m, 'utf8');
    metodos[m] = Array.from(src.matchAll(/^ {4}(?:async )?([A-Za-z_$][\w$]*)\(/gm)).map((x) => x[1]);
  }

  it('cada módulo exporta um objeto de métodos', () => {
    for (const m of MODULOS) {
      const src = readFileSync(m, 'utf8');
      assert.match(src, /export const \w+Methods = \{/, `${m} não exporta um objeto de métodos`);
    }
  });

  it('nenhum método do contrato sumiu no split', () => {
    const todos = Object.values(metodos).flat();
    const faltando = CONTRATO.filter((n) => !todos.includes(n));
    assert.deepEqual(faltando, [], `métodos perdidos: ${faltando.join(', ')}`);
  });

  it('nenhum método está duplicado entre os módulos', () => {
    const todos = Object.values(metodos).flat();
    const dups = [...new Set(todos.filter((n) => todos.filter((x) => x === n).length > 1))];
    assert.deepEqual(dups, [], `métodos duplicados: ${dups.join(', ')}`);
  });

  it('todo módulo está ligado no Object.assign do app.js', () => {
    const app = readFileSync('public/app.js', 'utf8');
    for (const m of MODULOS) {
      const nome = readFileSync(m, 'utf8').match(/export const (\w+Methods)/)[1];
      assert.ok(app.includes(`import { ${nome} }`), `app.js não importa ${nome}`);
      assert.ok(app.includes(nome), `app.js não passa ${nome} no Object.assign`);
    }
  });

  it('todo módulo está no precache do SW', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    for (const m of MODULOS) {
      const rel = './' + m.replace('public/', '');
      assert.ok(sw.includes(`'${rel}'`), `${rel} ausente do precache do SW`);
    }
  });

  it('todo módulo é coberto pelo npm run check', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const m of MODULOS) {
      assert.ok(pkg.scripts.check.includes(`node --check ${m}`), `${m} não passa por node --check`);
    }
  });

  it('os imports resolvem e nenhum símbolo usado ficou de fora', () => {
    // dois bugs reais do split, cobertos aqui:
    //  a) caminho relativo errado (o módulo inteiro dá 404 e o app não boota)
    //  b) símbolo usado sem import ($ não casa em \b, então era detectado tarde
    const UTILS = ['uid', 'now', 'fmtTime', 'haptic', 'esc', 'hideWithExit', 'PAGE_SIZE'];
    for (const m of MODULOS) {
      const src = readFileSync(m, 'utf8');
      for (const x of src.matchAll(/from '(\.[^']+)'/g)) {
        const alvo = path.resolve(path.dirname(m), x[1]);
        assert.ok(existsSync(alvo), `${m}: import quebrado -> ${x[1]}`);
      }
      // símbolos usados no corpo que não foram importados
      for (const sym of UTILS) {
        const usa = sym === '$'
          ? /(?<![\w$])\$\s*\(/.test(src)
          : new RegExp('(?<![\\w$.])' + sym + '\\s*\\(').test(src);
        if (!usa) continue;
        const importado = new RegExp('import \\{[^}]*\\b' + sym + '\\b[^}]*\\}').test(src);
        assert.ok(importado, `${m}: usa ${sym}() mas não importa`);
      }
    }
  });
});
