import { $, hideWithExit } from '../utils.js';
import { CUELUME_SOUNDS, Sound } from '../sound.js';
import { Store } from '../store.js';
import { Sync, USE_SUPABASE } from '../sync-supabase.js';
import { buildPattern } from '../bg-patterns.js';
import { setPetals } from '../petals.js';

export const SettingsMethods = {
bindSettings() {
      // Botão de configurações da barra lateral (nav) — único gatilho do popover
      const anchor = this.dom.navSettings || this.dom.btnSettings;
      if (anchor) {
        anchor.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleSettingsPopover();
        });
      }
      document.addEventListener('click', (e) => {
        const p = this.dom.settingsPopover;
        if (!p.classList.contains('hidden') && !p.contains(e.target) && !anchor?.contains(e.target)) {
          p.classList.add('hidden');
        }
      });
      const p = this.dom.settingsPopover;
      // tema + ações data-set
      p.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => this.handleSetting(b.dataset.set, b.dataset.val)));
      // tema ativo
      const theme = (Store.data && Store.data.ui && Store.data.ui.theme) || 'peach';
      p.querySelectorAll('[data-set="theme"]').forEach((b) => b.classList.toggle('active', b.dataset.val === theme));
      // ordenação ativa
      const sort = (Store.data && Store.data.ui && Store.data.ui.sort) || 'recent';
      p.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === sort));
      // densidade ativa
      const density = (Store.data && Store.data.ui && Store.data.ui.density) || 'comfortable';
      document.documentElement.dataset.density = density;
      p.querySelectorAll('[data-set="density"]').forEach((b) => b.classList.toggle('active', b.dataset.val === density));
      // fonte salva (aplicada no boot para toda a interface)
      const savedFont = (Store.data && Store.data.ui && Store.data.ui.fontFamily) || '';
      if (savedFont) document.documentElement.style.setProperty('--app-font', savedFont);
      // fundo padrão da área principal (aplicado no boot, com escala do glifo)
      const SIZES_BOOT = [0.6, 0.8, 1.0, 1.3, 1.7, 2.2];
      const clampScale = (v) => {
        const n = parseFloat(v);
        if (isNaN(n)) return 1;
        return SIZES_BOOT.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, SIZES_BOOT[2]);
      };
      const savedBg = (Store.data && Store.data.ui && Store.data.ui.chatBgPattern) || '';
      const savedScaleBoot = clampScale((Store.data && Store.data.ui && Store.data.ui.chatBgScale) || 1);
      const chatEl = document.querySelector('.chat');
      if (chatEl) {
        if (savedBg) {
          chatEl.dataset.bg = savedBg;
          chatEl.style.setProperty('--pattern-image', buildPattern(savedBg, savedScaleBoot));
        }
      }
      // aplica o tema salvo (resolve "auto")
      this.applyTheme();
      // reage a mudanças de tema do sistema quando em "auto"
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          const t = (Store.data && Store.data.ui && Store.data.ui.theme) || 'peach';
          if (t === 'auto') this.applyTheme();
        });
      }

      // ---- Sons (cuelume) ----
      Sound.load();
      const s = (Store.data.ui && Store.data.ui.sounds) || { enabled: false, volume: 0.6, map: {} };
      const en = $('#sound-enabled'); if (en) en.checked = !!s.enabled;
      const vol = $('#sound-volume'); if (vol) vol.value = (typeof s.volume === 'number' ? s.volume : 0.6);
      // ---- Checklists: ocultar concluídos ----
      const hd = $('#chk-hide-done');
      if (hd) {
        hd.checked = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
        hd.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.hideDoneChecks = hd.checked; Store.save();
          if (this.activeThread) { this.renderedClientIds = new Set(); this.renderMessages(true); }
        });
      }
      // ---- Cabeçalho: usar a cor do caderno ----
      const hm = $('#hdr-match-color');
      if (hm) {
        hm.checked = !!(Store.data.ui && Store.data.ui.headerMatchColor);
        hm.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.headerMatchColor = hm.checked; Store.save();
          if (this.activeThread) this.applyThreadHeaderColor(this.activeThread);
        });
      }
      // ---- Pétalas flutuantes (ambiente cozy, padrão OFF) ----
      const pt = $('#chk-petals');
      if (pt) {
        pt.checked = !!(Store.data.ui && Store.data.ui.petals);
        pt.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.petals = pt.checked; Store.save();
          setPetals(pt.checked);
        });
      }
      // ---- Fonte da interface ----
      const fs = $('#font-select');
      if (fs) {
        const fsSaved = (Store.data.ui && Store.data.ui.fontFamily) || '';
        fs.value = fsSaved;
        if (fsSaved) { document.documentElement.style.setProperty('--app-font', fsSaved); if (window.loadFontFamily) window.loadFontFamily(fsSaved); }
        const preview = $('#font-preview');
        if (preview) preview.style.fontFamily = fsSaved || 'var(--app-font)';
        fs.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.fontFamily = fs.value;
          Store.save();
          document.documentElement.style.setProperty('--app-font', fs.value || '');
          if (fs.value && window.loadFontFamily) window.loadFontFamily(fs.value); // subset lazy
          if (preview) preview.style.fontFamily = fs.value || 'var(--app-font)';
        });
      }
      // ---- Fundo padrão da área principal ----
      // O glifo escala DENTRO do tile fixo de 320px (gerado via JS): mudar o tamanho
      // NÃO altera o espaçamento — não é zoom. A escala é SEMPRE clamped em [0.5, 3]
      // para evitar glifo estourando o tile ao trocar de tema com valor salvo inválido.
      const bgWrap = $('#bg-patterns');
      if (bgWrap) {
        const chatEl = document.querySelector('.chat');
        const clampScale = (v) => {
          const n = parseFloat(v);
          if (isNaN(n)) return 1;
          return Math.max(0.5, Math.min(3, n));
        };
        const applyPattern = (val, scale) => {
          if (!chatEl) return;
          if (val) chatEl.dataset.bg = val; else delete chatEl.dataset.bg;
          if (val) chatEl.style.setProperty('--pattern-image', buildPattern(val, clampScale(scale || 1)));
          else chatEl.style.removeProperty('--pattern-image');
          bgWrap.querySelectorAll('.bg-pat').forEach((b) => b.classList.toggle('active', b.dataset.bg === val));
        };
        const savedPattern = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
        const savedScale = clampScale((Store.data.ui && Store.data.ui.chatBgScale) || 1);
        applyPattern(savedPattern, savedScale);
        bgWrap.querySelectorAll('.bg-pat').forEach((b) => b.addEventListener('click', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.chatBgPattern = b.dataset.bg; Store.save();
          // re-ler a escala ATUAL do slider (não o valor salvo antigo) e re-renderizar
          const cur = clampScale(($('#pat-size') || {}).value || savedScale);
          applyPattern(b.dataset.bg, cur);
        }));
        // ---- Tamanho dos ícones do padrão: 6 tamanhos fixos ----
        const SIZES = [0.6, 0.8, 1.0, 1.3, 1.7, 2.2];
        const toIdx = (v) => {
          const n = parseFloat(v);
          if (isNaN(n)) return 2;
          let best = 0, bestDiff = Infinity;
          SIZES.forEach((s, i) => { const d = Math.abs(s - n); if (d < bestDiff) { bestDiff = d; best = i; } });
          return best;
        };
        const toVal = (i) => SIZES[Math.max(0, Math.min(5, parseInt(i, 10) || 2))];
        const slider = $('#pat-size');
        const resetBtn = $('#pat-size-reset');
        if (slider) {
          slider.value = String(toIdx(savedScale));
          slider.addEventListener('input', () => {
            const v = toVal(slider.value);
            const pat = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
            if (chatEl && pat) chatEl.style.setProperty('--pattern-image', buildPattern(pat, v));
            clearTimeout(slider._t);
            slider._t = setTimeout(() => {
              Store.data.ui = Store.data.ui || {};
              Store.data.ui.chatBgScale = v; Store.save();
            }, 200);
          });
        }
        if (resetBtn) resetBtn.addEventListener('click', () => {
          const fixed = SIZES[2];
          if (slider) slider.value = String(toIdx(fixed));
          const pat = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
          if (chatEl && pat) chatEl.style.setProperty('--pattern-image', buildPattern(pat, fixed));
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.chatBgScale = 1; Store.save();
        });
      }
      // ---- Limpar cache do app (desregistra SW + caches) ----
      const clearSw = $('#btn-clear-sw');
      if (clearSw) {
        clearSw.addEventListener('click', async () => {
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              regs.forEach((r) => r.unregister());
            }
            if (window.caches && caches.keys) {
              const ks = await caches.keys();
              await Promise.all(ks.map((k) => caches.delete(k)));
            }
            this.toast('Cache limpo — recarregando…', { kind: 'info', duration: 1500 });
            setTimeout(() => location.reload(), 1200);
          } catch (err) {
            console.error('[settings] falha ao limpar cache:', err);
          }
        });
      }
      // preenche selects com a lista de sons do cuelume
      const selects = p.querySelectorAll('select[data-sound]');
      selects.forEach((sel) => {
        const action = sel.dataset.sound;
        CUELUME_SOUNDS.forEach((name) => {
          const o = document.createElement('option'); o.value = name; o.textContent = name;
          sel.appendChild(o);
        });
        sel.value = (s.map && s.map[action]) || '';
        sel.addEventListener('change', () => {
          Store.data.ui.sounds = Store.data.ui.sounds || { enabled: false, volume: 0.6, map: {} };
          Store.data.ui.sounds.map = Store.data.ui.sounds.map || {};
          Store.data.ui.sounds.map[action] = sel.value || undefined;
          Store.save();
          if (sel.value) { Sound.play(action); } // pré-escuta
        });
      });
      if (en) en.addEventListener('change', () => {
        Store.data.ui.sounds = Store.data.ui.sounds || {};
        Store.data.ui.sounds.enabled = en.checked; Store.save(); Sound.apply();
        if (en.checked) Sound.play('create');
      });
      if (vol) vol.addEventListener('input', () => {
        Store.data.ui.sounds = Store.data.ui.sounds || {};
        Store.data.ui.sounds.volume = parseFloat(vol.value); Store.save(); Sound.apply();
      });
    },

    applyTheme() {
      let theme = (Store.data && Store.data.ui && Store.data.ui.theme) || 'peach';
      // temas removidos: auto → peach; bubblegum → napolitano (muito parecido com sakura)
      if (theme === 'auto') theme = 'peach';
      if (theme === 'bubblegum') { theme = 'napolitano'; Store.data.ui.theme = theme; Store.save(); }
      const resolved = theme;
      document.documentElement.dataset.theme = resolved;
      // Toda logo do app acompanha o tema (variantes em assets/themes/):
      // a da sidebar, a do aviso "Nenhuma conversa selecionada", a do login e a
      // do splash. Antes só a sidebar mudava — as outras ficavam na cor fixa.
      const logoSrc = `assets/themes/logo-${resolved}.svg`;
      ['.brand-mark-img', '.nt-logo', '.brand-logo-img', '#boot-splash .boot-mark img'].forEach((sel) => {
        document.querySelectorAll(sel).forEach((img) => { img.src = logoSrc; });
      });
      // favicon acompanha o tema
      const fav = document.querySelector('link[rel="icon"]');
      if (fav) fav.href = logoSrc;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const colors = { lavender:'#7c5cff', dark:'#191622', mint:'#1faa86', peach:'#ff7a59', ocean:'#2b8fd6', midnight:'#0e1525', sakura:'#e86a8a', napolitano:'#e0567a' };
        meta.setAttribute('content', colors[resolved] || '#7c5cff');
      }
      // regenera o padrão de fundo com a cor do novo tema (escala clamped, sem estourar o tile)
      const chatEl = document.querySelector('.chat');
      const pat = (Store.data.ui && Store.data.ui.chatBgPattern) || '';
      const rawScale = parseFloat((Store.data.ui && Store.data.ui.chatBgScale) || 1);
      if (chatEl && pat) {
        const scale = isNaN(rawScale) ? 1 : Math.max(0.5, Math.min(3, rawScale));
        chatEl.style.setProperty('--pattern-image', buildPattern(pat, scale));
      }
    },

