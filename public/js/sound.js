import { Store } from './store.js';
import { haptic } from './utils.js';

  // Sons sintetizados via cuelume (Web Audio, ESM-only, carregado por CDN).
  // Repositório: https://github.com/Danilaa1/cuelume  (MIT, zero deps)
  export const CUELUME_SOUNDS = [
    'chime', 'sparkle', 'droplet', 'bloom', 'whisper', 'tick', 'press',
    'release', 'toggle', 'success', 'error', 'page', 'loading', 'ready',
    'pulse', 'scan', 'arrival', 'copy'
  ];
  export const Sound = {
    lib: null,
    ready: false,
    loadPromise: null,
    load() {
      if (this.loadPromise) return this.loadPromise;
      this.loadPromise = import('https://esm.sh/cuelume@latest')
        .then((m) => { this.lib = m; this.ready = true; this.apply(); })
        .catch((err) => { console.warn('[cuelume] falha ao carregar sons:', err); });
      return this.loadPromise;
    },
    // aplica estado (ligado/desligado + volume) a partir do Store
    apply() {
      if (!this.lib) return;
      const s = (Store.data && Store.data.ui && Store.data.ui.sounds) || {};
      try { this.lib.setEnabled(!!s.enabled); } catch {}
      try { this.lib.setVolume(typeof s.volume === 'number' ? s.volume : 0.6); } catch {}
    },
    play(action) {
      if (!this.lib || !this.ready) return;
      const s = (Store.data && Store.data.ui && Store.data.ui.sounds) || {};
      if (!s.enabled) return;
      const name = s.map && s.map[action];
      if (!name) return;
      try { this.lib.play(name, { volume: typeof s.volume === 'number' ? s.volume : 0.6 }); } catch (e) { /* noop */ }
    },
    // toca um som pelo NOME da lib (bypass do mapa de ações) — respeita enabled/volume
    playName(name) {
      if (!this.lib || !this.ready) return;
      const s = (Store.data && Store.data.ui && Store.data.ui.sounds) || {};
      if (!s.enabled) return;
      try { this.lib.play(name, { volume: typeof s.volume === 'number' ? s.volume : 0.6 }); } catch (e) { /* noop */ }
    }
  };

