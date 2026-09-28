const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('fs');

// Verifica que supabase.sql tem RLS + Realtime
describe('supabase.sql', ()=>{
  const sql = readFileSync('supabase.sql','utf8');
  it('tem tabelas', ()=>{ assert.match(sql, /create table if not exists threads/); assert.match(sql, /create table if not exists notes/); });
  it('tem RLS', ()=>{ assert.match(sql, /enable row level security/); assert.match(sql, /auth\.uid\(\) = user_id/); });
  it('tem Realtime', ()=>{ assert.match(sql, /supabase_realtime add table notes/); });
  it('revoga execute público do event trigger de auto-RLS', ()=>{ assert.match(sql, /revoke execute on function public\.rls_auto_enable\(\) from anon, authenticated, public/); });
});

// Verifica manifest e icons
describe('PWA', ()=>{
  it('manifest tem icons', ()=>{
    const m = JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
    assert.ok(m.icons.length >= 2);
    assert.ok(m.icons.find(i=>i.src.includes('logo')));
    assert.equal(m.short_name, 'SaveChat');
  });
  it('precache do SW cobre os ícones do manifest (offline/instalação em device novo)', ()=>{
    const m = JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
    const sw = readFileSync('public/sw.js','utf8');
    for (const i of m.icons) {
      const src = "'./" + i.src.replace(/^\.\//, '') + "'";
      assert.ok(sw.includes(src), `ícone do manifest ausente no precache do SW: ${src}`);
    }
  });
  it('sw.js é v123', ()=>{
    const sw=readFileSync('public/sw.js','utf8');
    assert.match(sw, /notethread-v123/);
    // o próprio SW não pode ser servido do cache (senão o navegador nunca
    // descobre novas versões e o updater fica sem "waiting" — deadlock)
    assert.match(sw, /endsWith\('\/sw\.js'\)\) return/);
    // precache com query-buster: cache novo nunca herda asset do SW anterior
    assert.match(sw, /precache=' \+ Date\.now\(\)/);
  });
  it('APP_VERSION no index.html bate com a 1ª versão do CHANGELOG', ()=>{
    const html = readFileSync('public/index.html','utf8');
    const appV = html.match(/APP_VERSION = '(\d+\.\d+\.\d+)'/);
    assert.ok(appV, 'APP_VERSION não encontrado no index.html');
    const cl = readFileSync('public/CHANGELOG.md','utf8');
    const topV = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    assert.ok(topV, 'versão não encontrada no CHANGELOG');
    assert.equal(appV[1], topV[1], 'APP_VERSION (' + appV[1] + ') ≠ CHANGELOG (' + topV[1] + ') — o updater marcaria "atualização disponível" para sempre');
  });
  it('SW espera SKIP_WAITING (update controlado pelo botão, não auto-skipWaiting)', ()=>{
    const sw=readFileSync('public/sw.js','utf8');
    assert.match(sw, /SKIP_WAITING/);
    assert.ok(!/install[\s\S]{0,200}skipWaiting\(\)/.test(sw), 'install NÃO deve chamar skipWaiting');
  });
  it('index.html embute APP_VERSION e o botão Atualizar app no popover do perfil', ()=>{
    const html=readFileSync('public/index.html','utf8');
    assert.match(html, /window\.APP_VERSION = '(\d+\.\d+\.\d+)'/);
    assert.match(html, /id="profile-update"/);
    assert.match(html, /id="update-chip"/);
  });
  it('APP_VERSION (index) == versão da seção Sobre == package.json', ()=>{
    const html=readFileSync('public/index.html','utf8');
    const v=html.match(/window\.APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
    assert.ok(html.includes(`>${v}</span>`), 'Sobre deve mostrar a mesma versão');
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    assert.equal(pkg.version, v);
  });
  it('CHANGELOG (servido) começa na mesma versão do APP_VERSION', ()=>{
    const html=readFileSync('public/index.html','utf8');
    const v=html.match(/window\.APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
    const cl=readFileSync('public/CHANGELOG.md','utf8');
    assert.ok(cl.includes(`## [${v}]`), 'CHANGELOG deve ter entrada para a versão atual');
  });
  it('updater.js está no precache do SW', ()=>{
    const sw=readFileSync('public/sw.js','utf8');
    assert.match(sw, /'\.\/js\/updater\.js'/);
  });
  it('oauth-callback.html existe e está no precache do SW (popup nunca renderiza o app)', ()=>{
    assert.ok(existsSync('public/oauth-callback.html'));
    const sw=readFileSync('public/sw.js','utf8');
    assert.match(sw, /'\.\/oauth-callback\.html'/);
  });
  it('CHANGELOG é servido pelo site (toast "what\'s new" em prod)', ()=>{
    assert.ok(existsSync('public/CHANGELOG.md'));
  });
});
