// Contrato do provedor de IA: a chave do Gemini é segredo de servidor.
//
// O app é estático, então qualquer chave em `public/` vira pública. Estes
// testes travam o desenho: o cliente fala com `/api/ai`, o servidor lê a
// chave de `GEMINI_API_KEY` e nenhum arquivo versionado embute uma chave.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

const KEY_PATTERNS = [/AIza[0-9A-Za-z_-]{20,}/, /AQ\.[A-Za-z0-9_-]{25,}/];

describe('provedor de IA', () => {
  const client = readFileSync('public/js/ui/workspace-ai.js', 'utf8');
  const fn = readFileSync('api/ai.js', 'utf8');

  it('o cliente usa o proxy /api/ai quando não há chave própria', () => {
    assert.match(client, /fetch\('\/api\/ai'/, 'workspace-ai.js precisa chamar /api/ai');
    assert.match(client, /_aiSessionToken/, 'precisa enviar a sessão do Supabase para autenticar');
    assert.match(client, /Authorization:\s*`Bearer \$\{token\}`/, 'o proxy exige o bearer token');
  });

  it('a chave do Gemini só é lida do ambiente, no servidor', () => {
    assert.match(fn, /process\.env\.GEMINI_API_KEY/, 'api/ai.js lê a chave do ambiente');
    for (const re of KEY_PATTERNS) {
      assert.doesNotMatch(fn, re, 'nenhuma chave literal pode estar em api/ai.js');
    }
  });

  it('a anon key do Supabase não fica hardcoded no servidor', () => {
    assert.doesNotMatch(fn, /eyJhbGciOiJIUzI1NiIs/, 'api/ai.js não pode embutir o JWT do Supabase (GitGuardian)');
    assert.match(fn, /req\.headers\.apikey/, 'a anon key vem no header apikey');
  });

  it('o cliente manda a anon key pública no header apikey', () => {
    assert.match(client, /SUPABASE_ANON_KEY/, 'workspace-ai.js importa a anon key');
    assert.match(client, /apikey:\s*SUPABASE_ANON_KEY/, 'o proxy precisa do apikey para validar a sessão');
  });

  it('o modelo padrão existe para chaves novas (o 2.5 foi aposentado)', () => {
    assert.match(client, /gemini-3\.6-flash/, 'modelo padrão atualizado');
    assert.doesNotMatch(client, /'gemini-2\.5-flash'/, 'gemini-2.5-flash não atende chaves novas');
  });

  it('o proxy tem fallback quando o modelo pedido está em pico', () => {
    assert.match(fn, /FALLBACK_MODELS/, 'api/ai.js precisa de uma lista de fallback');
    assert.match(fn, /gemini-3\.6-flash/, 'o fallback estável está na lista');
  });

  it('nenhum arquivo versionado carrega uma chave do Gemini', () => {
    const roots = ['public', 'api', 'scripts', 'tests', 'docs'];
    const leaks = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(js|mjs|cjs|json|txt|md|html|webmanifest)$/i.test(name)) continue;
        const s = readFileSync(p, 'utf8');
        if (KEY_PATTERNS.some((re) => re.test(s))) leaks.push(p);
      }
    };
    roots.forEach(walk);
    assert.deepEqual(leaks, [], 'chave do Gemini vazando no repositório: ' + leaks.join(', '));
  });
});
