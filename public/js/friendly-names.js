// Friendly Names — toggle para mostrar nomes de componentes no hover (estilo devtools)
//
// Ferramenta de DESENVOLVIMENTO. Fora de localhost o script retorna antes de
// qualquer setup: sem botão, sem tooltip e, principalmente, sem o
// MutationObserver que observa todo o body e decora cada elemento dinâmico
// (custo permanente em produção, sem ganho para o usuário).
// Mesmo padrão de ambiente já usado pelo bloco do Sentry em index.html.
(() => {
  const IS_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!IS_DEV) {
    // remove o botão/tooltip do DOM caso estejam no markup
    document.getElementById('friendly-toggle')?.remove();
    document.getElementById('friendly-tooltip')?.remove();
    return;
  }

  const STORAGE_KEY = 'notethread.friendly';
  let active = localStorage.getItem(STORAGE_KEY) === '1';
  const btn = document.getElementById('friendly-toggle');
  const tooltip = document.getElementById('friendly-tooltip');
  let currentEl = null;

  const updateBtn = () => {
    if (!btn) return;
    btn.classList.toggle('active', active);
    btn.classList.toggle('inactive', !active);
    btn.style.background = active ? '#22c55e' : '#ef4444';
    btn.style.color = '#fff';
    btn.title = active ? 'Desativar Friendly Names' : 'Ativar Friendly Names';
    localStorage.setItem(STORAGE_KEY, active ? '1' : '0');
  };

  const showTooltip = (el) => {
    const name = el.getAttribute('data-friendly-name');
    if (!name || !tooltip) return;
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(c=>c && c!=='hidden').slice(0,2).join('.') : '';
    const extra = id || cls ? ` <span style="opacity:.6;font-weight:400">${id}${cls}</span>` : '';
    tooltip.innerHTML = `${name}${extra}`;
    tooltip.classList.remove('hidden');
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // para elementos grandes (sidebar, canvas), posiciona perto do mouse para não cortar
    const isLarge = rect.height > 200 || rect.width > 400;
    let top, left;
    if (isLarge) {
      top = mouseY + 16;
      left = mouseX + 16;
    } else {
      top = rect.top - 30;
      if (top < 8) top = rect.bottom + 8;
      left = rect.left + rect.width / 2;
    }
    tooltip.style.transform = isLarge ? 'none' : 'translateX(-50%)';
    // mede para prender dentro da janela
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    if (!isLarge) {
      left = left - tw / 2;
    }
    left = Math.max(8, Math.min(left, vw - tw - 8));
    if (top + th > vh - 8) top = Math.max(8, vh - th - 8);
    if (top < 8) top = 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  };

  const hideTooltip = () => {
    if (tooltip) tooltip.classList.add('hidden');
    if (currentEl) {
      currentEl.classList.remove('friendly-highlight');
      currentEl = null;
    }
  };

  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; if (active && currentEl) showTooltip(currentEl); });

  const onMouseOver = (e) => {
    if (!active) return;
    const el = e.target.closest('[data-friendly-name]');
    if (!el || el === currentEl) return;
    if (currentEl) currentEl.classList.remove('friendly-highlight');
    currentEl = el;
    el.classList.add('friendly-highlight');
    showTooltip(el);
  };

  const onMouseOut = (e) => {
    if (!active) return;
    const el = e.target.closest('[data-friendly-name]');
    if (el && el === currentEl) hideTooltip();
  };

  if (btn) {
    btn.classList.add('is-dev'); // só em localhost ele aparece (CSS display:none por padrão)
    updateBtn();
    btn.addEventListener('click', () => {
      active = !active;
      updateBtn();
      if (!active) hideTooltip();
    });
  }

  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);

  // Adiciona nomes granulares para elementos dinâmicos (bolhas por tipo, cadernos, inputs)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        // Bolhas — por tipo de conteúdo
        if (n.classList.contains('bubble') && !n.hasAttribute('data-friendly-name')) {
          const isCheck = n.classList.contains('bubble-checklist');
          const isIdea = n.classList.contains('bubble-idea');
          const snippet = (n.textContent || '').trim().slice(0, 24).replace(/\s+/g, ' ');
          const base = isCheck ? 'Mensagem Checklist' : isIdea ? 'Mensagem Ideia' : n.classList.contains('remote') ? 'Mensagem Recebida' : 'Mensagem Enviada';
          n.setAttribute('data-friendly-name', `${base}: "${snippet}..."`);
          // sub-componentes da bolha
          const meta = n.querySelector('.meta');
          if (meta) meta.setAttribute('data-friendly-name', 'Bolha: timestamp/status');
          const toggle = n.querySelector('.msg-toggle');
          if (toggle) toggle.setAttribute('data-friendly-name', 'Bolha: Menu (▾)');
        }
        if (n.classList.contains('tnode') && !n.hasAttribute('data-friendly-name')) {
          const label = n.querySelector('.label')?.textContent || 'sem nome';
          const isFolder = n.classList.contains('folder-node');
          n.setAttribute('data-friendly-name', `${isFolder ? 'Pasta' : 'Caderno'}: ${label}`);
        }
        // Composer sub-componentes
        if (n.id === 'composer-input') n.setAttribute('data-friendly-name', 'Input: Enviar mensagem');
        if (n.id === 'btn-send') n.setAttribute('data-friendly-name', 'Input: Botão Enviar (→)');
        if (n.id === 'btn-attach') n.setAttribute('data-friendly-name', 'Input: Anexar');
        if (n.closest && n.closest('.md-check')) {
          n.setAttribute('data-friendly-name', 'Checklist: item');
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Inicializa elementos já existentes no DOM
  document.querySelectorAll('#composer-input').forEach(el => el.setAttribute('data-friendly-name', 'Input: Enviar mensagem'));
  document.querySelectorAll('#btn-send').forEach(el => el.setAttribute('data-friendly-name', 'Input: Botão Enviar'));
  document.querySelectorAll('#btn-attach').forEach(el => el.setAttribute('data-friendly-name', 'Input: Anexar'));
  document.querySelectorAll('.fmt-btn').forEach(el => {
    const fmt = el.dataset.fmt;
    el.setAttribute('data-friendly-name', `Input: Formatação ${fmt}`);
  });
  document.querySelectorAll('.search-box').forEach(el => {
    if (!el.hasAttribute('data-friendly-name')) el.setAttribute('data-friendly-name', 'Explorer: Campo de Busca');
  });
})();
