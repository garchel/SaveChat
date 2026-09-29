// Playwright config — serve public/ e roda o fluxo crítico (A6.6)
module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  // Workers limitados: cada teste sobe o app inteiro (que carrega o cliente
  // Supabase em background) e vários em paralelo deixavam os waits fixos do
  // tipo `waitForTimeout(2000)` estourarem de forma intermitente.
  workers: 3,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node tests/static-server.cjs',
    port: 4173,
    reuseExistingServer: true,
    timeout: 10000,
  },
};
