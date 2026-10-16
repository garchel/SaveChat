// Painel de customização do mascote.
//
// Popover ancorado no botão "Mascote" do menu do perfil. O posicionamento
// copia `toggleSettingsPopover` (settings.js): zerar left/top, esconder,
// MEDIR de verdade e clampar nas quatro bordas — a sidebar tem transform e
// transform vira containing block de position:fixed, então o painel mora
// no <body> (partials/menus.txt) e nunca dentro da sidebar.
//
// A preferência vive em `ui.mascot` (escopo do dispositivo, fora de
// SCOPE_KEYS). Toda escrita passa por mascotToStore, que sanitiza antes de
// gravar — storage é dado do usuário e pode estar velho.

import { placeProfilePopover } from '../utils.js';
import { esc } from '../utils.js';
import { mascotFromStore, mascotToStore, mascotAvatarHtml, mascotIconSvg, mascotApplyAll, mascotRandomize, mascotNameUnset, MASCOT_EYES, MASCOT_ACC, MASCOT_MOUTHS } from '../mascot.js';

// rótulos: o id é interno, o texto é o que o usuário lê
const EYE_LABELS = { round: 'Redondos', oval: 'Oval', slit: 'Fenda', sleepy: 'Sonecos', heart: 'Coração', star: 'Estrela', visor: 'Visor' };
const ACC_LABELS = {
  none: 'Nenhum', earCat: 'Gato', earDog: 'Cão', earBunny: 'Coelho', crown: 'Coroa',
  halo: 'Auréola', antenna: 'Antena', cap: 'Boné', headphones: 'Fone', flower: 'Flor', tie: 'Gravata', collar: 'Coleira',
};
const MOUTH_LABELS = { 'm-smile': 'Sorriso', 'm-o': 'Boca o', 'm-flat': 'Reta', 'm-grin': 'Aberto' };

// Monta a fileira de chips UMA VEZ. Não recriar no paint: se o elemento
// clicado fosse substituído no meio do evento, o handler de "clique fora"
// receberia um alvo solto (fora do popover) e fecharia o painel.
// `icon` troca o rótulo de texto pelo desenho da peça (bem mais compacto).
const buildChips = (host, entries, onPick, icon) => {
  if (!host) return;
  host.innerHTML = entries.map(([v, label]) => {
    const inner = icon ? mascotIconSvg(icon, v) : esc(label);
    return `<button type="button" class="mascot-chip${icon ? ' mascot-chip--icon' : ''}" data-v="${v}"`
      + ` title="${esc(label)}" aria-label="${esc(label)}" aria-pressed="false">${inner}</button>`;
  }).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.mascot-chip');
    if (!b || !host.contains(b)) return;
    onPick(b.dataset.v);
  });
};

