import test from 'node:test';
import assert from 'node:assert/strict';
import { conflitoDeEdicao } from '../public/js/ui/sync-merge.js';

const nota = (text, editedAt) => ({ clientId: 'c1', text, editedAt });

test('edição local mais nova vence a versão antiga do servidor', () => {
  assert.equal(conflitoDeEdicao(nota('editado offline', 2000), nota('original', 1000)), true);
});

test('servidor mais novo vence (outro aparelho editou depois)', () => {
  assert.equal(conflitoDeEdicao(nota('antigo', 1000), nota('novo de outro device', 2000)), false);
});

test('empate de relógio deixa o servidor vencer (convergência)', () => {
  assert.equal(conflitoDeEdicao(nota('A', 1000), nota('B', 1000)), false);
});

test('textos iguais nunca são conflito', () => {
  assert.equal(conflitoDeEdicao(nota('mesma', 2000), nota('mesma', 1000)), false);
});

test('sem carimbo de edição não julga: servidor vence', () => {
  assert.equal(conflitoDeEdicao({ text: 'x' }, nota('y', 1000)), false);
  assert.equal(conflitoDeEdicao(nota('x', 1000), { text: 'y' }), false);
});

test('nota nova (não existe local) não é conflito', () => {
  assert.equal(conflitoDeEdicao(undefined, nota('y', 1000)), false);
});

test('pacote sem texto (só reação/tag) não é conflito', () => {
  assert.equal(conflitoDeEdicao(nota('A', 2000), { clientId: 'c1', reactions: { '❤': ['u'] } }), false);
});
