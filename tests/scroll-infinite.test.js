// pageNotes + o handler de scroll infinito.
//
// A regressão que estes testes travam: o app passava `this.oldestTs` (um ts em
// ms) para pageNotes, mas a ordenação é por sortOrder. Com sortOrder presente
// (toda nota criada pelo app tem), o findIndex comparava sortOrder (0,1,2…)
// contra um timestamp e devolvia sempre a MESMA página, com hasMore:true para
// sempre — o "Carregando mensagens…" acendia, não trazia nada, e o scroll
// voltava para o topo a cada rolagem.
//
// O teste antigo em store.test.js NÃO pegava isso porque REIMPLEMENTAVA a
// lógica e passava `items[0].sortOrder` — a assinatura que o app nunca usou.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');

// A implementação real (fonte única de verdade). Import dinâmico: este
// arquivo é CommonJS e store.js é ES module.
let Store = null;
before(async () => { ({ Store } = await import('../public/js/store.js')); });

const PAGINA = 25;
const T0 = 1_700_000_000_000;

function semear(n) {
  Store.data = { threads: { t1: { id: 't1', name: 'C' } }, folders: {}, notes: {}, ui: {} };
  Store.data.notes = {
    t1: Array.from({ length: n }, (_, i) => ({
      clientId: 'c' + i, threadId: 't1', text: 'nota ' + i,
      ts: T0 - (n - i) * 60000, sortOrder: i,
    })),
  };
  return Store;
}

// O ciclo real do app: abre a conversa e rola para o topo até o local acabar.
function ciclo(vezes) {
  semear(80);
  const p = Store.pageNotes('t1', null, PAGINA);
  let key = p.cursor;               // âncora LOCAL
  const out = [{ etapa: 'reset', items: p.items.length, hasMore: p.hasMore, key }];
  for (let i = 0; i < vezes; i++) {
    const local = Store.pageNotes('t1', key, PAGINA);
    if (!local.hasMore) { out.push({ etapa: 'scroll' + i, servidor: true }); break; }
    key = local.cursor;
    out.push({ etapa: 'scroll' + i, items: local.items.length, key });
  }
  return out;
}

