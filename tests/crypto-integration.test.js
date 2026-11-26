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
  assert.match(html, /Crie seu PIN \(4 dígitos\)|Digite seu PIN/);
});

// Regra depois da correção do boot offline: com cache CIFRADO o app espera o
// unlock (sem a DEK não há o que mostrar); com cache em CLARO pinta primeiro e
// só depois procura a chave — senão ficava em branco até 45s sem rede.
test('boot: cache cifrado espera o gate, cache em claro pinta antes', () => {
  const auth = read('public/js/ui/auth.js');
  assert.match(auth, /if \(!Store\._encrypted\) \{\s*this\._paintApp\(\);\s*this\._unlockCryptoInBackground\(attempt\);/, 'cache em claro pinta sem await');
  assert.match(auth, /_paintApp\(\) \{/, 'paint isolado, sem rede');
  assert.match(auth, /_unlockCryptoInBackground\(attempt\) \{/, 'unlock corre depois do paint');
  assert.match(auth, /await CryptoGate\.ensure\(supa, Store\.user\)/, 'cache cifrado continua esperando o unlock');
  assert.match(auth, /lockKeys\(\)/);
  assert.match(auth, /CryptoGate\.close\(\)/);
  assert.match(auth, /USE_SUPABASE && Store\.user\.id/);
});

// Regressões que trancariam usuário fora: limite de 4 no campo de DESBLOQUEIO
// impede digitar um PIN antigo (criado quando o mínimo era 8), e validação de
// 8 caracteres impede criar o PIN novo de 4.
test('PIN: setup exige 4 dígitos e o desbloqueio aceita PIN antigo', () => {
  const html = read('public/partials/login.txt');
  const gate = read('public/js/crypto-gate.js');
  assert.match(html, /id="crypto-pass"[^>]*maxlength="4"/);
  assert.doesNotMatch(html, /id="crypto-pass-unlock"[^>]*maxlength/, 'unlock não pode limitar a 4');
  assert.ok(gate.includes('{4}$/') && gate.includes('4 dígitos'), 'setup valida 4 dígitos');
  assert.doesNotMatch(gate, /MIN_PASS = 8/, 'o mínimo de 8 não pode voltar');
});

test('campos do gate ficam empilhados (label acima do input)', () => {
  const css = read('public/styles/02-auth.css');
  assert.match(css, /#crypto-setup-fields, #crypto-unlock-fields, #crypto-recovery-fields \{\s*display: flex; flex-direction: column;/);
});

test('sync grava ciphertext e não texto claro', () => {
  const sync = read('public/js/sync-supabase.js');
  assert.match(sync, /encryptNoteText\(n, dek, uid\)/);
  // conta com chave: texto vai nulo e só o ciphertext sobe.
  assert.match(sync, /text: semChave \? \(n\.text == null \? '' : String\(n\.text\)\) : null/);
  assert.match(sync, /text_enc: enc \? enc\.text_enc : null/);
  // conta sem chave NÃO pode ser bloqueada: sem esse caminho nenhuma conta
  // nova conseguiria salvar nota nem criar chave (o gate só abre com bundle).
  assert.match(sync, /const semChave = !dek && !Store\._encrypted;/);
  assert.match(sync, /if \(!dek && !semChave\) throw new Error\('Criptografia bloqueada\.'\);/);
  assert.match(sync, /last_preview: semChave \? \(t\.lastPreview \|\| ''\) : '', last_preview_enc: previewEnc/);
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

