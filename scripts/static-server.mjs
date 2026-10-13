// Servidor estático mínimo para desenvolvimento (sem dependências).
// Uso: node scripts/static-server.mjs [porta]  (padrão 3000)
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const ROOT = fileURLToPath(new URL('../public', import.meta.url));
const PORT = Number(process.argv[2]) || 3000;

// POR QUE ESTA CHECAGEM EXISTE
// `npm run dev` era `serve public -l 3000`, e o `serve` NÃO falha quando a
// porta está ocupada — ele troca de porta EM SILÊNCIO (medido: subiu na
// 59128 com a 3000 tomada por um servidor de teste órfão). Resultado: o
// desenvolvedor abre localhost:3000, vê uma versão velha do app servida
// pelo processo fantasma e conclui que a mudança "não subiu".
//
// Falhar ALTO é o comportamento correto: a mensagem diz qual é o PID
// invasor e como matá-lo. O `preview.mjs` já fazia isso para a 3002 (ver o
// comentário longo no topo daquele arquivo, que documenta a mesma sessão
// de debugging); o `dev` era o caminho que ainda não tinha a proteção.
function quemEstaNaPorta(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' });
    s.setTimeout(700);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const ocupada = await quemEstaNaPorta(PORT);
if (ocupada) {
  console.error(`\n✖ Porta ${PORT} já está em uso.\n`);
  console.error(`  Outro servidor (provavelmente um \`npm run dev\`/\`preview\`/\`e2e\` de uma sessão anterior) está nela.`);
  console.error(`  Abrir http://localhost:${PORT} mostraria a versão DELE, não a sua — por isso o app pareceria "não atualizar".\n`);
  console.error(`  Para liberar (Windows):`);
  console.error(`    netstat -ano | findstr :${PORT}`);
  console.error(`    taskkill /PID <pid> /F\n`);
  process.exit(1);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    // resolve dentro de public/ (bloqueia path traversal)
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(normalize(ROOT + sep))) { res.writeHead(403); res.end(); return; }
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, () => console.log('static-server on http://localhost:' + PORT));
