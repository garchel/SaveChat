// Preview local do build de produção — o mesmo artefato que a Vercel serve.
//
// Serve o dist/ no próprio processo (sem `npx serve` como filho): um
// filho separado morre junto quando o processo pai é interrompido
// (Ctrl+C), deixando a porta presa. Aqui o Ctrl+C encerra junto.
//
// Por que escolher a porta antes, em vez de `serve dist -l 3002`:
// o `serve` NÃO falha se a porta estiver ocupada — troca de porta
// silenciosamente. Isso custou uma sessão de debugging (browser
// apontando para a porta errada). Aqui a porta é detectada ANTES e
// impressa em destaque, junto da versão servida.
//
//   npm run preview                    # default :3002
//   PREVIEW_PORT=3100 npm run preview

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DIST = path.resolve('dist');
const WANTED = Number(process.env.PREVIEW_PORT) || 3002;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'text/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

// 1. build — o mesmo pipeline que a Vercel executa
execSync('npm run build', { stdio: 'inherit' });

// 2. versão montada: evita testar um build velho em silêncio
let version = 'desconhecida';
try {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  version = (html.match(/APP_VERSION = '([\d.]+)'/) || [])[1] || 'desconhecida';
} catch { /* segue assim mesmo */ }

let branch = 'desconhecida';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
} catch { /* sem git: segue assim mesmo */ }

// 3. primeira porta livre — nunca silenciosa
const isFree = (p) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(p, '127.0.0.1');
});

let port = null;
for (let p = WANTED; p < WANTED + 20; p++) {
  if (await isFree(p)) { port = p; break; }
  console.log(`  Porta ${p} ocupada — procurando a próxima livre.`);
}
if (port === null) {
  console.error(`  Nenhuma porta livre entre ${WANTED} e ${WANTED + 19}.`);
  process.exit(1);
}

// 4. servidor estático. Sem clean URLs de propósito: o preview precisa
//    servir /help.html literalmente, porque é assim que o SW precacha
//    ('./help.html') e assim que a Vercel entrega em produção.
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 — ' + rel); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      // o SW precisa ver a versão nova a cada reload do preview
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`
  ─────────────────────────────────────────────
   Preview de produção  ·  SaveChat v${version}
   Branch: ${branch}
   URL:    http://localhost:${port}
  ─────────────────────────────────────────────
   Update do service worker é pelo botão "Atualizar app"
   (menu do perfil) — Ctrl+Shift+R não substitui.
  ─────────────────────────────────────────────
`);
});

const bye = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 300); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