const pressChips = (host, value) => {
  if (!host) return;
  host.querySelectorAll('.mascot-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
};

const setVar = (el, name, val) => {
  if (!el) return;
  if (val) el.style.setProperty(name, val); else el.style.removeProperty(name);
};

export const MascotPanelMethods = {
  // Paint do painel a partir do estado salvo. Chamado ao abrir e a cada
  // mudança, para os chips refletirem o que está em `ui.mascot`.
_mascotPaint() {
    const cfg = mascotFromStore();
    const $ = (id) => document.getElementById(id);

    // os chips-ícone são irmãos do .ai-av, então não herdam as variáveis
    // inline dele — publicamos na raiz do painel para eles acompanharem
    const pop = $('mascot-popover');
    if (pop) {
      setVar(pop, '--mascot-c1', cfg.bodyA);
      setVar(pop, '--mascot-c2', cfg.bodyB);
      setVar(pop, '--mascot-eye', cfg.eyeColor);
      setVar(pop, '--mascot-acc', cfg.accColor);
    }

    const prev = $('mascot-preview-av');
    if (prev) prev.innerHTML = mascotAvatarHtml('idle', cfg);
    const shell = prev && prev.querySelector('.ai-av');
    const nameOut = $('mascot-preview-name');
    if (nameOut) nameOut.textContent = cfg.name;

    const nameField = $('mascot-name');
    if (nameField && document.activeElement !== nameField) nameField.value = cfg.name;

    // cores: vazio = herda o tema; o picker mostra a cor efetiva
    const pick = (id, chosen, varName) => {
      const el = $(id);
      if (!el) return;
      el.value = chosen || rgbToHex(resolveVar(shell, varName)) || '#888888';
    };
    pick('mascot-c1', cfg.bodyA, '--ai-av-c1');
    pick('mascot-c2', cfg.bodyB, '--ai-av-c2');
    pick('mascot-eye-color', cfg.eyeColor, '--ai-av-eye');
    pick('mascot-acc-color', cfg.accColor, '--ai-av-acc');

    const shape = $('mascot-shape');
    if (shape) shape.value = cfg.shape;

    pressChips($('mascot-eyes'), cfg.eyes);
    pressChips($('mascot-acc'), cfg.acc);
    pressChips($('mascot-mouth'), cfg.mouth);
    pressChips($('mascot-blush'), cfg.blush);
  },

  // toda mudança: grava, repinta o painel e aplica na tela
  _mascotSet(patch) {
    mascotToStore(patch);
    this._mascotPaint();
    mascotApplyAll();
  },

  // Abre o painel na MESMA posição do popover de Configurações: os dois usam
// placeProfilePopover (utils.js) — borda inferior encostando no botão de
// perfil, crescendo para cima, altura limitada ao espaço disponível.
openMascotPanel() {
    const p = document.getElementById('mascot-popover');
    if (!p) return;
    this._mascotPaint();
    placeProfilePopover(p, { fallbackIds: ['profile-mascot'] });
  },

  closeMascotPanel() {
    document.getElementById('mascot-popover')?.classList.add('hidden');
  },

  // Chamado no login (renderAuthOrApp): se o usuário nunca escolheu um nome,
  // pergunta. Cancelar deixa o padrão e o modal volta no próximo login —
  // é a leitura literal de "ainda não tiver configurado o nome".
  askMascotName() {
    const cfg = mascotFromStore();
    const body = `
      <p class="modal-lead">O assistente vive junto com as suas notas — ele já
      sabe o que você escreveu.</p>
      <ul class="modal-points">
        <li>Resuma uma conversa ou procure algo que você anotou</li>
        <li>Crie e organize notas no caderno que você escolher</li>
        <li>Planeje o dia e redija junto com você</li>
        <li>Fale, se preferir — o microfone transcreve</li>
      </ul>
      <div class="mascot-modal-preview">${mascotAvatarHtml('idle', cfg)}</div>
      <p class="modal-lead">Escolha um nome para ele. É o que aparece no
      explorador e no título da conversa — dá para trocar quando quiser em
      <strong>Mascote</strong>, no menu do perfil.</p>
      <input type="text" id="mascot-modal-name" maxlength="18" autocomplete="off"
             placeholder="${esc(cfg.name)}" aria-label="Nome do mascote" />`;
    this.showModal('Como ele se chama?', body, () => {
      const el = document.getElementById('mascot-modal-name');
      const v = (el && el.value.trim() ? el.value.trim().slice(0, 18) : '');
      this.closeModal();
      if (!v) return;                       // cancelou/sem nome: mantém o padrão
      mascotToStore({ name: v });
      this.closeMascotPanel();
      this.renderTree();
    });
    const input = document.getElementById('mascot-modal-name');
    if (input) {
      input.value = '';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.dom.modalOk.click(); }
      });
      requestAnimationFrame(() => input.focus());
    }
  },

