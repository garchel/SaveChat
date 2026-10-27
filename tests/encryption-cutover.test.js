// Corte da Fase 1 (1c): o servidor passa a REJEITAR texto claro.
//
// O risco que este teste cobre é o modo de falha: um cliente antigo recebe o
// erro do trigger em cada gravação e, se tratá-lo como falha de rede, fica
// reenfileirando para sempre — sem nunca avisar o usuário de que precisa
// atualizar. O erro de corte tem que ser terminal e visível.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

test('supabase.sql cria o app_config e os triggers de corte (desligados)', () => {
  const sql = read('supabase.sql');

  assert.match(sql, /create table if not exists app_config/);
  assert.match(sql, /encryption_enforced boolean not null default false/,
    'o corte não pode nascer ligado: ligaria antes do backfill existir');
  assert.match(sql, /insert into app_config \(id\) values \(true\) on conflict \(id\) do nothing/);
  // leitura pública (o cliente precisa saber que o corte existe), escrita não
  assert.match(sql, /create policy "config read" on app_config for select using \(true\)/);
  assert.ok(!/create policy[^;]*on app_config for (insert|update|all)/i.test(sql));

  assert.match(sql, /create or replace function public\.notethread_reject_plaintext\(\)/);
  assert.match(sql, /new\.text is not null/);
  assert.match(sql, /new\.last_preview, ''\) <> ''/);
  assert.match(sql, /errcode = 'P0001'/);
  assert.match(sql, /create trigger notes_no_plaintext\s+before insert or update on notes/);
  assert.match(sql, /create trigger threads_no_plaintext\s+before insert or update on threads/);
  assert.match(sql, /revoke execute on function public\.notethread_reject_plaintext\(\) from anon, authenticated, public/);
  // instruções de ativação/rollback documentadas
  assert.match(sql, /update app_config set encryption_enforced = true/);
  assert.match(sql, /update app_config set encryption_enforced = false/);
});

test('erro de corte não é reenfileirado e avisa para atualizar', async () => {
  const { SupaSync } = await import('../public/js/sync-supabase.js');
  const { Store } = await import('../public/js/store.js');

  const shown = [];
  const toasts = [];
  const realWindow = global.window;
  global.window = { NoteThread: { UI: {
    showEncryptionUpdate: (m) => shown.push(m),
    toast: (m, o) => toasts.push([m, o]),
  } } };

  const realSupa = SupaSync.supa;
  const realSend = SupaSync._doSend;
  const realEnqueue = SupaSync._enqueue;
  const realData = Store.data;
  let enqueued = 0;
  try {
    SupaSync.supa = {};
    SupaSync._uidCache = 'u1';
    SupaSync._warnedFail = false;
    Store.data = { user: { id: 'u1' }, threads: {}, notes: {}, folders: {}, ui: {} };
    SupaSync._enqueue = async () => { enqueued++; };

    SupaSync._doSend = async () => {
      throw Object.assign(new Error('notethread: plaintext rejected (encryption enforced)'), { code: 'P0001' });
    };
    await SupaSync.send('note:upsert', { clientId: 'c1', threadId: 't1' });
    assert.equal(enqueued, 0, 'erro de corte não pode voltar para a fila (retry infinito)');
    assert.equal(shown.length, 1, 'usuário precisa ser avisado para atualizar');
    assert.match(shown[0], /atualizar|Atualize|notas cifradas/);

    // falha "normal" (rede) continua indo para a fila
    SupaSync._doSend = async () => { throw new Error('network down'); };
    await SupaSync.send('note:upsert', { clientId: 'c2', threadId: 't1' });
    assert.equal(enqueued, 1);
    assert.equal(toasts.length, 1);
  } finally {
    SupaSync.supa = realSupa;
    SupaSync._doSend = realSend;
    SupaSync._enqueue = realEnqueue;
    Store.data = realData;
    global.window = realWindow;
  }
});

