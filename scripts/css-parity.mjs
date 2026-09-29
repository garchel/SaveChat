// Verificador de PARIDADE do CSS — rede de segurança do refactor.
//
// O CSS foi fatiado em public/styles/*.css e o styles.css virou um índice de
// @import. Isso NÃO pode mudar nada visual: a cascata deste projeto depende da
// ordem de declaração (várias regras vencem por ordem, não por especificidade),
// então um corte ou uma reordenação silenciosa quebraria o app.
//
// O script extrai os seletores da folha montada (índice na ordem dos @import +
// as partes) e mede o getComputedStyle de cada um num app semeado. Comparando
// o resultado antes/depois do refactor, qualquer mudança de layout aparece como
// valor diferente.
//
// Uso:
//   node scripts/css-parity.mjs            -> mede e grava tmp-parity.json
//   node scripts/css-parity.mjs out.json   -> mede e grava no caminho dado
//
// Comparar depois (precisa do python helper ou um diff de JSON):
//   as 4 entradas com animação contínua (.sync-status* e .load-slot .load-spin)
//   oscilam a cada medição por natureza — leia o mapa com elas em mente.
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const OUT = process.argv[2] || process.env.PARITY_OUT || 'tmp-parity.json';

// monta a folha ASSEMBLADA na ordem real de aplicação
const index = readFileSync('public/styles.css', 'utf8');
const parts = Array.from(index.matchAll(/@import url\("([^"]+)"\);/g)).map((m) => m[1]);
const css = parts.length
  ? parts.map((f) => readFileSync(join('public', f), 'utf8')).join('\n')
  : index;

// extrai os seletores de nível superior (fora de @media/@supports)
const selectors = new Set();
{
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let buf = '';
  for (const ch of stripped) {
    if (ch === '{') {
      depth++;
      if (depth === 1) { selectors.add(buf.trim()); buf = ''; continue; }
    } else if (ch === '}') { depth--; buf = ''; if (depth === 0) continue; }
    else if (depth === 0) buf += ch;
  }
}
const list = Array.from(selectors).filter((s) => s && !s.startsWith('@'));
console.log('seletores extraídos:', list.length);

// app semeado: uma conversa aberta, com mensagem, sidebar e árvore
const SEED = {
  user: { name: 'T', mail: 't@t.com', provider: 'email' },
  threads: { t1: { id: 't1', name: 'C', folderId: null, created: Date.now() - 1000 } },
  folders: {},
  notes: { t1: [{ id: 'n1', threadId: 't1', user: 'me', text: 'x', ts: Date.now(), clientId: 'c1' }] },
  ui: { expanded: {}, sounds: { enabled: false } },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.addInitScript((s) => { localStorage.setItem('notethread.v2', JSON.stringify(s)); }, SEED);
const page = await ctx.newPage();
await page.goto((process.env.BASE_URL || 'http://localhost:3000') + '/?nosw=1');
await page.waitForTimeout(2500);
await page.locator('.tnode').first().click();
await page.waitForTimeout(1500);

const PROPS = [
  'width', 'height', 'padding', 'margin', 'backgroundColor', 'color',
  'borderRadius', 'border', 'boxShadow', 'display', 'position',
  'fontSize', 'fontWeight', 'opacity', 'transform', 'zIndex', 'gap',
  'flexDirection', 'alignItems', 'justifyContent', 'overflow', 'cursor',
];

const probe = await page.evaluate(([sels, props]) => {
  const out = {};
  for (const sel of sels) {
    let el;
    try { el = document.querySelector(sel); } catch { out[sel] = 'INVALID'; continue; }
    if (!el) { out[sel] = 'AUSENTE'; continue; }
    const c = getComputedStyle(el);
    out[sel] = props.map((p) => c[p]).join('|');
  }
  return out;
}, [list, PROPS]);

await import('fs').then((fs) => fs.writeFileSync(OUT, JSON.stringify(probe, null, 1)));
const present = Object.values(probe).filter((v) => v !== 'AUSENTE' && v !== 'INVALID').length;
console.log('TOTAL PROBADOS:', Object.keys(probe).length);
console.log('PRESENTES:', present);
console.log('gravado em:', OUT);
await browser.close();