_processImport(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { this.toast('Arquivo inválido — não é um JSON de backup', { kind: 'error' }); return; }
  const threads = parsed.threads, folders = parsed.folders, notes = parsed.notes;
  const shapeOk =
    (threads === undefined || (threads && typeof threads === 'object' && !Array.isArray(threads))) &&
    (folders === undefined || (folders && typeof folders === 'object' && !Array.isArray(folders))) &&
    (notes === undefined || notes && typeof notes === 'object');
  if (!shapeOk || (!threads && !folders && !notes)) {
    this.toast('Backup não reconhecido — esperado { threads, folders, notes }', { kind: 'error' });
    return;
  }
  // merge: mantém o que já existe localmente; adiciona o que só existe no backup
  const mergeMap = (local, incoming) => {
    if (!incoming) return local;
    const out = Object.assign({}, local);
    for (const k of Object.keys(incoming)) if (!(k in out)) out[k] = incoming[k];
    return out;
  };
  const before = Object.values(Store.data.notes).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
  Store.data.threads = mergeMap(Store.data.threads, threads);
  Store.data.folders = mergeMap(Store.data.folders, folders);
  // notes: mapa threadId → array; merge por id dentro de cada thread
  if (notes) {
    for (const tid of Object.keys(notes)) {
      const incArr = Array.isArray(notes[tid]) ? notes[tid] : [];
      const curArr = Array.isArray(Store.data.notes[tid]) ? Store.data.notes[tid] : [];
      const byId = new Map(curArr.map((n) => [n.id, n]));
      for (const n of incArr) if (!byId.has(n.id)) byId.set(n.id, n);
      Store.data.notes[tid] = [...byId.values()].sort((a, b) => (a.sortOrder || a.ts) - (b.sortOrder || b.ts));
    }
  }
  Store.save();
  const after = Object.values(Store.data.notes).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
  this.renderTree();
  this.toast(`Backup importado ✓ (${Math.max(0, after - before)} novas notas)`, { kind: 'success', duration: 3200 });
},