test('flushQueue mantém o item intacto quando o servidor cortou o texto claro', async () => {
  const { SupaSync } = await import('../public/js/sync-supabase.js');
  const { OfflineQueue } = await import('../public/js/offline-queue.js');

  const shown = [];
  const realWindow = global.window;
  global.window = { NoteThread: { UI: { showEncryptionUpdate: (m) => shown.push(m), toast() {} } } };

  const realSupa = SupaSync.supa;
  const realSend = SupaSync._doSend;
  const realGetAll = OfflineQueue.getAll;
  const realRemove = OfflineQueue.remove;
  const realBump = OfflineQueue.bump;
  let removes = 0;
  let bumps = 0;
  try {
    SupaSync.supa = {};
    SupaSync._uidCache = 'u1';
    SupaSync._doSend = async () => {
      throw Object.assign(new Error('notethread: plaintext rejected (encryption enforced)'), { code: 'P0001' });
    };
    OfflineQueue.getAll = async () => ([
      { id: 1, type: 'note:upsert', ts: 1, tries: 0, nextRetry: 0, owner: 'u1', payload: { clientId: 'c1' } },
    ]);
    OfflineQueue.remove = async () => { removes++; };
    OfflineQueue.bump = async () => { bumps++; };

    await SupaSync.flushQueue();
    assert.equal(removes, 0, 'item não pode ser descartado');
    assert.equal(bumps, 0, 'item não pode ser reagendado: nunca vai passar enquanto o app for antigo');
    assert.equal(shown.length, 1);
  } finally {
    SupaSync.supa = realSupa;
    SupaSync._doSend = realSend;
    OfflineQueue.getAll = realGetAll;
    OfflineQueue.remove = realRemove;
    OfflineQueue.bump = realBump;
    global.window = realWindow;
  }
});

test('versão mínima: compara e mostra o modal de "Atualize o app"', async () => {
  const { PrivacyMethods, compareVersions } = await import('../public/js/ui/privacy.js');
  const { SupaSync } = await import('../public/js/sync-supabase.js');

  assert.equal(compareVersions('1.26.1', '1.27.0'), -1);
  assert.equal(compareVersions('1.27.0', '1.27.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.26.1', '1.26'), 1);

  const modals = [];
  const ui = Object.assign({}, PrivacyMethods, {
    _cryptoUpdateShown: false,
    showModal: (title, body, onOk) => modals.push({ title, body, onOk }),
  });
  ui.showEncryptionUpdate('versão antiga');
  assert.equal(modals.length, 1);
  assert.equal(modals[0].title, 'Atualize o app');
  assert.match(modals[0].body, /versão antiga/);
  ui.showEncryptionUpdate('de novo');
  assert.equal(modals.length, 1, 'o aviso não pode empilhar modais');

  const realWindow = global.window;
  const realSupa = SupaSync.supa;
  const cfg = { data: { encryption_enforced: true, min_client_version: '1.27.0' }, error: null };
  try {
    global.window = { APP_VERSION: '1.26.1' };
    SupaSync.supa = { from: () => ({ select: () => ({ maybeSingle: async () => cfg }) }) };

    const old = Object.assign({}, PrivacyMethods, { _cryptoUpdateShown: false, showModal: (t) => modals.push({ title: t }) });
    assert.equal(await old.checkEncryptionCutover(), true);
    assert.equal(modals[modals.length - 1].title, 'Atualize o app');

    // versão nova: o corte existe, mas este cliente sabe gravar cifrado
    global.window = { APP_VERSION: '1.27.0' };
    const novo = Object.assign({}, PrivacyMethods, { _cryptoUpdateShown: false, showModal: () => modals.push({ title: 'não deveria abrir' }) });
    assert.equal(await novo.checkEncryptionCutover(), false);

    // banco ainda sem a migração (erro de coluna) não pode bloquear o app
    SupaSync.supa = { from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42P01' } }) }) }) };
    assert.equal(await novo.checkEncryptionCutover(), false);
  } finally {
    SupaSync.supa = realSupa;
    global.window = realWindow;
  }
});
