// Listas e checklists: continuação no Enter, Tab/Shift+Tab para indentar e
// desindentar, e a reconstrução do editor a partir do markdown.
import { $ } from '../utils.js';

export const ComposerListsMethods = {
    _caretList(ta) {
      const sel = getSelection();
      if (!sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node || !ta.contains(node)) return null;
      const l = node.closest && node.closest('ul, ol');
      return (l && ta.contains(l)) ? l : null;
    },

    // Enter em lista: dividimos no caret e continuamos a lista no novo item
    // (shift+enter no composer tem preventDefault — o nativo não roda). Comportamento
    // de apps de nota: "Enter em item vazio = sair da lista"
    _listContinuation(ta) {
      // checklist: continuação CUSTOM — o nativo cria o novo item SEM o input
      // de checkbox; aqui dividimos no caret e inserimos a próxima checkbox
      if (this._checklistContinuation(ta)) return true;
      const list = this._caretList(ta);
      if (!list) return false;
      const sel = getSelection();
      const sc = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
      const li = sc ? (sc.nodeType === 1 ? (sc.closest && sc.closest('li')) : (sc.parentElement && sc.parentElement.closest('li'))) : null;
      const text = li ? li.textContent.replace(/\u200B/g, '') : '';
      if (li && text.trim() === '') {
        // item vazio: sai da lista — remove o li (e a lista, se esvaziar) e
        // posiciona o caret no fim do item anterior (ou onde a lista estava).
        // DOM direto em vez de execCommand: determinístico e sem dependência de foco
        const prev = li.previousElementSibling;
        const next = li.nextElementSibling;
        li.remove();
        let anchor = null;
        if (!list.querySelector('li')) {
          anchor = document.createTextNode('');
          list.parentNode.insertBefore(anchor, list);
          list.remove();
        }
        const r = document.createRange();
        if (anchor) r.setStart(anchor, 0); // lista esvaziou e foi removida: prev/next estão órfãos
        else if (prev) { r.selectNodeContents(prev); r.collapse(false); }
        else if (next) { r.selectNodeContents(next); r.collapse(true); }
        else { r.selectNodeContents(ta); r.collapse(false); }
        sel.removeAllRanges(); sel.addRange(r);
        return true;
      }
      // item com conteúdo: divide no caret e cria o próximo item da lista
      return this._splitListItem(list, li, sel);
    },

    // divide o <li> no caret: conteúdo após o caret migra para um novo <li>
    // vazio logo abaixo; caret fica no novo item (continuação de ul/ol)
    _splitListItem(list, li, sel) {
      const range = sel.getRangeAt(0);
      const tail = range.cloneRange();
      tail.selectNodeContents(li);
      tail.setStart(range.endContainer, range.endOffset);
      const frag = tail.extractContents(); // conteúdo após o caret muda de item
      const nli = document.createElement('li');
      if (frag) nli.appendChild(frag);
      if (!nli.hasChildNodes()) nli.appendChild(document.createTextNode(''));
      list.insertBefore(nli, li.nextSibling);
      const nr = document.createRange();
      nr.selectNodeContents(nli); nr.collapse(true); // caret no início do novo item
      sel.removeAllRanges(); sel.addRange(nr);
      return nli;
    },

    // Shift+Enter em checklist: cria o próximo item COM checkbox (unchecked),
    // movendo o conteúdo após o caret para ele. Item vazio → sai da checklist
    _checklistContinuation(ta) {
      const sel = getSelection(); if (!sel.rangeCount) return false;
      const sc = sel.getRangeAt(0).startContainer;
      const li = sc.nodeType === 1 ? (sc.closest && sc.closest('li')) : (sc.parentElement && sc.parentElement.closest('li'));
      const list = li ? li.parentElement : null;
      if (!li || !list || list.tagName !== 'UL' || !list.classList.contains('md-checklist') || !ta.contains(li)) return false;
      // item vazio: cai no fluxo existente (toggle nativo = sai da lista)
      if (li.textContent.replace(/\u200B/g, '').trim() === '') return false;
      const range = sel.getRangeAt(0);
      const tail = range.cloneRange();
      tail.selectNodeContents(li);
      tail.setStart(range.endContainer, range.endOffset);
      const frag = tail.extractContents(); // conteúdo após o caret muda de item
      const nli = document.createElement('li');
      const cb = document.createElement('input'); cb.type = 'checkbox';
      nli.appendChild(cb);
      if (frag) nli.appendChild(frag);
      // caret nunca antes de um checkbox extraído de volta: se a extração pegou
      // o input do item original (caret no início), devolve
      if (frag && frag.querySelector) {
        const stray = frag.querySelector('input[type=checkbox]');
        if (stray) { stray.remove(); li.insertBefore(stray, li.firstChild); }
      }
      if (!nli.hasChildNodes() || nli.lastChild === cb) nli.appendChild(document.createTextNode(''));
      list.insertBefore(nli, li.nextSibling);
      const nr = document.createRange();
      nr.setStart(nli, 1); nr.collapse(true); // caret após a checkbox do novo item
      sel.removeAllRanges(); sel.addRange(nr);
      return true;
    },

    // ---------- Sub-listas: Tab / Shift+Tab indentam o item atual ----------
    _caretItem(ta) {
      const sel = getSelection();
      if (!sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node || !ta.contains(node)) return null;
      const li = node.closest && node.closest('li');
      return (li && ta.contains(li)) ? li : null;
    },
    // reconstrói o markdown do editor quando a estrutura de listas muda
    // (Tab/Shift+Tab) — o DOM aninhado é a fonte, então nada se perde
    _rebuildEditorFromMarkdown(ta) {
      const md = this._editorText(ta);
      this._renderMdInto(ta, md);
      const r = document.createRange();
      r.selectNodeContents(ta); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },
    // Tab: se o item anterior é irmão, vira sub-item dele (recua 1 nível)
    _listIndent(ta) {
      const li = this._caretItem(ta); if (!li) return false;
      const list = li.parentElement;
      if (!list || !/^(UL|OL)$/.test(list.tagName)) return false;
      const prev = li.previousElementSibling;
      if (!prev || prev.tagName !== 'LI') return false; // 1º item não tem pai — Tab normal
      // lista aninhada do prev: reaproveita; senão cria do tipo certo
      const prevCb = prev.querySelector(':scope > input[type=checkbox]');
      let sub = null;
      for (const c of prev.children) { if (/^(UL|OL)$/.test(c.tagName)) { sub = c; break; } }
      if (!sub) {
        sub = document.createElement(list.tagName);
        if (list.classList.contains('md-checklist')) sub.className = 'md-checklist';
        prev.appendChild(sub);
      }
      // a checkbox do item migrado deve corresponder ao tipo da sub-lista de destino
      const cb = li.querySelector(':scope > input[type=checkbox]');
      const targetIsChk = sub.classList.contains('md-checklist');
      if (targetIsChk && !cb) { const ncb = document.createElement('input'); ncb.type = 'checkbox'; li.insertBefore(ncb, li.firstChild); }
      else if (!targetIsChk && cb) cb.remove();
      sub.appendChild(li);
      this._rebuildEditorFromMarkdown(ta);
      return true;
    },
    // Shift+Tab: se o item está aninhado, sobe 1 nível (para depois do pai)
    _listOutdent(ta) {
      const li = this._caretItem(ta); if (!li) return false;
      const list = li.parentElement;
      if (!list || !/^(UL|OL)$/.test(list.tagName)) return false;
      const parentLi = list.parentElement && list.parentElement.closest ? list.parentElement.closest('li') : null;
      if (!parentLi || !ta.contains(parentLi)) return false; // já está no topo
      const grand = parentLi.parentElement;
      // ao esvaziar a sub-lista, ela some; o pai permanece
      grand.insertBefore(li, parentLi.nextSibling);
      if (!list.querySelector('li')) list.remove();
      this._rebuildEditorFromMarkdown(ta);
      return true;
    },

    // atualiza estado visual dos botões da barra: toggle (bold/italic) reflete o
    // estilo no caret; botões de lista refletem o tipo de lista sob o caret
};
