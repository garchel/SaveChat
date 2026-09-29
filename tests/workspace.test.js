const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('fs');
const path = require('path');

// workspace.js (797 linhas) foi fatiado em 3 mixins: navegação entre páginas,
// a página da IA e a Diária. Como todos entram no mesmo UI plano via
// Object.assign, um método perdido não quebraria o bundle — quebraria em
// runtime, quando alguém abre a página.
const MODULOS = [
  'public/js/ui/workspace.js',
  'public/js/ui/workspace-ai.js',
  'public/js/ui/workspace-daily.js',
];

const CONTRATO = {
  'public/js/ui/workspace.js': [
    'bindWorkspace', 'showWorkspaceTab', '_bindWorkspaceSwipe', 'workspaceSwipe',
  ],
  'public/js/ui/workspace-ai.js': [
    'prepareAiPage', 'renderAiMessages', '_buildAiContext', '_aiSystemInstruction',
    'sendAiMessage', '_aiFetch', '_execCreateNote', '_updateAiSendAudioState',
    '_growAiPrompt', '_toggleAiRecording', '_finishAiRecording',
    '_transcribeAudio', '_setRecUI', '_setRecStatus',
  ],
  'public/js/ui/workspace-daily.js': [
    '_daily', '_dailyLog', 'addDailyItem', 'openDailyTaskModal',
    'toggleDailyItem', 'deleteDailyItem', 'renderDailyPage',
    'checkDailyNotifications',
  ],
};

describe('workspace modularizado', () => {
  const metodos = {};
  for (const m of MODULOS) {
    if (!existsSync(m)) { it(`modulo ${m} existe`, () => assert.fail(m + ' não encontrado')); continue; }
    const src = readFileSync(m, 'utf8');
    metodos[m] = Array.from(src.matchAll(/^ {2}(?:async )?([A-Za-z_$][\w$]*)\(/gm)).map((x) => x[1]);
  }

  it('cada módulo exporta um objeto de métodos', () => {
    for (const m of MODULOS) {
      assert.match(readFileSync(m, 'utf8'), /export const \w+Methods = \{/,
        `${m} não exporta um objeto de métodos`);
    }
  });

  it('nenhum método do contrato sumiu no split', () => {
    for (const [file, esperados] of Object.entries(CONTRATO)) {
      const tem = metodos[file] || [];
      const faltando = esperados.filter((n) => !tem.includes(n));
      assert.deepEqual(faltando, [],
        `${path.basename(file)}: ${faltando.join(', ')}`);
    }
  });

  it('nenhum método está duplicado entre os módulos', () => {
    const todos = Object.values(metodos).flat();
    const dups = [...new Set(todos.filter((n) => todos.filter((x) => x === n).length > 1))];
    assert.deepEqual(dups, [], `métodos duplicados: ${dups.join(', ')}`);
  });

  it('cada método está no arquivo certo (nenhum migrou de grupo)', () => {
    // os contratos acima já garantem presença; aqui garante que nada foi para
    // o arquivo vizinho por engano (o que faria o teste anterior passar)
    for (const [file, esperados] of Object.entries(CONTRATO)) {
      const outros = Object.entries(CONTRATO).filter(([f]) => f !== file)
        .flatMap(([, m]) => m);
      const forasteiros = (metodos[file] || []).filter((n) => outros.includes(n));
      assert.deepEqual(forasteiros, [],
        `${path.basename(file)} tem método de outro grupo: ${forasteiros.join(', ')}`);
    }
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

  it('os imports resolvem para arquivos que existem', () => {
    for (const m of MODULOS) {
      const src = readFileSync(m, 'utf8');
      for (const x of src.matchAll(/from '(\.[^']+)'/g)) {
        const alvo = path.resolve(path.dirname(m), x[1]);
        assert.ok(existsSync(alvo), `${m}: import quebrado -> ${x[1]}`);
      }
    }
  });

  it('cada módulo declara as constantes que usa', () => {
    // a mesma classe do bug do SEND_SVG: constante de módulo vivia no
    // monólito e ficou órfã no arquivo filho. Aqui: todayKey, normName,
    // DEFAULT_MODEL, TABS, TAB_LABEL, MIC_SVG, SEND_SVG.
    for (const m of MODULOS) {
      const src = readFileSync(m, 'utf8');
      const codigo = src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/`(?:\\.|[^`\\])*`/g, '``');
      const visiveis = new Set();
      for (const x of codigo.matchAll(
        /(?:^|[{;(\s])(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
        visiveis.add(x[1]);
      }
      for (const x of src.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
        x[1].split(',').forEach((s) => {
          const n = s.trim().split(/\s+as\s+/).pop().trim();
          if (n) visiveis.add(n);
        });
      }
      for (const x of codigo.matchAll(/(?<![.\w$])[A-Z][A-Z0-9_]{3,}(?![A-Za-z0-9_$])/g)) {
        if (codigo[x.index + x[0].length] === ':') continue;
        // globais do JS resolvidos pelo runtime
        if (['JSON', 'PAGE_SIZE'].includes(x[0])) continue;
        if (!visiveis.has(x[0])) {
          assert.fail(`${path.basename(m)} usa ${x[0]} sem declarar nem importar`);
        }
      }
    }
  });
});
