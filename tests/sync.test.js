const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('fs');

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
  it('página "Como usar" existe, é servida e está no precache do SW', ()=>{
    const html = readFileSync('public/index.html','utf8');
    const sw = readFileSync('public/sw.js','utf8');
    assert.ok(existsSync('public/help.html'), 'public/help.html ausente');
    // o botão vive no popover do perfil (entre Configurações e Instalar app)
    assert.match(html, /id="profile-help"/);
    // e o clique que abre a página está ligado em app.js
    assert.match(readFileSync('public/app.js','utf8'), /getElementById\('profile-help'\)/);
    // offline: a página de ajuda abre sem internet
    assert.match(sw, /'\.\/help\.html'/);
  });
  it('Friendly Names é dev-only: não carrega e não roda em produção', ()=>{
    const html = readFileSync('public/index.html','utf8');
    const fn = readFileSync('public/js/friendly-names.js','utf8');
    const css = readFileSync('public/styles/05-ui-ux-v6.css','utf8');
    // 1) o script é injetado condicionalmente por hostname (nunca baixado em prod)
    assert.ok(
      /if \(\['localhost', '127\.0\.0\.1', '\[::1\]'\]\.includes\(location\.hostname\)\)/.test(html),
      'index.html deve carregar friendly-names.js só em localhost');
    assert.ok(!/<script[^>]*src="js\/friendly-names\.js"/.test(html),
      'friendly-names.js não pode ser <script src> unconditional');
    // 2) defense in depth: o módulo aborta fora de dev mesmo se for importado
    assert.match(fn, /if \(!IS_DEV\)/);
    assert.match(fn, /IS_DEV = \['localhost', '127\.0\.0\.1', '\[::1\]'\]\.includes\(location\.hostname\)/);
    // 3) o botão nasce escondido: só o JS dev o revela (sem flash em prod)
    assert.match(css, /\.friendly-toggle\s*\{[^}]*display:\s*none/);
    assert.match(css, /\.friendly-toggle\.is-dev\s*\{\s*display:\s*flex/);
  });
  it('preview local de staging existe e cobre o gate do service worker', ()=>{
    const pkg = JSON.parse(readFileSync('package.json','utf8'));
    const prev = readFileSync('scripts/preview.mjs','utf8');
    // `npm run preview` e `npm run staging` são o mesmo caminho
    assert.match(pkg.scripts.preview, /preview\.mjs/);
    assert.match(pkg.scripts.staging, /preview\.mjs/);
    // escolhe a porta ANTES de servir: `serve` troca de porta em silêncio
    assert.match(prev, /isFree/);
    assert.match(prev, /PREVIEW_PORT/);
    // serve help.html LITERALMENTE (sem clean URL) — é assim que o SW
    // precacha './help.html' e assim que a Vercel entrega em produção
    assert.ok(!/cleanUrl|clean-url|rewrite/i.test(prev), 'preview não deve fazer clean URLs');
  });
  it('promote.mjs tem os portoes do fluxo e NAO mexe em main', ()=>{
    const pr = readFileSync('scripts/promote.mjs','utf8');
    const pkg = JSON.parse(readFileSync('package.json','utf8'));
    assert.match(pkg.scripts.promote, /promote\.mjs/);
    // portoes: origem valida, arvore limpa, branch no remoto
    assert.match(pr, /source === TARGET/);
    assert.match(pr, /source === 'main'/);
    assert.match(pr, /git status --porcelain/);
    assert.match(pr, /rev-parse --verify/);
    // a suite local e o portao real: nada sobe com teste vermelho
    assert.match(pr, /npm run check/);
    assert.match(pr, /npm test/);
    assert.match(pr, /npm run e2e/);
    // e o CI e aguardado
    assert.match(pr, /gh run list/);
    // LIMITE: abrir PR ou mergear em main e decisao do usuario
    assert.ok(!/gh pr merge/.test(pr), 'promote não pode mergear em main');
    assert.ok(!/gh pr create/.test(pr), 'promote não deve abrir PR');
    assert.ok(!/push origin main/.test(pr), 'promote nunca envia para main');
  });
  it('tipografia: nenhum TEXTO corrido abaixo de 12px', ()=>{
    const fs2 = require('fs');
    const dir = 'public/styles';
    // badge/contador/avatar sao glifo numerico, nao texto: o piso nao se aplica
    const ICON = /badge|count|chip|dot|png|ini\b|av-|glyph|indicator|\.del\b/i;
    const oficiais = [];
    for (const f of fs2.readdirSync(dir).filter(x => x.endsWith('.css'))) {
      const src = fs2.readFileSync(`${dir}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].replace(/\s+/g, ' ').trim();
        if (ICON.test(sel)) continue;
        for (const fs of m[2].matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
          if (parseFloat(fs[1]) < 12) oficiais.push(`${f}: ${sel} = ${fs[1]}px`);
        }
      }
    }
    assert.deepEqual(oficiais, [],
      `texto abaixo de 12px (piso WCAG/legibilidade):\n  ${oficiais.join('\n  ')}`);
  });
  it('sw.js é v147', ()=>{
    const sw=readFileSync('public/sw.js','utf8');
    assert.match(sw, /notethread-v147/);
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
    // A seção Sobre mora em partials/menus.txt desde a modularização do HTML,
    // então o HTML montado (index + partials) é a fonte — não só o index.
    const montado = html + readdirSync('public/partials').map(f => readFileSync('public/partials/'+f,'utf8')).join('');
    assert.ok(montado.includes(`>${v}</span>`), 'Sobre deve mostrar a mesma versão');
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    assert.equal(pkg.version, v);
  });
  it('CHANGELOG (servido) começa na mesma versão do APP_VERSION', ()=>{
    const html=readFileSync('public/index.html','utf8');
    const v=html.match(/window\.APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
    const cl=readFileSync('public/CHANGELOG.md','utf8');
    assert.ok(cl.includes(`## [${v}]`), 'CHANGELOG deve ter entrada para a versão atual');
  });
  it('audio.js (player de voz) esta no precache do SW', ()=>{
    const sw = readFileSync('public/sw.js','utf8');
    assert.ok(sw.includes("'./js/audio.js'"), 'audio.js ausente no precache - o player de voz quebra offline');
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
