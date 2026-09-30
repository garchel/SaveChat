import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../public/js/store.js';

// A paginação de notas é a base do infinite scroll. Estes casos fixam o
// contrato de `pageNotes` — corte `>=` com cursor na PRIMEIRA nota da página —
// e a ordem das correções que consertaram o travamento.
//
// O sintoma que motivou: com 60 notas, só 50 apareciam, e o botão
// "Carregar mensagens anteriores…" ficava visível sem efeito.
const seed = (n) => {
  Store.data = { user: null, threads: { t1: { id: 't1', name: 'C' } }, folders: {},
    notes: { t1: Array.from({ length: n }, (_, i) => ({
      clientId: 'n' + i, threadId: 't1', text: 'm' + i, ts: 1000 - (n - i),
    })) }, ui: {} };
};
const paginarTudo = (count) => {
  const vistos = [];
  let key = null;
  for (let i = 0; i < 20; i++) {
    const p = Store.pageNotes('t1', key, count);
    for (const n of p.items) if (!vistos.includes(n.clientId)) vistos.push(n.clientId);
    key = p.cursor;
    if (!p.hasMore) break;
  }
  return vistos;
};

describe('pageNotes: paginação sem repetir e sem pular', () => {
  beforeEach(() => seed(60));

  it('a primeira página são as 25 mais recentes, com hasMore verdadeiro', () => {
    const p = Store.pageNotes('t1', null, 25);
    assert.equal(p.items.length, 25);
    assert.equal(p.items[0].clientId, 'n35');
    assert.equal(p.hasMore, true);
  });

  it('o cursor é a chave da PRIMEIRA nota da página', () => {
    // o corte da próxima chamada é `>=`: com o cursor na primeira nota, o
    // findIndex cai exatamente no início da página seguinte
    const p = Store.pageNotes('t1', null, 25);
    assert.equal(p.cursor, p.items[0].ts);
  });

  it('percorre todas as 60 notas exatamente uma vez', () => {
    assert.equal(paginarTudo(25).length, 60);
  });

  it('cada página avança, sem devolver a anterior de novo', () => {
    const p1 = Store.pageNotes('t1', null, 25);
    const p2 = Store.pageNotes('t1', p1.cursor, 25);
    assert.equal(p2.items[0].clientId, 'n10');
    assert.equal(p2.hasMore, true);
    const p3 = Store.pageNotes('t1', p2.cursor, 25);
    // a última página é parcial e não há nada antes dela
    assert.equal(p3.items.length, 10);
    assert.equal(p3.hasMore, false);
    assert.equal(p3.items[0].clientId, 'n0');
  });

  it('conversa curta: página única, hasMore falso, mas COM itens', () => {
    // este é o contrato que o infinite scroll consome: `items.length` é o
    // que diz que há o que entregar. `hasMore` responde "existe algo antes
    // desta página", que é outra pergunta.
    seed(5);
    const p = Store.pageNotes('t1', null, 25);
    assert.equal(p.items.length, 5);
    assert.equal(p.hasMore, false);
  });

  it('o guard antigo (hasMore) descartava a última página — a regressão', () => {
    // 60 notas: a 3ª página devolve 10 itens com hasMore false. Um
    // `if (hasMore)` no lugar de `if (items.length)` joga essas 10 fora e a
    // conversa para em 50.
    const p1 = Store.pageNotes('t1', null, 25);
    const p2 = Store.pageNotes('t1', p1.cursor, 25);
    const p3 = Store.pageNotes('t1', p2.cursor, 25);
    assert.equal(p3.items.length, 10);
    assert.equal(p3.hasMore, false);
    // a soma das três páginas é a conversa inteira
    assert.equal(p1.items.length + p2.items.length + p3.items.length, 60);
  });

  it('funciona com sortOrder (após arrastar para reordenar)', () => {
    const notas = Store.notesFor('t1');
    notas.forEach((n, i) => { n.sortOrder = notas.length - 1 - i; });
    const p = Store.pageNotes('t1', null, 25);
    assert.equal(p.items.length, 25);
    const ids = paginarTudo(25);
    assert.equal(ids.length, 60);
  });
});