describe('paginação por scroll infinito', () => {
  it('avança de página a cada rolagem: a âncora muda sempre', () => {
    semear(80);
    const primeira = Store.pageNotes('t1', null, PAGINA);
    let key = primeira.cursor;
    const vistos = new Set([key]);
    // 80 notas / 25 = 3 páginas cheias + sobra de 5: a 4ª rolagem esgota o
    // local, então as 3 primeiras têm de avançar e a última cair no servidor.
    for (let i = 0; i < 3; i++) {
      const local = Store.pageNotes('t1', key, PAGINA);
      assert.notEqual(local.cursor, key, `página ${i} devolveu a MESMA âncora (${key}) — o scroll está preso`);
      vistos.add(local.cursor);
      key = local.cursor;
    }
    assert.equal(vistos.size, 4, 'esperava 4 âncoras distintas em 80 notas');
    assert.equal(Store.pageNotes('t1', key, PAGINA).hasMore, false, 'a 4ª página deveria esgotar o local');
  });

  it('esvazia o local e chega ao servidor', () => {
    const out = ciclo(8);
    assert.ok(out.some(h => h.servidor), `nunca chegou ao servidor: ${JSON.stringify(out)}`);
  });

  it('nenhuma página repete notas já entregues', () => {
    semear(80);
    const primeira = Store.pageNotes('t1', null, PAGINA);
    let key = primeira.cursor;
    const vistos = new Set(primeira.items.map(n => n.clientId));
    for (let i = 0; i < 3; i++) {
      const local = Store.pageNotes('t1', key, PAGINA);
      if (!local.hasMore) break;
      const repetidas = local.items.filter(n => vistos.has(n.clientId));
      assert.deepEqual(repetidas.map(n => n.clientId), [], `página ${i} repetiu notas`);
      local.items.forEach(n => vistos.add(n.clientId));
      key = local.cursor;
    }
    assert.ok(vistos.size > PAGINA, 'o total de notas entregues não cresceu');
  });

  it('a âncora do servidor (ts) e a local (sortOrder) são valores distintos', () => {
    semear(80);
    const p = Store.pageNotes('t1', null, PAGINA);
    assert.equal(p.oldestTs, p.items[0].ts, 'oldestTs deve ser o ts da nota mais antiga');
    assert.equal(p.cursor, p.items[0].sortOrder, 'cursor deve ser a chave de ordenação');
    assert.notEqual(p.cursor, p.oldestTs, 'misturar as duas âncoras é o que travava o scroll');
  });

  it('o app usa cursor/oldestKey e nunca mais o ts cru como âncora local', () => {
    const scroll = readFileSync('public/js/ui/messages-scroll.js', 'utf8');
    const render = readFileSync('public/js/ui/messages.js', 'utf8');
    assert.doesNotMatch(
      scroll + render,
      /this\.oldestTs\s*=\s*items\[0\]\.ts\b/,
      'a âncora local voltou a ser o ts — o scroll trava'
    );
    assert.match(scroll, /this\.oldestKey/, 'messages-scroll.js precisa da âncora local (oldestKey)');
    // sem sessão não há o que buscar: acender o indicador seria mentira
    assert.match(scroll, /if \(!Sync\.supa\) return;/, 'o fetch deve sair quando não há sessão');
  });

  it('a âncora do scroll só é reaplicada quando a altura mudou de verdade', () => {
    // Sem esta guarda, `scrollHeight - prevHeight` dá 0 e o código reescreve
    // o scrollTop com o valor que o usuário tinha acabado de escolher: o
    // "puxa de volta para o topo" do segundo bug.
    const scroll = readFileSync('public/js/ui/messages-scroll.js', 'utf8');
    const escritas = scroll.match(/box\.scrollTop\s*=\s*box\.scrollHeight\s*-\s*prevHeight\s*\+\s*prevTop;/g) || [];
    const guardadas = scroll.match(/if \(box\.scrollHeight !== prevHeight\) \{/g) || [];
    assert.equal(escritas.length, guardadas.length,
      `toda âncora precisa da guarda de scrollHeight (${escritas.length} escritas, ${guardadas.length} guardadas)`);
  });

  it('o indicador só acende quando a resposta DEMORA (senão é o piscar)', () => {
    // Primeiro bug: o "Carregando mensagens…" aparecia mesmo com o servidor
    // respondendo VAZIO em poucos ms, e o apagamento seguinte puxava a tela.
    // A medição no Chrome real (canal `chrome`, não o headless) deu 78% dos
    // frames com o slot visível; com o atraso de 250ms, 0%.
    const scroll = readFileSync('public/js/ui/messages-scroll.js', 'utf8');
    assert.match(scroll, /setTimeout\(\(\) => \{ skel = this\._showLoadSkeleton\(\); \}, \d+\)/,
      'o indicador precisa de um atraso: resposta rápida não deve piscar na tela');
    // e o atraso precisa ser cancelado quando a resposta chega antes
    assert.match(scroll, /clearTimeout\(delay\)/,
      'sem clearTimeout o indicador acende mesmo depois da resposta');
    // o fim da lista vira cooldown, nunca cache eterno: mensagens antigas
    // podem chegar depois (outro dispositivo) e precisam poder carregar
    assert.match(scroll, /serverExhaustedUntil/, 'o fim da lista precisa ser marcado');
    assert.doesNotMatch(scroll, /serverExhausted\s*=\s*true(?![\w])/,
      'marca permanente de "fim da lista" bloqueia mensagens que chegarem depois');
    assert.match(scroll, /Date\.now\(\) < this\.serverExhaustedUntil/,
      'a marca do fim da lista precisa ser um cooldown com prazo');
  });

  it('o cooldown do fim da lista é zerado ao trocar de conversa', () => {
    const render = readFileSync('public/js/ui/messages.js', 'utf8');
    assert.match(render, /this\.serverExhaustedUntil\s*=\s*0/,
      'abrir outra conversa precisa reabrir a busca no servidor');
  });
});