// Liga os controles uma vez, no boot.
  bindMascotPanel() {
    const $ = (id) => document.getElementById(id);
    const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

    buildChips($('mascot-eyes'), Object.keys(MASCOT_EYES).map((k) => [k, EYE_LABELS[k] || k]),
      (v) => this._mascotSet({ eyes: v }), 'eyes');
    buildChips($('mascot-acc'), Object.keys(MASCOT_ACC).map((k) => [k, ACC_LABELS[k] || k]),
      (v) => this._mascotSet({ acc: v }), 'acc');
    buildChips($('mascot-mouth'), Object.keys(MASCOT_MOUTHS).map((k) => [k, MOUTH_LABELS[k] || k]),
      (v) => this._mascotSet({ mouth: v }), 'mouth');

    on('mascot-name', 'input', (e) => {
      // o nome é texto livre: grava direto (sem sanitizer de tamanho) mas
      // com o mesmo recorte do mascotSanitize
      const v = e.target.value.slice(0, 18);
mascotToStore({ name: v || 'Bento' });
      const out = $('mascot-preview-name');
      if (out) out.textContent = v || 'Bento';
      mascotApplyAll();
      // o item do explorador usa o nome do mascote como rótulo
      this.queueRenderTree();
    });

    on('mascot-c1', 'input', (e) => this._mascotSet({ bodyA: e.target.value }));
    on('mascot-c2', 'input', (e) => this._mascotSet({ bodyB: e.target.value }));
    on('mascot-eye-color', 'input', (e) => this._mascotSet({ eyeColor: e.target.value }));
    on('mascot-acc-color', 'input', (e) => this._mascotSet({ accColor: e.target.value }));
    // Sortear: nova aparência inteira, sem mexer no nome (é identidade escolhida
    // pelo usuário, não característica sorteável).
    on('mascot-randomize', 'click', () => {
      this._mascotSet(mascotRandomize());
      const av = document.querySelector('#mascot-preview-av .ai-av');
      if (av) { av.classList.remove('ai-av-pop'); void av.offsetWidth; av.classList.add('ai-av-pop'); }
    });
    on('mascot-shape', 'change', (e) => this._mascotSet({ shape: e.target.value }));

    on('mascot-blush', 'click', (e) => {
      const b = e.target.closest('.mascot-chip');
      if (!b) return;
      this._mascotSet({ blush: b.dataset.v });
    });

    // clique fora fecha
    document.addEventListener('click', (e) => {
      const p = $('mascot-popover');
      const a = $('profile-mascot');
      if (!p || p.classList.contains('hidden')) return;
      if (!p.contains(e.target) && !a?.contains(e.target)) this.closeMascotPanel();
    });
  },
};

// getComputedStyle NÃO resolve custom properties: devolve o texto literal
// ("var(--mascot-eye, color-mix(...))"), não a cor. Para descobrir a cor
// efetiva, aplicamos a variável numa propriedade REAL do próprio avatar e
// lemos o resultado — tem de ser dentro do .ai-av, porque é lá que
// --ai-av-* está definida (no <body> a variável não existe e cai no herdado).
const resolveVar = (el, varName) => {
  if (!el) return '';
  const prev = el.style.color;
  el.style.color = `var(${varName})`;
  const v = getComputedStyle(el).color;
  el.style.color = prev;
  return v || '';
};

// O Chrome resolve color-mix() no formato moderno "color(srgb 0.86 0.49 0.41)"
// (floats de 0 a 1). Também pode devolver "rgb(r, g, b)". O <input type=color>
// só aceita #rrggbb, então normalizamos os dois formatos.
function rgbToHex(v) {
  const s = String(v || '').trim();
  let m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) {
    return '#' + [1, 2, 3]
      .map((i) => Math.round(Math.max(0, Math.min(255, parseFloat(m[i])))).toString(16).padStart(2, '0'))
      .join('');
  }
  m = s.match(/^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (m) {
    return '#' + [1, 2, 3]
      .map((i) => Math.round(Math.max(0, Math.min(1, parseFloat(m[i]))) * 255).toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}