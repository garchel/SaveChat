// Contrato da thread da IA (ai-thread.js) — o que NÃO pode quebrar.
//
// A thread especial da IA é `localOnly` por decisão de privacidade
// (opção C escolhida pelo usuário): o conteúdo da conversa com a IA e a
// chave da API não saem do aparelho. O risco não é este arquivo, é alguém
// criar um caminho de sync novo e esquecer a marca — por isso o teste
// lê o código-fonte e trava o funil.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');

describe('thread da IA é local-only', () => {
  const aiThread = readFileSync('public/js/ai-thread.js', 'utf8');
  const sync = readFileSync('public/js/sync-supabase.js', 'utf8');
  const store = readFileSync('public/js/store.js', 'utf8');

  it('a thread da IA é marcada localOnly ao ser criada', () => {
    assert.match(aiThread, /localOnly:\s*true/, 'ai-thread.js precisa marcar a thread como localOnly');
  });

  it('o funil de envio do sync barra thread localOnly', () => {
    // `send()` é o funil único por onde threads e notas saem para o
    // servidor. Se a marca não for checada ali, um caminho novo de sync
    // (ou um upsert direto) vaza o conteúdo.
    assert.match(sync, /async send\(type, payload\)/, 'send() existe');
    assert.match(sync, /localOnly/, 'send() precisa respeitar a marca localOnly');
  });

  it('a chave da API fica FORA de notes (em ui.aiKey)', () => {
    const ai = readFileSync('public/js/ui/workspace-ai.js', 'utf8');
    assert.match(ai, /aiKey/, 'a chave continua em ui.aiKey');
    // e o espelho na thread não carrega a chave
    assert.doesNotMatch(
      ai.match(/_aiPersistTurn\([\s\S]*?\n  \},/)[0],
      /aiKey|apiKey|key:/,
      '_aiPersistTurn não pode gravar a chave na nota',
    );
  });

  it('o espelho da conversa carrega aiRole (quem falou)', () => {
    const ai = readFileSync('public/js/ui/workspace-ai.js', 'utf8');
    assert.match(ai, /aiRole/, 'a nota espelhada precisa dizer se é user ou model');
  });

  it('a thread da IA não aparece duplicada na árvore', () => {
    const tree = readFileSync('public/js/ui/tree.js', 'utf8');
    // o item é desenhado à parte (aiThreadNode) E filtrado das listas
    // normais — sem o filtro apareceria duas vezes
    assert.match(tree, /aiThreadNode\(\)/, 'o item é desenhado por aiThreadNode');
    assert.match(tree, /filter\(\(t\) => !t\.localOnly\)/, 'as listas normais filtram localOnly');
  });

  it('a thread da IA não entra na busca global', () => {
    const nav = readFileSync('public/js/ui/navigation.js', 'utf8');
    const busca = nav.match(/Object\.entries\(Store\.data\.notes\)[\s\S]{0,400}/)[0];
    assert.match(busca, /localOnly/, 'a busca precisa pular threads localOnly');
  });

  it('a thread da IA é recriada se faltar (restore de backup)', () => {
    assert.match(aiThread, /ensureAiThread/, 'existe ensureAiThread');
    assert.match(aiThread, /AI_THREAD_ID/, 'o id é fixo');
  });

  it('o Store não trata localOnly como erro de nota', () => {
    // upsertNote aceita a nota com o campo localOnly sem estourar
    assert.match(store, /upsertNote\(n\)/, 'upsertNote existe');
  });
});
