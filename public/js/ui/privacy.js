// Privacidade no app: barra de progresso do backfill de cifragem, bloqueio por
// corte de versão e aviso de "atualize o app" quando o servidor já rejeita
// texto claro. Fica fora do auth porque também roda com o app aberto.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { esc } from '../utils.js';
import { Backfill } from '../backfill.js';
import { getDek } from '../keyring.js';

const BANNER_ID = 'crypto-backfill';

function versionParts(value) {
  return String(value || '').split('.').map((n) => Number(String(n).replace(/\D.*$/, '')) || 0);
}

export function compareVersions(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export const PrivacyMethods = {
  _backfillBanner(state) {
    let el = document.getElementById(BANNER_ID);
    if (!state) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = BANNER_ID;
      el.className = 'crypto-banner';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<span class="crypto-banner-text"></span><span class="crypto-banner-bar"><span></span></span>';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
    const total = Math.max(0, Number(state.total) || 0);
    const done = Math.max(0, Number(state.done) || 0);
    const text = el.querySelector('.crypto-banner-text');
    const bar = el.querySelector('.crypto-banner-bar > span');
    if (text) text.textContent = state.finished
      ? 'Suas notas estão cifradas neste dispositivo.'
      : `Cifrando suas notas… ${done} de ${total || '?'}`;
    if (bar) bar.style.width = total ? `${Math.min(100, Math.round((done / total) * 100))}%` : '0%';
    el.classList.toggle('done', !!state.finished);
  },

  // Backfill (Fase 1b). Roda uma vez por sessão e retoma sozinho no próximo
  // boot/reconexão se for interrompido.
  async startBackfill() {
    if (!Store.user || !Store.user.id) return false;
    if (this._backfillRunning || !getDek()) return false;
    const supa = Sync.supa;
    if (!supa) return false;
    this._backfillRunning = true;
    let result = null;
    try {
      result = await Backfill.run(supa, Store.user.id, {
        onProgress: ({ done, total }) => this._backfillBanner({ done, total }),
      });
    } catch (e) {
      console.warn('[backfill] interrompido — retoma na próxima conexão', e);
    } finally {
      this._backfillRunning = false;
    }
    if (result && result.done > 0) {
      this._backfillBanner({ done: result.done, total: result.total, finished: true });
      setTimeout(() => this._backfillBanner(null), 4000);
    } else {
      this._backfillBanner(null);
    }
    return !!(result && result.done);
  },

  // O servidor ligou o corte (encryption_enforced) e/ou exige uma versão
  // mínima: sem isso o app só conseguiria falhar em cada gravação.
  async checkEncryptionCutover() {
    const supa = Sync.supa;
    if (!supa) return false;
    let cfg = null;
    try {
      const { data, error } = await supa.from('app_config')
        .select('encryption_enforced,min_client_version')
        .maybeSingle();
      if (error) return false; // banco ainda sem a migração
      cfg = data;
    } catch { return false; }
    if (!cfg || !cfg.encryption_enforced) return false;
    const min = cfg.min_client_version;
    const current = (typeof window !== 'undefined' && window.APP_VERSION) || '0.0.0';
    if (min && compareVersions(current, min) < 0) {
      this.showEncryptionUpdate(`Esta versão (${current}) não pode mais gravar notas. Atualize para a ${min} ou mais nova.`);
      return true;
    }
    return false;
  },

  // Chamado pelo sync quando o trigger do banco rejeita texto claro. Bloqueia a
  // interface: continuar digitando só produziria gravações perdidas.
  showEncryptionUpdate(message) {
    if (this._cryptoUpdateShown) return;
    this._cryptoUpdateShown = true;
    const body = `<p>${esc(message || 'O servidor passou a exigir notas cifradas e esta versão do app não sabe fazer isso.')}</p>
      <p class="muted">Recarregue para buscar a versão nova. Se o aviso continuar, feche e abra o app de novo.</p>`;
    if (typeof this.showModal === 'function') {
      this.showModal('Atualize o app', body, () => location.reload());
    }
  },
};
