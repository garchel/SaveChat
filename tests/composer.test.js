const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('fs');

// O composer.js (1.180 linhas) foi fatiado em 4 mixins: o próprio (binding,
// anexos, envio), áudio, markdown e listas. Como todos entram no mesmo UI
// plano via Object.assign, um método perdido ou duplicado NÃO quebra o
// bundle — quebra em runtime, silenciosamente. Estes testes travam a
// superfície pública da divisão.
const MODULOS = [
  'public/js/ui/composer.js',
  'public/js/ui/composer-audio.js',
  'public/js/ui/composer-markdown.js',
  'public/js/ui/composer-lists.js',
];

// métodos que o composer precisa ter depois do split (contrato do app)
const CONTRATO = [
  // binding, anexos e envio
  'bindComposer', 'sendNote', 'renderAttachPreview', 'showSyncError', 'hideSyncError',
  // áudio
  '_updateSendAudioState', '_uploadAudio', '_audioSender', '_startAudioRecording', '_sendVoiceNote',
  // markdown
  '_editorText', '_serialize', '_mdToFrag', '_looksLikeMarkdown', 'applyFormat',
  '_updateFmtToggleUI', '_ensureSelection', '_caretEnd', '_exec',
  // listas
  '_caretList', '_listContinuation', '_splitListItem', '_checklistContinuation',
  '_caretItem', '_rebuildEditorFromMarkdown', '_listIndent', '_listOutdent',
];

describe('composer modularizado', () => {
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

  it('todo módulo está no precache do SW (composer quebra offline sem eles)', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    for (const m of MODULOS) {
      const rel = './' + m.replace('public/', '');
      assert.ok(sw.includes(`'${rel}'`), `${rel} ausente do precache do SW`);
    }
  });

  it('todo módulo é coberto pelo npm run check', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const check = pkg.scripts.check;
    for (const m of MODULOS) {
      assert.ok(check.includes(`node --check ${m}`), `${m} não passa por node --check`);
    }
  });

  it('os imports dos módulos resolvem para arquivos que existem', () => {
    // o bug do split: gerar '../../store.js' num arquivo em js/ui/ aponta
    // para public/store.js (404) e derruba o módulo inteiro em runtime
    const path = require('path');
    for (const m of MODULOS) {
      const src = readFileSync(m, 'utf8');
      for (const x of src.matchAll(/from '(\.[^']+)'/g)) {
        const alvo = path.resolve(path.dirname(m), x[1]);
        assert.ok(existsSync(alvo), `${m}: import quebrado -> ${x[1]}`);
      }
    }
  });
});
