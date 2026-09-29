const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');
const path = require('path');

// Este é o caso concreto do bug que a validação do dist pegou: SEND_SVG e
// MIC_SVG estavam declaradas no topo do composer.js MONOLÍTICO e foram usadas
// em composer-audio.js depois do split em mixins. A referência ficou órfã —
// ReferenceError em runtime, só DEPOIS de gravar um áudio, nunca no boot e
// nunca no `node --check`. A suíte e2e passava limpa com o bug presente.
describe('glifos do botão único de áudio', () => {
  const src = readFileSync('public/js/ui/composer-audio.js', 'utf8');

  it('SEND_SVG e MIC_SVG estão declaradas onde são usadas', () => {
    assert.match(src, /^const SEND_SVG = /m, 'SEND_SVG não declarada em composer-audio.js');
    assert.match(src, /^const MIC_SVG = /m, 'MIC_SVG não declarada em composer-audio.js');
  });

  it('o botão volta para o ícone de enviar depois de gravar', () => {
    // a linha que quebrava com SEND_SVG is not defined
    assert.match(src, /send\.innerHTML = SEND_SVG;/,
      'composer-audio.js precisa restaurar o SEND_SVG ao parar a gravação');
  });

  it('os glifos são os mesmos que a IA e a conversa desenham', () => {
    // conversa e IA usam o MESMO botão (btn-send / ai-send) e as mesmas
    // classes cozy. As constantes existem nos dois arquivos porque cada um
    // tem o seu _updateSendAudioState (a conversa em composer-audio.js, a IA
    // em workspace-ai.js) — e precisam ser byte a byte iguais, senão os dois
    // botões desenham ícones diferentes. Este teste trava a IGUALDADE, não o
    // caminho: o arquivo da IA mudou de nome quando o workspace foi fatiado.
    const mic = src.match(/const MIC_SVG = '([^']+)'/)[1];
    const send = src.match(/const SEND_SVG = '([^']+)'/)[1];
    const ia = readFileSync('public/js/ui/workspace-ai.js', 'utf8');
    assert.ok(ia.includes(mic), 'o microfone da IA difere do da conversa');
    assert.ok(ia.includes(send), 'o ícone de enviar da IA difere do da conversa');
  });
});

// O teste de "declara tudo que usa" acima já cobre a classe do bug; aqui fica o
// guard genérico para qualquer mixin novo.
describe('nenhum arquivo mixin usa constante de outro mixin', () => {
  const MIXINS = [
    'public/js/ui/composer.js', 'public/js/ui/composer-audio.js',
    'public/js/ui/composer-markdown.js', 'public/js/ui/composer-lists.js',
    'public/js/ui/messages.js', 'public/js/ui/messages-bubble.js',
    'public/js/ui/messages-reactions.js', 'public/js/ui/messages-edit.js',
    'public/js/ui/messages-scroll.js',
    'public/js/ui/workspace.js', 'public/js/ui/workspace-ai.js',
    'public/js/ui/workspace-daily.js',
  ];

  it('cada SCREAMING_SNAKE_CASE usado existe no mesmo arquivo', () => {
    const problemas = [];
    for (const file of MIXINS) {
      const src = readFileSync(file, 'utf8');
      const codigo = src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/`(?:\\.|[^`\\])*`/g, '``');

      const visiveis = new Set();
      // qualquer indentação: uma constante pode viver dentro de um método
      for (const m of codigo.matchAll(
        /(?:^|[{;(\s])(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
        visiveis.add(m[1]);
      }
      for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
        m[1].split(',').forEach((s) => {
          const n = s.trim().split(/\s+as\s+/).pop().trim();
          if (n) visiveis.add(n);
        });
      }

      for (const m of codigo.matchAll(/(?<![.\w$])[A-Z][A-Z0-9_]{3,}(?![A-Za-z0-9_$])/g)) {
        // REACTIONS: { ... } é uma CHAVE de objeto, não uma referência
        if (codigo[m.index + m[0].length] === ':') continue;
        if (!visiveis.has(m[0]) && !['JSON', 'PAGE_SIZE'].includes(m[0])) {
          problemas.push(`${path.basename(file)}: ${m[0]}`);
        }
      }
    }
    assert.deepEqual(problemas, [],
      'constantes usadas sem existir no próprio módulo (seria ReferenceError em runtime): ' +
      problemas.join(', '));
  });
});