handleSetting(act, val) {
      if (act === 'theme') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.theme = val; Store.save();
        // M8: crossfade via View Transitions API quando suportado (fallback: troca seca)
        if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          document.startViewTransition(() => this.applyTheme());
        } else {
          this.applyTheme();
        }
        this.dom.settingsPopover.querySelectorAll('[data-set="theme"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'sort') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.sort = val; Store.save();
        this.renderTree();
        this.dom.settingsPopover.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'density') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.density = val; Store.save();
        document.documentElement.dataset.density = val;
        this.dom.settingsPopover.querySelectorAll('[data-set="density"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'export') {
        const data = JSON.stringify({ threads: Store.data.threads, folders: Store.data.folders, notes: Store.data.notes }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'savechat.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (act === 'export-md') {
        // Exportação Markdown: cada conversa vira um .md legível (checklists, tags, datas)
        const escMd = (s) => String(s || '').replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1');
        const folders = Store.data.folders || {};
        const lines = ['# SaveChat — Backup de conversas', '', `_Gerado em ${new Date().toLocaleString('pt-BR')}_`, ''];
        const threadList = Object.values(Store.data.threads).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (!threadList.length) lines.push('_Nenhuma conversa._');
        for (const t of threadList) {
          const folder = t.folderId && folders[t.folderId];
          lines.push('');
          lines.push('---');
          lines.push('');
          lines.push(`# ${t.name}`);
          const metaBits = [];
          if (folder) metaBits.push(`📁 ${folder.name}`);
          if (t.favorite) metaBits.push('⭐ favorita');
          if (metaBits.length) lines.push('', `*${metaBits.join(' · ')}*`);
          const notes = (Store.data.notes[t.id] || []).slice().sort((a, b) => (a.sortOrder || a.ts) - (b.sortOrder || b.ts));
          if (!notes.length) { lines.push('', '_Sem mensagens._'); continue; }
          for (const n of notes) {
            const dt = new Date(n.ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            lines.push('', `**${dt}**`);
            for (const raw of String(n.text || '').split('\n')) {
              const chk = raw.match(/^\s*\[([ x])\]\s*(.*)$/i);
              if (chk) lines.push(`- [${chk[1].toLowerCase() === 'x' ? 'x' : ' '}] ${chk[2]}`);
              else if (/^#{1,3}\s/.test(raw)) lines.push(raw); // heading já é markdown
              else if (raw.trim()) lines.push('> ' + raw);
              else lines.push('>');
            }
            if (n.tags && n.tags.length) lines.push('', n.tags.map((t) => '`#' + t + '`').join(' '));
            if (n.edited) lines.push('*_(editada)_*');
          }
        }
        lines.push('', '---', '', '_Exportado do SaveChat — suas ideias, como conversas._');
        const mdBlob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        const mdA = document.createElement('a'); mdA.href = URL.createObjectURL(mdBlob);
        mdA.download = 'savechat-' + new Date().toISOString().slice(0, 10) + '.md'; mdA.click();
        setTimeout(() => URL.revokeObjectURL(mdA.href), 1000);
      } else if (act === 'import') {
        const fileInput = document.getElementById('import-file');
        if (!fileInput) return;
        // handler persistente (registrado uma única vez); clique reabre o picker
        if (!fileInput._bound) {
          fileInput._bound = true;
          fileInput.addEventListener('change', () => {
            const f = fileInput.files && fileInput.files[0];
            fileInput.value = ''; // permite re-selecionar o mesmo arquivo
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => { this._processImport(reader.result); };
            reader.readAsText(f);
          });
        }
        fileInput.click();
      } else if (act === 'clear') {
        const body = `<p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja apagar <b>TODAS</b> as conversas, cadernos e notas?</p>
          <p style="font-size:13px;color:var(--text-dim);margin-top:8px">Esta ação não pode ser desfeita e afetará todos os dispositivos sincronizados.</p>`;
        this.showModal('Apagar tudo', body, () => {
          // LB-W3 fix: apaga também no Supabase ANTES de limpar o local,
          // senão o snapshot do Realtime ressincroniza tudo ao recarregar.
          const cleanupLocal = () => {
            Store.data.threads = {}; Store.data.folders = {}; Store.data.notes = {}; Store.save();
            this.activeThread = null; this.renderedClientIds = new Set(); this.oldestTs = null;
            $('#chat-name').textContent = 'Selecione uma conversa'; $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
            $('#empty-state').classList.remove('hidden'); this.dom.btnPin.classList.add('hidden');
            this.setChatActiveUi(false);
            this.renderTree();
            this.closeModal();
            this.dom.settingsPopover.classList.add('hidden');
            this.toast('Todos os dados foram apagados', { kind: 'success' });
          };
          if (Sync.deleteAllRemote && USE_SUPABASE) {
            Sync.deleteAllRemote().then((res) => {
              if (!res.ok) console.warn('[clear] remoção remota falhou:', res.reason);
              cleanupLocal();
            });
          } else {
            cleanupLocal();
          }
        });
        const okBtn2 = this.dom.modalOk;
        okBtn2.classList.remove('primary'); okBtn2.classList.add('danger');
        okBtn2.textContent = 'Apagar tudo';
      } else if (act === 'reconnect') {
        try { if (Sync.ws) Sync.ws.close(); } catch {}
        Sync.connect();
        this.dom.settingsPopover.classList.add('hidden');
      }
    },

    toggleSettingsPopover() {
      const p = this.dom.settingsPopover;
      if (!p.classList.contains('hidden')) { hideWithExit(p); return; }
      // ancora no perfil (novo) ou nos botões legados
      const anchor = document.getElementById('profile-btn') || this.dom.navSettings || this.dom.btnSettings;
      if (!anchor) return;
      // reset completo do estado do ciclo anterior (maxHeight/overflow "travados")
      p.style.maxHeight = '';
      p.style.overflowY = '';
      // M7: nasce a partir da âncora que abriu
      const ar = anchor.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      p.style.transformOrigin = Math.max(0, Math.min(ar.left - pr.left + ar.width / 2, pr.width)) + 'px ' +
                                (ar.top < pr.top ? '0' : Math.max(0, Math.min(ar.top - pr.top, pr.height))) + 'px';
      p.classList.remove('hidden');
      p.style.visibility = 'hidden'; // mede sem piscar na posição errada
      const r = anchor.getBoundingClientRect();
      const pw = Math.min(340, window.innerWidth - 16);
      // altura real do conteúdo (o popover cresce conforme o tema/seções)
      p.style.left = '0px'; p.style.top = '0px';
      const ph = p.offsetHeight || 460;
      const margin = 8;
      const maxH = window.innerHeight - margin * 2;
      // horizontal: prefere ao lado direito da nav; se não couber, à esquerda; nunca sai da tela
      let left = r.right + 12;
      if (left + pw > window.innerWidth - margin) left = Math.max(margin, r.left - pw - 12);
      if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
      // vertical: SEMPRE cabe dentro da tela com rolagem interna quando preciso
      let top = Math.min(r.bottom + 8, window.innerHeight - margin);
      if (ph > maxH) {
        // popover maior que a tela → ocupa a tela toda com scroll interno
        top = margin;
        p.style.maxHeight = maxH + 'px';
        p.style.overflowY = 'auto';
      } else {
        // popover cabe: se estourar embaixo, sobe; clamp nas duas bordas
        if (top + ph > window.innerHeight - margin) top = window.innerHeight - ph - margin;
        if (top < margin) top = margin;
        p.style.maxHeight = '';
        p.style.overflowY = '';
      }
      p.style.left = left + 'px';
      p.style.top = top + 'px';
      p.style.visibility = '';
    },
};
