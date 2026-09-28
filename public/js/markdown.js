import { esc } from './utils.js';

  // Renderiza markdown básico e SEGURO (escapa HTML primeiro, depois aplica).
  // Suporta: **negrito**, *itálico*, `código`, #tags (mantidas como chip),
  // listas (- ou * por linha), e quebras de linha. Não faz HTML cru passar.
  export const renderMarkdown = (raw, hideDone) => {
    if (!raw) return '';
    // 1) escapa tudo (sem risco de XSS)
    let s = esc(raw);
    // 2) código inline `...`  → <code> (antes do resto, para não confundir com *)
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    // 3) negrito **...** e __...__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // 4) itálico *...* e _..._
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    // 4.5) menções @[Nome](t:id) → chip clicável que abre a thread
    s = s.replace(/@\[([^\]]+)\]\(t:([a-z0-9]+)\)/gi,
      (_, name, tid) => `<button type="button" class="mention" data-tid="${tid}">@${name}</button>`);
    // 5) #tags NÃO são convertidas aqui — são renderizadas em bloco separado (.bubble-tags) no bubbleEl
    // 6) listas: linhas começando com - ou * (recuo de 2 espaços = sub-lista)
    // 7) checklist: linhas começando com [ ] ou [x]
    // 7.5) listas numeradas: linhas começando com "1. " etc.
    // v1.8.0: pilha de aninhamento — sub-listas ficam DENTRO do <li> do item pai,
    // checkboxes aninhadas recebem data-chk sequencial (índice do texto global)
    const lines = s.split('\n');
    let html = '';
    // pilha: { kind:'ul'|'ol'|'chk', depth }
    const stack = [];
    let chkIndex = 0;
    const top = () => stack[stack.length - 1] || null;
    const closeTo = (depth) => {
      while (stack.length && stack[stack.length - 1].depth > depth) {
        closeLi();
        const k = stack.pop();
        html += (k.kind === 'chk') ? '</div>' : (k.kind === 'ol' ? '</ol>' : '</ul>');
      }
    };
    const open = (kind, depth) => {
      // troca de tipo no MESMO nível (chk→ol, ul→chk…): fecha a anterior antes
      while (top() && top().depth === depth && top().kind !== kind) {
        closeLi();
        const k = stack.pop();
        html += (k.kind === 'chk') ? '</div>' : (k.kind === 'ol' ? '</ol>' : '</ul>');
      }
      html += (kind === 'chk') ? '<div class="md-checklist">' : (kind === 'ol' ? '<ol class="md-olist">' : '<ul class="md-list">');
      stack.push({ kind, depth });
    };
    // fecha o item de lista aberto (sub-lista vai dentro do <li> do pai)
    let liOpen = false;
    const closeLi = () => { if (liOpen) { html += '</li>'; liOpen = false; } };
    for (const line of lines) {
      const cm = line.match(/^(\s*)\[( |x)\]\s*(.*)$/i);
      if (cm) {
        const depth = Math.floor(cm[1].replace(/\t/g, '  ').length / 2);
        closeTo(depth);
        // mesmo tipo mais fundo = sub-lista aninhada (ex.: "  [ ]" sob um "[ ]")
        if (!top() || top().kind !== 'chk' || top().depth < depth) { closeLi(); open('chk', depth); }
        const done = cm[2].toLowerCase() === 'x';
        const idx = chkIndex++;
        if (hideDone && done) continue; // oculto: mantém o índice p/ mapear o texto
        html += `<span class="md-check${done ? ' done' : ''}"><input type="checkbox" data-chk="${idx}" ${done ? 'checked' : ''}/><span>${cm[3]}</span></span>`;
        continue;
      }
      const om = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
      if (om) {
        const depth = Math.floor(om[1].replace(/\t/g, '  ').length / 2);
        closeTo(depth);
        if (!top() || top().kind !== 'ol' || top().depth < depth) { closeLi(); open('ol', depth); }
        else closeLi();
        html += `<li><span class="md-ol-num">${om[2]}.</span> ${om[3]}`;
        liOpen = true;
        continue;
      }
      const m = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (m) {
        const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
        closeTo(depth);
        if (!top() || top().kind !== 'ul' || top().depth < depth) { closeLi(); open('ul', depth); }
        else closeLi();
        html += `<li>${m[2]}`;
        liOpen = true;
        continue;
      }
      // linha de texto: fecha tudo e imprime
      closeTo(-1);
      html += line + '<br/>';
    }
    closeTo(-1);
    // remove <br/> solitário no final
    html = html.replace(/<br\/>\s*$/, '');
    return html;
  };

