// Function calling do assistente: a IA devolve o plano, mas NADA é executado
// até o usuário clicar em Confirmar. A execução é local — não existe uma
// segunda chamada ao Gemini para "confirmar" a ação.
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
  };
  global.document = { getElementById: (id) => els[id] || null };

  const prevData = Store.data;
  const prevSave = Store.save;
  Store.data = {
    user: { mail: 'tester@example.com' }, threads: {}, folders: {}, notes: {},
    ui: { aiChat: [], aiKey: 'chave-teste', aiModel: 'gemini-3.6-flash' },
  };
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
  ctx._aiUpdatePersistedTurn = () => {};
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
  it('propõe a ação e só executa depois da confirmação, sem 2ª chamada', async () => {
    const { ctx, Store, calls, created, toasts } = await setup(() => firstResponse);

    await ctx.sendAiMessage();

    assert.equal(calls.length, 1, 'a IA identifica uma vez; a execução não chama a IA');
    assert.equal(created.length, 0, 'nada pode ser criado antes do Confirmar');
    const history = Store.data.ui.aiChat;
    assert.equal(history.length, 2);
    const msg = history[1];
    assert.equal(msg.role, 'model');
    assert.equal(msg.pending.status, 'pending');
    assert.match(msg.text, /Você confirma que quer criar uma nota em “Compras”\?/);
    assert.equal(msg.actions.length, 0, 'o chip de resultado só aparece depois de executar');
    assert.equal(toasts.length, 0);

    ctx.resolveAiPending(msg.id, 'confirm');

    assert.equal(created.length, 1, 'a nota é criada uma única vez, no Confirmar');
    assert.equal(calls.length, 1, 'confirmar não faz outra chamada ao Gemini');
    assert.equal(msg.pending.status, 'done');
    assert.match(msg.text, /Nota criada em/);
    assert.deepEqual(msg.actions, ['📝 Nota criada em “Compras”']);
  });

  it('Cancelar descarta o plano sem executar nada', async () => {
    const { ctx, Store, calls, created } = await setup(() => firstResponse);

    await ctx.sendAiMessage();
    const msg = Store.data.ui.aiChat[1];
    ctx.resolveAiPending(msg.id, 'cancel');

    assert.equal(created.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(msg.pending.status, 'cancelled');
    assert.equal(msg.text, 'Ação cancelada.');
    assert.deepEqual(msg.actions, []);
  });

  it('edita a nota e marca/desmarca checkboxes no Store local', async () => {
    const { ctx, Store } = await setup(() => firstResponse);
    Store.data.threads = { t1: { id: 't1', name: 'Compras' } };
    Store.data.notes = { t1: [{ clientId: 'c1', threadId: 't1', text: 'Lista\n[ ] Leite\n[ ] Pão' }] };

    const edited = ctx._execEditNote({
      conversa: 'Compras',
      notaId: '[nota:c1]',
      novoTexto: 'Lista\n[ ] Leite\n[x] Pão',
    });
    assert.equal(edited.ok, true);
    assert.equal(Store.data.notes.t1[0].text, 'Lista\n[ ] Leite\n[x] Pão');

    const checked = ctx._execToggleCheckbox({ conversa: 'Compras', notaId: 'c1', item: 'Leite', marcado: true });
    assert.equal(checked.ok, true);
    assert.match(Store.data.notes.t1[0].text, /\[x\] Leite/);

    const unchecked = ctx._execToggleCheckbox({ conversa: 'Compras', notaId: 'c1', item: 'Pão', marcado: false });
    assert.equal(unchecked.ok, true);
    assert.match(Store.data.notes.t1[0].text, /\[ \] Pão/);
  });

  it('falha de execução não some com a pergunta e aparece no resultado', async () => {
    const { ctx, Store } = await setup(() => firstResponse);
    ctx._execCreateNote = () => ({ ok: false, erro: 'Conversa sumiu' });

    await ctx.sendAiMessage();
    const history = Store.data.ui.aiChat;
    const msg = history[1];
    ctx.resolveAiPending(msg.id, 'confirm');

    assert.equal(history.length, 2, 'a pergunta do usuário não pode ser descartada');
    assert.equal(msg.pending.status, 'done');
    assert.match(msg.text, /⚠️ Conversa sumiu/);
    assert.equal(msg.actions.length, 1);
  });

  it('sem função e sem texto, o erro continua desfazendo o turno', async () => {
    const { ctx, Store, toasts } = await setup(() => ({ candidates: [{ content: { parts: [] } }] }));

    await ctx.sendAiMessage();

    assert.equal(Store.data.ui.aiChat.length, 0, 'nada foi executado: o turno pode sair');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].opts.kind, 'error');
  });
});
