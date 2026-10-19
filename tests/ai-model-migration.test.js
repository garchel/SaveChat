// Migração do modelo de IA salvo.
//
// Até a v1.21.2 o padrão era `gemini-2.5-flash`, gravado em `ui.aiModel`
// (bucket da conta). A família 2.5 não atende mais chaves novas: sem a
// migração, todo mundo que já tinha usado a IA receberia 404 do Google.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

describe('migração do modelo de IA', () => {
  it('quem tinha gemini-2.5 salvo volta para o padrão', async () => {
    global.localStorage = fakeLocalStorage();
    localStorage.setItem('notethread.v2::u::anon', JSON.stringify({ scope: { aiModel: 'gemini-2.5-flash' } }));

    const { Store } = await import('../public/js/store.js');
    Store.load();

    assert.notEqual(Store.data.ui.aiModel, 'gemini-2.5-flash');
    assert.ok(!/^gemini-2\.5/.test(Store.data.ui.aiModel), 'modelo aposentado não pode sobrar');
    const bucket = JSON.parse(localStorage.getItem('notethread.v2::u::anon'));
    assert.equal(bucket.scope.aiModel, '', 'a migração é persistida no bucket');
  });
});
