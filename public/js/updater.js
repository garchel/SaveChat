// SaveChat — atualização do app (PWA)
// Check na abertura: compara a versão local (window.APP_VERSION do index.html)
// com a versão publicada (1ª linha "## [x.y.z]" do CHANGELOG.md servido).
// Indicador no popover do perfil; clique = baixa e instala a nova versão.
//
// Estados do chip:
//   checking  → "verificando…" (spinner leve)
//   current   → "v1.4.1 ✓" (verde --ok)  — já está na mais recente
//   update    → "v1.4.2 disponível" (âmbar) + dot no avatar — clique atualiza
//   offline   → "offline" (cinza) — sem rede p/ verificar
//   error     → "não foi possível verificar" (cinza)

import { $ } from './utils.js';

const V = () => (window.APP_VERSION || '0.0.0');

let lastCheck = null; // { state, remote, ts } — memo p/ clique imediato

function chipEl() { return $('#update-chip'); }

function setChip(state, remote) {
  const chip = chipEl(); if (!chip) return;
  const labels = {
    checking: 'verificando…',
    current: `${V()} ✓`,
    update: `${remote} disponível`,
    offline: 'offline',
    error: 'indisponível',
  };
  chip.dataset.state = state;
  chip.textContent = labels[state] || '';
  chip.classList.remove('hidden');
  // botão inteiro viva o estado (title/aria dinâmicos p/ screen readers)
  const btn = $('#profile-update');
  if (btn) {
    const titles = {
      checking: 'Verificando atualizações…',
      current: `Você está na versão mais recente (${V()})`,
      update: `Baixar e instalar ${remote === 'nova versão' ? 'a atualização pendente' : 'a versão ' + remote}`,
      offline: 'Sem conexão para verificar atualizações',
      error: 'Não foi possível verificar atualizações agora',
    };
    btn.title = titles[state] || '';
    btn.setAttribute('aria-label', titles[state] || 'Atualizar app');
  }
  // dot âmbar no avatar quando há novidade (sinal visível mesmo com popover fechado)
  const avatar = $('#me-avatar');
  if (avatar) avatar.classList.toggle('has-update', state === 'update');
}

async function remoteVersion() {
  // cache-buster obrigatório: CHANGELOG.md passa a ser network-first no SW,
  // mas o HTTP cache do browser ainda pode servir stale sem o parâmetro
  const r = await fetch(`CHANGELOG.md?_=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('changelog ' + r.status);
  const t = await r.text();
  const m = t.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!m) throw new Error('sem versão no changelog');
  return m[1];
}

function newer(a, b) { // a > b ?
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function check({ silent } = {}) {
  if (!navigator.onLine) { lastCheck = { state: 'offline', ts: Date.now() }; setChip('offline'); return lastCheck; }
  setChip('checking');
  try {
    const remote = await remoteVersion();
    // SW em waiting ganha SEMPRE: há uma versão nova já baixada esperando o clique,
    // mesmo que CHANGELOG × APP_VERSION ainda não tenham divergido (evita o beco
    // sem saída de updates reprovados porque as versões estavam sincronizadas)
    let hasWaiting = false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      hasWaiting = !!(reg && reg.waiting);
      if (!hasWaiting && reg && !reg.installing) { try { await reg.update(); } catch {} }
    } catch {}
    const state = (newer(remote, V()) || hasWaiting) ? 'update' : 'current';
    const pending = hasWaiting && !newer(remote, V());
    lastCheck = { state, remote, ts: Date.now() };
    setChip(state, pending ? 'nova versão' : remote);
    // toast silencioso apenas quando há novidade e não foi pedido manual
    if (state === 'update' && silent && window.NoteThread && window.NoteThread.UI) {
      window.NoteThread.UI.toast(`Nova versão ${remote} disponível`, { kind: 'info', duration: 6000 });
    }
  } catch (e) {
    lastCheck = { state: 'error', ts: Date.now(), err: String(e && e.message || e) };
    setChip('error');
  }
  return lastCheck;
}

async function applyUpdate() {
  const btn = $('#profile-update');
  const busy = () => btn && btn.classList.contains('updating');
  const setBusy = (on) => { if (btn) { btn.classList.toggle('updating', on); btn.disabled = on; } };

  // 1) com SW: garante que existe um SW novo instalado ANTES de recarregar.
  //    Sem isso, o clique recarregava a página sem nada instalado — e o reload
  //    podia até servir o index.html ANTIGO do cache heurístico do HTTP
  //    (o servidor não manda Cache-Control), mantendo a versão velha na tela.
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        // sem waiting/installing? força o download/instalação do sw.js AGORA
        if (!reg.waiting && !reg.installing) {
          try { await reg.update(); } catch { /* offline: segue pro fallback */ }
        }
        // espera o SW novo chegar a 'installed' (waiting) — até 15s
        const sw = await new Promise((resolve) => {
          const cur = reg.waiting || reg.installing;
          if (!cur) return resolve(null);
          if (cur === reg.waiting || cur.state === 'installed') return resolve(cur);
          const t = setTimeout(() => resolve(null), 15000);
          cur.addEventListener('statechange', () => {
            if (cur.state === 'installed') { clearTimeout(t); resolve(cur); }
          });
        });
        if (sw && reg.waiting === sw) {
          setBusy(true);
          sw.postMessage({ type: 'SKIP_WAITING' }); // controllerchange → app.js recarrega
          setTimeout(() => setBusy(false), 8000); // destrava se o reload não vier
          return;
        }
        // instalação ainda em curso após timeout → fallback abaixo recarrega;
        // na próxima carga o waiting existirá e o próximo clique ativa
      }
    } catch { /* segue para o fallback abaixo */ }
  }

  // 2) fallback: aquece o cache HTTP com o index.html FRESCO (mata o cache
  //    heurístico) e recarrega — a página volta com a versão nova de verdade
  setBusy(true);
  try { await fetch(location.href, { cache: 'reload' }); } catch {}
  location.reload();
}

export const Updater = {
  V,
  check,
  applyUpdate,
  get lastCheck() { return lastCheck; },
};
