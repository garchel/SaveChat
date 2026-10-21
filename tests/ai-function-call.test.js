// Function calling do assistente: o Gemini 3 devolve o functionCall com um
// `thoughtSignature`; a 2ª chamada TEM de devolver a part como veio. Remontar
// só `{ functionCall }` fazia a confirmação falhar com "missing
// thought_signature" DEPOIS de criar a nota. Estes testes travam o contrato e
// o tratamento de falha da confirmação (a nota já foi criada).
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const realDocument = global.document;
let restore = [];

const firstResponse = {
  candidates: [{ content: { parts: [
    {
      functionCall: { name: 'criar_nota', args: { conversa: 'Compras', texto: 'Leite' } },
      thoughtSignature: 'sig-abc',
    },
  ] } }],
};

async function setup(fetchImpl) {
  const { WorkspaceAiMethods } = await import('../public/js/ui/workspace-ai.js');
  const { Store } = await import('../public/js/store.js');
  const els = {
    'ai-prompt': { value: 'crie uma nota na conversa Compras com Leite', disabled: false, focus() {} },
    'ai-send': { disabled: false },
    'ai-key': { value: 'chave-teste', focus() {} },
    'ai-model': { value: 'gemini-3.6-flash' },
  };
  global.document = { getElementById: (id) => els[id] || null };

  const prevData = Store.data;
  const prevSave = Store.save;
  Store.data = { user: { mail: 'tester@example.com' }, threads: {}, folders: {}, notes: {}, ui: { aiChat: [] } };
  Store.save = () => {};

  const calls = [];
  const created = [];
  const toasts = [];
  const ctx = Object.create(WorkspaceAiMethods);
  ctx._aiFetch = async (model, key, body) => {
    calls.push(body);
    return fetchImpl(calls.length);
  };
  ctx._execCreateNote = ({ conversa }) => { created.push(conversa); return { ok: true, conversa }; };
  ctx._aiPersistTurn = () => {};
  ctx.renderAiMessages = () => {};
  ctx._growAiPrompt = () => {};
  ctx.toast = (message, opts) => toasts.push({ message, opts });

  restore.push(() => {
    Store.data = prevData;
    Store.save = prevSave;
    if (realDocument === undefined) delete global.document; else global.document = realDocument;
  });
  return { ctx, Store, calls, created, toasts };
}

afterEach(() => {
  while (restore.length) restore.pop()();
});
beforeEach(() => { restore = []; });

describe('function calling do assistente', () => {
  it('devolve o thoughtSignature do functionCall na 2ª chamada', async () => {
    const { ctx, Store, calls, created, toasts } = await setup((n) => n === 1
      ? firstResponse
      : { candidates: [{ content: { parts: [{ text: 'Nota criada!' }] } }] });

    await ctx.sendAiMessage();

    assert.equal(calls.length, 2);
    const modelTurn = calls[1].contents.find((c) => c.role === 'model' && c.parts.some((p) => p.functionCall));
    assert.ok(modelTurn, 'a 2ª chamada precisa mandar o turno do functionCall');
    const callPart = modelTurn.parts.find((p) => p.functionCall);
    assert.equal(callPart.thoughtSignature, 'sig-abc', 'a assinatura não pode ser descartada');
    assert.equal(callPart.functionCall.name, 'criar_nota');

    const responseTurn = calls[1].contents.find((c) => c.role === 'user' && c.parts.some((p) => p.functionResponse));
    assert.ok(responseTurn, 'a 2ª chamada precisa mandar o functionResponse');
    assert.equal(responseTurn.parts[0].functionResponse.response.ok, true);

    assert.equal(created.length, 1, 'a nota é criada uma única vez');
    assert.equal(Store.data.ui.aiChat.length, 2);
    assert.equal(Store.data.ui.aiChat[1].text, 'Nota criada!');
    assert.match(Store.data.ui.aiChat[1].actions[0], /Nota criada em/);
    assert.equal(toasts.length, 0, 'caminho feliz não mostra erro');
  });

  it('se a confirmação falhar, preserva a nota e a pergunta do usuário', async () => {
    const { ctx, Store, calls, created, toasts } = await setup((n) => {
      if (n === 1) return firstResponse;
      throw new Error('Function call is missing a thought_signature in functionCall parts');
    });

    await ctx.sendAiMessage();

    assert.equal(calls.length, 2);
    assert.equal(created.length, 1);
    const history = Store.data.ui.aiChat;
    assert.equal(history.length, 2, 'a pergunta do usuário não pode ser descartada');
    assert.equal(history[0].role, 'user');
    assert.equal(history[1].role, 'model');
    assert.match(history[1].text, /Nota criada em/);
    assert.match(history[1].actions[0], /Nota criada em/);
    assert.equal(toasts.length, 0, 'a falha da confirmação não vira erro visível');
  });

  it('sem função e sem texto, o erro continua desfazendo o turno', async () => {
    const { ctx, Store, toasts } = await setup(() => ({ candidates: [{ content: { parts: [] } }] }));

    await ctx.sendAiMessage();

    assert.equal(Store.data.ui.aiChat.length, 0, 'nada foi executado: o turno pode sair');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].opts.kind, 'error');
  });
});
