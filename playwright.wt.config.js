// Config e2e da worktree `cabecalho-compacto`.
//
// A config da raiz (playwright.config.js) fixa 4173 com reuseExistingServer:
// true — o que faz a worktree testar o servidor do OUTRO agente, em silêncio,
// e "confirmar" uma árvore que não é a dela (o mesmo aviso de wt.mjs:150).
// Aqui a porta vem do ambiente e o reuso é desligado: se o servidor não
// subir, o teste falha em vez de medir a árvore errada.
const PORT = Number(process.env.PORT) || 4200;
module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 3,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // webServer roda via cmd.exe no Windows: `PORT=x cmd` (sintaxe Unix)
    // falha com "PORT nao e reconhecido como comando". O env vai no proprio
    // objeto, nao na linha de comando.
    command: 'node tests/static-server.cjs',
    env: { PORT: String(PORT) },
    port: PORT,
    reuseExistingServer: false,
    timeout: 20000,
  },
};
