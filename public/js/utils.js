// Utilitários compartilhados
export const PAGE_SIZE = 25;

// helper para feedback tátil (mobile)
export function haptic(type) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const patterns = {
    light: [10],
    medium: [20],
    heavy: [30],
    success: [10, 50, 10],
    error: [30, 30, 30],
    delete: [15, 30, 15],
  };
  try { navigator.vibrate(patterns[type] || patterns.light); } catch {}
}

export const $ = (s) => document.querySelector(s);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const now = () => Date.now();

/* M2 fix: saída animada p/ popovers, modais e ctx-menus.
   Adiciona .leaving (150ms ease-in) antes do .hidden — nada mais some seco.
   Retorna imediatamente; o elemento é escondido ao fim da animação. */
export function hideWithExit(el) {
  if (!el || el.classList.contains('hidden') || el._leaving) return;
  el._leaving = true;
  el.classList.add('leaving');
  const finish = () => {
    // se foi reaberto durante a saída, aborta o hide (evita modal fantasma)
    if (el._reopenRequested) { el._reopenRequested = false; el._leaving = false; el.classList.remove('leaving'); return; }
    el.classList.add('hidden');
    el.classList.remove('leaving');
    el._leaving = false;
  };
  // prefers-reduced-motion derruba a duração para ~0 → cai no timeout
  const dur = parseFloat(getComputedStyle(el).getPropertyValue('--exit-duration')) || 150;
  setTimeout(finish, dur);
}

/* Posiciona um popover ancorado no botão de perfil (#profile-btn), ABRINDO
   PARA CIMA: a borda inferior encosta no topo do botão e o painel cresce
   para cima, com altura limitada ao espaço disponível e scroll interno.

   Compartilhado por Configurações e Mascote — antes cada um tinha a própria
   matemática e abria em y diferentes, e ambos preenchiam a janela inteira.
   Mede de verdade (nunca estimativa), mostra invisível enquanto mede e trava
   nas quatro bordas. */
export function placeProfilePopover(pop, opts = {}) {
  if (!pop) return;
  const ids = ['profile-btn', ...(opts.fallbackIds || [])];
  const anchor = ids.map((i) => document.getElementById(i)).find(Boolean);
  if (!anchor) return;

  const margin = 8;
  const gap = 8;

  // reset do ciclo anterior (max-height/overflow "travados")
  pop.style.maxHeight = '';
  pop.style.overflowY = '';
  pop.style.left = '0px';
  pop.style.top = '0px';

  const ar = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  pop.style.transformOrigin =
    Math.max(0, Math.min(ar.left - pr.left + ar.width / 2, pr.width)) + 'px ' + pr.height + 'px';

  pop.classList.remove('hidden');
  pop.style.visibility = 'hidden';          // mede sem piscar no lugar errado

  const pw = Math.min(opts.maxWidth || 340, window.innerWidth - 16);
  pop.style.width = pw + 'px';

  const ph = pop.offsetHeight || 460;
  // espaço que existe ACIMA do botão, com folga para as duas pontas
  const roomAbove = Math.max(160, ar.top - margin - gap);
  const maxH = Math.min(window.innerHeight - margin * 2, roomAbove);

  // horizontal: ao lado da sidebar; se não couber, sobrepõe a própria sidebar
  let left = ar.right + 12;
  if (left + pw > window.innerWidth - margin) left = Math.max(margin, ar.left - pw - 12);
  if (left + pw > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - pw - margin);

  // vertical: borda inferior SEMPRE logo acima do botão
  let height = ph;
  if (height > maxH) {
    height = maxH;
    pop.style.maxHeight = height + 'px';
    pop.style.overflowY = 'auto';
  }
  let top = ar.top - gap - height;
  if (top < margin) {
    top = margin;
    // sobra abaixo do botão? então usa e cresce para baixo, encostando nele
    const roomBelow = window.innerHeight - ar.bottom - gap - margin;
    if (height < roomBelow && ph <= roomBelow) {
      top = ar.bottom + gap;
      pop.style.maxHeight = '';
      pop.style.overflowY = '';
      height = ph;
    }
  }

  pop.style.left = left + 'px';
  pop.style.top = Math.round(top) + 'px';
  pop.style.visibility = '';
}

