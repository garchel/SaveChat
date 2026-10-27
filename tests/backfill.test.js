// Backfill da Fase 1: cifrar o que ainda está em claro no servidor.
//
// O risco desta etapa não é o caminho feliz (cifrar e sair): é rodar de novo
// depois de uma queda — sem duplicar, sem sobrescrever edição concorrente e sem
// entrar em laço infinito quando a linha muda entre o SELECT e o UPDATE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDek } from '../public/js/crypto.js';
import { decryptNoteText, decryptThreadPreview } from '../public/js/note-crypto.js';
import { Backfill } from '../public/js/backfill.js';

const UID = 'u1';

// Supabase fake mínimo: encadeamento + thenable. `hooks.beforeUpdate` permite
// simular uma edição que chega entre a leitura e a gravação (CAS falha).
function fakeSupa(state) {
  return {
    from(table) {
      const q = {
        table,
        filters: [],
        head: false,
        countMode: null,
        limitN: 0,
        updateData: null,
        orderSpec: null,
        select(_cols, opts) {
          if (opts && opts.count) { this.countMode = opts.count; this.head = !!opts.head; }
          return this;
        },
        eq(col, val) { this.filters.push([col, val]); return this; },
        neq(col, val) { this.filters.push([col, val, 'neq']); return this; },
        not(col, _op, val) { this.filters.push([col, val, 'not']); return this; },
        order(col) { this.orderSpec = col; return this; },
        limit(n) { this.limitN = n; return this; },
        update(data) { this.updateData = data; return this; },
        then(resolve, reject) { return this._run().then(resolve, reject); },
        async _run() {
          let rows = (state[table] || []).filter((r) => this.filters.every(([col, val, kind]) => {
            if (kind === 'neq') return r[col] !== val;
            if (kind === 'not') return r[col] !== val && r[col] !== undefined;
            return r[col] === val;
          }));
          if (this.updateData) {
            if (state.hooks && state.hooks.beforeUpdate) state.hooks.beforeUpdate(table, rows);
            // o CAS (`.eq('text', valor antigo)`) é reavaliado DEPOIS do hook
            rows = rows.filter((r) => this.filters.every(([col, val, kind]) => {
              if (kind === 'neq') return r[col] !== val;
              if (kind === 'not') return r[col] !== val && r[col] !== undefined;
              return r[col] === val;
            }));
            const updated = rows.map((r) => Object.assign({}, r, this.updateData));
            rows.forEach((r, i) => Object.assign(r, updated[i]));
            return { data: updated, error: null };
          }
          if (this.countMode === 'exact' && this.head) return { count: rows.length, error: null };
          if (this.orderSpec) rows = rows.slice().sort((a, b) => (a[this.orderSpec] || 0) - (b[this.orderSpec] || 0));
          if (this.limitN) rows = rows.slice(0, this.limitN);
          return { data: rows.map((r) => Object.assign({}, r)), error: null };
        },
      };
      return q;
    },
  };
}

function seed() {
  return {
    notes: [
      { client_id: 'n1', thread_id: 't1', user_id: UID, ts: 1, text: 'primeira nota' },
      { client_id: 'n2', thread_id: 't1', user_id: UID, ts: 2, text: 'segunda nota' },
      { client_id: 'n3', thread_id: 't2', user_id: UID, ts: 3, text: 'terceira nota' },
      { client_id: 'n4', thread_id: 't2', user_id: UID, ts: 4, text: null, text_enc: { v: 1, iv: 'x', ct: 'y' } },
      { client_id: 'n9', thread_id: 't1', user_id: 'outro', ts: 5, text: 'de outra conta' },
    ],
    threads: [
      { id: 't1', user_id: UID, last_preview: 'primeira nota' },
      { id: 't2', user_id: UID, last_preview: '' },
      { id: 't9', user_id: 'outro', last_preview: 'de outra conta' },
    ],
  };
}

test('cifra notas e prévias em claro, sem tocar no que já estava cifrado', async () => {
  const state = seed();
  const supa = fakeSupa(state);
  const dek = await generateDek();
  const progress = [];

  const result = await Backfill.run(supa, UID, { dek, onProgress: (p) => progress.push(p) });

  assert.equal(result.done, 4, '3 notas + 1 prévia');
  assert.equal(result.total, 4);
  assert.equal(Backfill.running, false);

  for (const n of state.notes.filter((x) => x.client_id !== 'n4')) {
    if (n.user_id !== UID) continue;
    assert.equal(n.text, null, `nota ${n.client_id} ainda tem texto claro`);
    assert.equal(n.enc_version, 1);
    const plain = await decryptNoteText(n, dek, UID);
    assert.ok(plain.length > 0);
  }
  assert.equal(state.notes.find((n) => n.client_id === 'n9').text, 'de outra conta');

  const t1 = state.threads.find((t) => t.id === 't1');
  assert.equal(t1.last_preview, '');
  assert.equal(await decryptThreadPreview(t1, dek, UID), 'primeira nota');
  assert.equal(state.threads.find((t) => t.id === 't9').last_preview, 'de outra conta');

  assert.equal(progress[progress.length - 1].phase, 'done');
  assert.equal(progress.some((p) => p.done > 0), true);
});

test('interrompido no meio, a próxima execução termina o trabalho', async () => {
  const state = seed();
  const supa = fakeSupa(state);
  const dek = await generateDek();

  const first = await Backfill.run(supa, UID, {
    dek,
    batchSize: 2,
    shouldStop: () => state.notes.filter((n) => n.user_id === UID && n.text != null).length < 3,
  });
  assert.equal(first.stopped, true);
  const restantes = state.notes.filter((n) => n.user_id === UID && n.text != null).length;
  assert.ok(restantes > 0, 'nada foi cifrado antes de parar');

  const second = await Backfill.run(supa, UID, { dek });
  assert.equal(second.stopped, undefined);
  assert.equal(state.notes.filter((n) => n.user_id === UID && n.text != null).length, 0);
  assert.equal(state.threads.filter((t) => t.user_id === UID && t.last_preview).length, 0);
});

test('edição concorrente (CAS falha) não sobrescreve nem entra em laço', async () => {
  const state = seed();
  const supa = fakeSupa(state);
  const dek = await generateDek();
  let edited = false;
  state.hooks = {
    beforeUpdate(table, rows) {
      if (table !== 'notes' || edited) return;
      const alvo = rows.find((r) => r.client_id === 'n1');
      if (!alvo) return;
      alvo.text = 'primeira nota (editada agora)';
      edited = true;
    },
  };

  const first = await Backfill.run(supa, UID, { dek });
  const n1 = state.notes.find((n) => n.client_id === 'n1');
  assert.equal(n1.text, 'primeira nota (editada agora)', 'a versão nova foi sobrescrita pela antiga');
  assert.equal(first.done, 3);

  // a próxima rodada cifra a versão editada
  const second = await Backfill.run(supa, UID, { dek });
  assert.equal(second.done, 1);
  assert.equal(n1.text, null);
  assert.equal(await decryptNoteText(n1, dek, UID), 'primeira nota (editada agora)');
});

test('sem a DEK em memória o backfill não roda', async () => {
  const state = seed();
  const supa = fakeSupa(state);
  const result = await Backfill.run(supa, UID);
  assert.equal(result.skipped, true);
  assert.equal(state.notes.find((n) => n.client_id === 'n1').text, 'primeira nota');
});
