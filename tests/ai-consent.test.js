// Consentimento da IA por conversa (Fase 1).
//
// Decisão de produto: a IA só lê uma conversa depois de consentimento
// explícito. O padrão é NADA liberado — sem marcação, o contexto enviado é
// vazio (e o modelo avisa que não pode ler), nunca "todas as conversas".
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

async function setup() {
  global.localStorage = fakeLocalStorage();
  global.document = { getElementById: () => null };
  const { WorkspaceAiMethods } = await import('../public/js/ui/workspace-ai.js');
  const { Store } = await import('../public/js/store.js');
  Store._uid = 'u1';
  Store.cipher = null;
  Store.locked = false;
  Store._encrypted = false;
  Store.data = {
    user: { id: 'u1', mail: 'a@example.com', provider: 'supabase' },
    threads: {
      t1: { id: 't1', name: 'Compras', created: 2, aiShared: true },
      t2: { id: 't2', name: 'Segredos <pessoais>', created: 1 },
    },
    notes: {
      t1: [{ clientId: 'c1', threadId: 't1', text: 'comprar leite' }],
      t2: [{ clientId: 'c2', threadId: 't2', text: 'senha do banco' }],
    },
    folders: {},
    ui: { expanded: {} },
  };
  return { WorkspaceAiMethods, Store };
}

test('a IA só recebe o conteúdo das conversas liberadas', async () => {
  const { WorkspaceAiMethods, Store } = await setup();
  const ctx = WorkspaceAiMethods._buildAiContext();

  assert.match(ctx, /Compras/);
  assert.match(ctx, /comprar leite/);
  assert.ok(!ctx.includes('senha do banco'), 'conversa não liberada vazou para a IA');
  assert.ok(!ctx.includes('Segredos'), 'nome de conversa não liberada vazou');
  assert.equal(Store.data.threads.t1.aiShared, true);
});

test('sem nenhuma conversa liberada o contexto fica vazio e o modelo é avisado', async () => {
  const { WorkspaceAiMethods, Store } = await setup();
  Store.data.threads.t1.aiShared = false;

  assert.equal(WorkspaceAiMethods._buildAiContext(), '');
  const parts = WorkspaceAiMethods._aiSystemInstruction();
  const text = parts.parts[0].text;
  assert.match(text, /Nenhuma conversa foi liberada/);
  assert.ok(!text.includes('comprar leite'));
});

test('alternar o consentimento vale na hora e sobrevive ao save', async () => {
  const { WorkspaceAiMethods, Store } = await setup();

  WorkspaceAiMethods.toggleAiConsent('t2', true);
  assert.equal(Store.data.threads.t2.aiShared, true);
  assert.match(WorkspaceAiMethods._buildAiContext(), /senha do banco/);

  WorkspaceAiMethods.toggleAiConsent('t1', false);
  assert.equal(Store.data.threads.t1.aiShared, false);
  assert.ok(!WorkspaceAiMethods._buildAiContext().includes('comprar leite'));

  // a decisão é LOCAL: fica no bucket da conta, fora do sync
  const bucket = JSON.parse(localStorage.getItem('notethread.v2::u::u1'));
  assert.equal(bucket.threads.t2.aiShared, true);
  assert.equal(bucket.threads.t1.aiShared, false);
});

test('a lista de privacidade mostra as conversas e o padrão desmarcado', async () => {
  const { WorkspaceAiMethods } = await setup();
  const box = { innerHTML: '', classList: { remove() {}, add() {} } };
  const realDocument = global.document;
  global.document = { getElementById: (id) => (id === 'ai-consent' ? box : null) };
  try {
    WorkspaceAiMethods.renderAiConsent();
  } finally {
    global.document = realDocument;
  }

  assert.match(box.innerHTML, /1 de 2 conversas liberadas/);
  assert.match(box.innerHTML, /data-ai-consent="t1" checked/);
  assert.match(box.innerHTML, /data-ai-consent="t2"/);
  assert.ok(!/data-ai-consent="t2" checked/.test(box.innerHTML));
  // nome com HTML é escapado (a lista é montada por innerHTML)
  assert.match(box.innerHTML, /Segredos &lt;pessoais&gt;/);
  assert.ok(!box.innerHTML.includes('<pessoais>'));
  assert.match(box.innerHTML, /Só lê as conversas marcadas|A IA só lê as conversas marcadas/);
});
