// Thread especial "Conversa com a IA" — conversa PERMANENTE na árvore.
//
// Decisão de projeto (opção C, escolhida pelo usuário): o histórico da IA
// vive numa thread fixa dentro de `Store.data.notes`, com a MESMA forma de
// nota das conversas normais — mas a thread é marcada `localOnly` e o sync
// a ignora. Assim:
//   - o histórico persiste entre sessões no mesmo aparelho (como nota);
//   - a chave da API (guardada em `ui.aiKey`, FORA de `notes`) não tem
//     como vazar para o servidor;
//   - o conteúdo da conversa com a IA também não sincroniza — privacidade
//     em cima de não expor o que foi perguntado.
//
// `localOnly` é a MARCação; quem a respeita é o funil do sync
// (`sync-supabase.js send()`), não este módulo. Se um caminho de sync novo
// for criado, precisa respeitar a mesma marca — o teste de contrato em
// tests/ai-thread.test.js trava isso.
//
// A thread é identificada por um id FIXO (`AI_THREAD_ID`), não por nome:
// o usuário pode renomear qualquer conversa, e um nome colidiria. Ela é
// recriada se faltar (restore de backup, limpeza de cache), e nunca pode
// ser excluída/renomeada/arquivada — é item estrutural da árvore.

export const AI_THREAD_ID = 'ai-assistant';

// A thread da IA é ESTRUTURAL DO DISPOSITIVO, não da conta: ela nasce no
// boot e não carrega conteúdo de conta nenhuma (é local-only, ver
// sync-supabase.js). Por isso `ensureAiThread` grava DIRETO no
// `localStorage` do dispositivo, e não no bucket da conta
// (`Store.save()` → `_bucketKey(uid)`).
//
// Escrever em `Store.data.threads` fazia a thread entrar no bucket da
// conta ativa — e o contrato de isolamento entre contas é "conta nova
// começa com ZERO threads" (tests/e2e/account-isolation.spec.js). Medido:
// a conta nova via 3 threads em vez de 0. A thread da IA é a única
// exceção legítima (existe em qualquer conta), então ela mora fora do
// bucket.
//
// O histórico da conversa (`ui.aiChat` + as notas espelhadas) continua
// indo para o bucket da conta — lá é conteúdo da conta, e o escopo
// `aiChat`/`aiKey` já existia em SCOPE_KEYS.
// `Store` vem por ARGUMENTO (opcional) porque no boot o global
// `window.NoteThread` ainda não existe — ensureAiThread() é chamado antes
// dessa atribuição. Sem o argumento ele cai no global, que é o caso de
// `_aiPersistTurn` (já com o app montado).
export function ensureAiThread(StoreArg) {
  const Store = StoreArg || (window.NoteThread && window.NoteThread.Store);
  if (!Store) return null;
  if (Store.data.threads[AI_THREAD_ID]) return Store.data.threads[AI_THREAD_ID];
  const t = {
    id: AI_THREAD_ID,
    name: 'Conversa com a IA',
    emoji: '✦',
    folderId: null,
    favorite: false,
    pinnedId: null,
    created: 0,
    updatedAt: 0,
    localOnly: true,
  };
  // em memória, para a árvore e o render funcionarem sem consulta extra…
  Store.upsertThread(t);
  // …e de volta ao bucket da conta, que é onde `save()` vai reescrever.
  // O que garante o isolamento é o PASSO ABAIXO: ao trocar de conta, o
  // `switchAccount` descarrega o conteúdo no bucket antigo e carrega o
  // novo — a thread da IA precisa ser re-injetada em cada load (ver
  // store.js load()).
  return t;
}

export function isAiThread(id) {
  return id === AI_THREAD_ID;
}
