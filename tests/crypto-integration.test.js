import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

test('gate de criptografia tem setup, unlock e recuperação no HTML', () => {
  const html = read('public/partials/login.txt');
  assert.match(html, /id="crypto-gate"/);
  assert.match(html, /id="crypto-pass"/);
  assert.match(html, /id="crypto-pass2"/);
  assert.match(html, /id="crypto-pass-unlock"/);
  assert.match(html, /id="crypto-recovery-input"/);
  assert.match(html, /id="crypto-code"/);
  assert.match(html, /id="crypto-recovery-saved"/);
  assert.match(html, /Crie sua senha de criptografia|Desbloqueie suas notas/);
});

test('boot só mostra o app depois de CryptoGate.ensure', () => {
  const auth = read('public/js/ui/auth.js');
  assert.match(auth, /CryptoGate\.ensure\(supa, Store\.user\)/);
  assert.match(auth, /await CryptoGate\.ensure/);
  assert.match(auth, /lockKeys\(\)/);
  assert.match(auth, /CryptoGate\.close\(\)/);
  assert.match(auth, /USE_SUPABASE && Store\.user\.id/);
});

test('sync grava ciphertext e não texto claro', () => {
  const sync = read('public/js/sync-supabase.js');
  assert.match(sync, /encryptNoteText\(n, dek, uid\)/);
  assert.match(sync, /text: null, text_enc: enc\.text_enc, enc_version: enc\.enc_version/);
  assert.match(sync, /last_preview: '', last_preview_enc: previewEnc/);
  assert.match(sync, /decryptNoteText/);
  assert.match(sync, /decryptThreadPreview/);
  assert.doesNotMatch(sync, /text: n\.text, images:/);
});

test('gate e cifragem estão no precache e no check', () => {
  const pkg = read('package.json');
  const sw = read('public/sw.js');
  for (const f of ['keyring.js', 'note-crypto.js', 'crypto-gate.js']) {
    assert.ok(pkg.includes(`public/js/${f}`), `${f} fora do npm run check`);
    assert.ok(sw.includes(`'./js/${f}'`), `${f} fora do precache`);
  }
});

// ---------------------------------------------------------------------
// Fase 1b/1c: cache local cifrado, backfill e corte. Estes módulos entram
// no bundle por caminhos diferentes (auth, sync, UI) — se um deles sair do
// precache/check, o app quebra só quando o usuário está offline ou quando o
// servidor faz o corte, que é exatamente quando não dá para "recarregar".
// ---------------------------------------------------------------------
test('backfill, cache local e privacidade estão no precache e no check', () => {
  const pkg = read('package.json');
  const sw = read('public/sw.js');
  for (const f of ['crypto-session.js', 'backfill.js']) {
    assert.ok(pkg.includes(`public/js/${f}`), `${f} fora do npm run check`);
    assert.ok(sw.includes(`'./js/${f}'`), `${f} fora do precache`);
  }
  assert.ok(pkg.includes('public/js/ui/privacy.js'), 'privacy.js fora do npm run check');
  assert.ok(sw.includes("'./js/ui/privacy.js'"), 'privacy.js fora do precache');
});

test('o cache local é cifrado depois do unlock e gravado antes do logout', () => {
  const auth = read('public/js/ui/auth.js');
  assert.match(auth, /makeCacheCipher\(Store\.user\.id, dek\)/);
  assert.match(auth, /makeQueueCipher\(Store\.user\.id, dek\)/);
  assert.match(auth, /await Store\.hydrate\(\)/);
  // a DEK precisa estar em memória quando o bucket é gravado
  assert.match(auth, /Store\.setCipher/);
  assert.match(auth, /const dek = getDek\(\)/);

  const app = read('public/app.js');
  const logout = app.slice(app.indexOf("getElementById('profile-logout')"));
  const trecho = logout.slice(0, 500);
  assert.match(trecho, /await Store\.flush\(\)/, 'logout precisa esperar a gravação cifrada');
  assert.ok(trecho.indexOf('Store.flush') < trecho.indexOf('lockKeys'),
    'a chave saiu da memória antes do flush');

  const store = read('public/js/store.js');
  // conta já cifrada nunca volta a gravar claro
  assert.match(store, /if \(this\._encrypted\) return;/);
  assert.match(store, /if \(this\.locked\) return;/);
  // cipher só vale para o uid dele (troca de conta no mesmo navegador)
  assert.match(store, /this\.cipher\.uid === uid/);
});

test('backfill roda e o corte é checado depois de conectar', () => {
  const sync = read('public/js/sync-supabase.js');
  assert.match(sync, /checkEncryptionCutover\(\)/);
  assert.match(sync, /startBackfill\(\)/);
  assert.match(sync, /isCutoverError\(e\)/);
  // código 42703 = banco sem a migração: nunca cair para texto claro
  assert.match(sync, /res\.error\.code === '42703' && \/text_enc\|enc_version\//);
});

test('a página da IA tem o painel de consentimento por conversa', () => {
  const partial = read('public/partials/workspace.txt');
  assert.match(partial, /id="ai-consent"/);
  const ws = read('public/js/ui/workspace.js');
  assert.match(ws, /data-ai-consent/);
  const ai = read('public/js/ui/workspace-ai.js');
  assert.match(ai, /t\.aiShared === true/, 'o contexto da IA precisa filtrar por consentimento');
  assert.match(ai, /renderAiConsent\(\)/);
});

