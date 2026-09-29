// Edição WYSIWYG do campo: markdown, formatação (negrito/itálico/código) e o
// espelho de menções. Compartilhado com o editor de nota.
import { now, $ } from '../utils.js';

export const ComposerMarkdownMethods = {
    _editorText(el) {
      const out = [];
      // depth = nível de aninhamento da lista (sub-listas com Tab): cada nível
      // vira 2 espaços antes do marcador — o renderizador e o parser do editor
      // entendem esse recuo de volta
      // inLi: caminhando o CONTEÚDO de um <li> — uma lista aninhada aí deve
      // fechar a linha do texto do pai antes de começar (e não repetir o \n)
      const walk = (node, depth, inLi) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 3) { out.push(c.textContent); continue; }
          if (c.tagName === 'BR') { out.push('\n'); continue; }
          if (c.tagName === 'LI') {
            const list = c.parentElement;
            const cb = c.querySelector(':scope > input[type=checkbox]');
            const ind = '  '.repeat(depth);
            if (list.classList.contains('md-checklist')) out.push(ind + (cb && cb.checked ? '[x] ' : '[ ] '));
            else if (list.tagName === 'UL') out.push(ind + '- ');
            else out.push(ind + ([...list.children].indexOf(c) + 1) + '. ');
            // conteúdo do li: listas aninhadas dentro dele valem +1 nível
            walk(c, depth + 1, true);
            // a linha só termina aqui se a sub-lista ainda não a terminou
            if (out.length && out[out.length - 1] !== '\n') out.push('\n');
            continue;
          }
          if (c.tagName === 'CODE') { out.push('`' + c.textContent + '`'); continue; }
          // chip de menção → token markdown @[Nome](t:id) (a nota guarda o token;
          // sem isto o sendNote serializava só "@Nome" e o backlink se perdia)
          if (c.hasAttribute && c.hasAttribute('data-mention')) { out.push('@[' + (c.textContent || '').replace(/^@/, '') + '](t:' + (c.getAttribute('data-tid') || '') + ')'); continue; }
          // negrito/itálico do editor → marcadores markdown (a nota guarda **/*)
          if (/^(STRONG|B)$/.test(c.tagName)) { out.push('**'); walk(c, depth, inLi); out.push('**'); continue; }
          if (/^(EM|I)$/.test(c.tagName)) { out.push('*'); walk(c, depth, inLi); out.push('*'); continue; }
          const isBlock = /^(DIV|P|UL|OL|H[1-6]|BLOCKQUOTE)$/.test(c.tagName);
          if (isBlock) {
            if (c.tagName === 'UL' || c.tagName === 'OL') {
              // sub-lista dentro de um li: fecha a linha do pai antes de abrir
              if (inLi && out.length && out[out.length - 1] !== '\n') out.push('\n');
              walk(c, depth);
              continue; // o último item da lista já terminou a linha
            }
            walk(c, depth);
            out.push('\n');
          } else {
            walk(c, depth);
          }
        }
      };
      walk(el, 0, false);
      return out.join('').replace(/\u200B/g, '').replace(/\n+$/, '');
    },

    // HTML do editor → markdown (para enviar a nota)
    _serialize() {
      return this._editorText($('#composer-input'));
    },

    // **bold**, *itálico*, `code`, @[Nome](t:id) → nós DOM dentro de parent
    _pushInline(parent, text) {
      const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|@\[([^\]]+)\]\(t:([a-z0-9]+)\)/g;
      let last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
        if (m[1] !== undefined) { const b = document.createElement('strong'); b.textContent = m[1]; parent.appendChild(b); }
        else if (m[2] !== undefined) { const i2 = document.createElement('em'); i2.textContent = m[2]; parent.appendChild(i2); }
        else if (m[3] !== undefined) { const c = document.createElement('code'); c.textContent = m[3]; parent.appendChild(c); }
        else {
          const chip = document.createElement('span');
          chip.setAttribute('data-mention', ''); chip.setAttribute('data-tid', m[5]);
          chip.textContent = '@' + m[4];
          parent.appendChild(chip);
        }
        last = re.lastIndex;
      }
      if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    },

    // markdown → nós DOM para o editor (menções viram chip, **/* viram strong/em)
    _renderMdInto(el, md) {
      el.innerHTML = '';
      if (!md) return;
      const frag = this._mdToFrag(md);
      el.appendChild(frag);
    },
    _mdToFrag(md) {
      const frag = document.createDocumentFragment();
      const lines = String(md).split('\n');
      // pilha de listas abertas: recuo de 2 espaços = 1 nível de sub-lista,
      // aninhada dentro do último <li> da lista pai (espelha o DOM do editor)
      let stack = []; // { type:'ul'|'ol'|'chk', el, depth }
      const lastLi = (el) => (el.lastElementChild && el.lastElementChild.tagName === 'LI') ? el.lastElementChild : null;
      const holder = () => (stack.length ? (lastLi(stack[stack.length - 1].el) || stack[stack.length - 1].el) : frag);
      const openList = (type, depth) => {
        const el = document.createElement(type === 'ol' ? 'ol' : 'ul');
        if (type === 'chk') el.className = 'md-checklist';
        holder().appendChild(el);
        stack.push({ type, el, depth });
      };
      // fecha níveis mais fundos ou de outro tipo; abre novo se preciso
      const ensureList = (type, depth) => {
        while (stack.length && (stack[stack.length - 1].depth > depth || stack[stack.length - 1].type !== type)) stack.pop();
        if (!stack.length || stack[stack.length - 1].depth < depth) openList(type, depth);
        return stack[stack.length - 1].el;
      };
      for (const raw of lines) {
        let m;
        if ((m = raw.match(/^(\s*)\[( |x)\]\s+(.*)$/i))) {
          const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
          const el = ensureList('chk', depth);
          const li = document.createElement('li');
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = m[2].toLowerCase() === 'x';
          li.appendChild(cb);
          const sp = document.createElement('span'); this._pushInline(sp, m[3]);
          li.appendChild(sp);
          el.appendChild(li);
        } else if ((m = raw.match(/^([ \t]*)-\s+(.*)$/))) {
          const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
          const el = ensureList('ul', depth);
          const li = document.createElement('li'); this._pushInline(li, m[2]); el.appendChild(li);
        } else if ((m = raw.match(/^([ \t]*)(\d+)[.)]\s+(.*)$/))) {
          const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
          const el = ensureList('ol', depth);
          const li = document.createElement('li'); this._pushInline(li, m[3]); el.appendChild(li);
        } else {
          stack = [];
          if (raw === '') { frag.appendChild(document.createElement('br')); }
          else { const d = document.createElement('div'); this._pushInline(d, raw); frag.appendChild(d); }
        }
      }
      return frag;
    },

    // detecta "isso parece markdown?" — evita converter texto comum colado
    // (traço de diálogo, asterisco solto) quando não há estrutura de verdade
    _looksLikeMarkdown(txt) {
      return /^[ \t]*(\[[ xX]\]\s|[-*]\s+|\d+[.)]\s+)/m.test(txt)
        || /\*\*[^*\n]+\*\*/.test(txt)
        || /`[^`\n]+`/.test(txt)
        || /(^|\n)@\[[^\]\n]+\]\(t:[a-z0-9]+\)/.test(txt)
        || [...txt].some((ch) => window.NoteThread && window.NoteThread.UI && window.NoteThread.UI.REACTIONS.includes(ch));
    },

    // caret no fim do editor (uso: após programa clear/focus)
    _caretEnd(el) {
      el.focus();
      const sel = getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    },

    // cmd do execCommand com foco preservado no editor
    _exec(cmd, val) {
      const el = $('#composer-input');
      el.focus();
      document.execCommand(cmd, false, val);
    },
    applyFormat(kind) {
      const ta = $('#composer-input'); if (ta.getAttribute('contenteditable') === 'false') return;
      // bold/italic: WYSIWYG — toggle de estilo no texto ( seleção = aplica na seleção;
      // sem seleção = modo "ligado" para as próximas palavras digitadas)
      if (kind === 'bold' || kind === 'italic') {
        const sel = getSelection();
        const hasSelection = sel && !sel.isCollapsed && ta.contains(sel.anchorNode);
        if (hasSelection) {
          this._exec(kind === 'bold' ? 'bold' : 'italic');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        // modo contínuo: queryCommandState diz se o PRÓXIMO caractere sai formatado
        this._exec(kind === 'bold' ? 'bold' : 'italic');
        const nowOn = document.queryCommandState(kind === 'bold' ? 'bold' : 'italic');
        this.toast(nowOn
          ? (kind === 'bold' ? 'Negrito ligado — as próximas palavras sairão em negrito' : 'Itálico ligado — as próximas palavras sairão em itálico')
          : (kind === 'bold' ? 'Negrito desligado' : 'Itálico desligado'), { kind: 'info', duration: 1500 });
        this._updateFmtToggleUI(ta);
        return;
      }
      if (kind === 'code') {
        const sel = getSelection();
        const hasSelection = sel && !sel.isCollapsed && ta.contains(sel.anchorNode);
        if (hasSelection) {
          // toggle <code> na seleção
          const n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
          if (n && ta.contains(n) && n.closest('code')) {
            this._unwrap(n.closest('code'));
          } else {
            const txt = sel.toString();
            this._exec('insertHTML', '<code>' + txt.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</code>');
          }
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        // sem seleção: insere bloco de código vazio destacado
        this._exec('insertHTML', '<code>\u200b</code>');
        // posiciona cursor dentro do code
        const codes = ta.querySelectorAll('code');
        const last = codes[codes.length - 1];
        if (last) { const r = document.createRange(); r.selectNodeContents(last); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
        return;
      }
      if (kind === 'checklist' || kind === 'list' || kind === 'ordered-list') {
        this._ensureSelection(ta);
        if (kind === 'ordered-list') {
          this._exec('insertOrderedList'); // nativo: cria, converte ul↔ol e sai da lista
        } else if (kind === 'list') {
          this._exec('insertUnorderedList');
        } else {
          // checklist: ul nativa + classe + checkbox por item
          let list = this._caretList(ta);
          if (list && list.tagName === 'OL') { this._exec('insertOrderedList'); this._exec('insertUnorderedList'); list = this._caretList(ta); }
          else if (!list) { this._exec('insertUnorderedList'); list = this._caretList(ta); }
          if (list && list.tagName === 'UL') {
            if (list.classList.contains('md-checklist')) {
              list.classList.remove('md-checklist');
              list.querySelectorAll(':scope > li > input[type=checkbox]').forEach((i) => i.remove());
            } else {
              list.classList.add('md-checklist');
              [...list.children].forEach((li) => { const cb = document.createElement('input'); cb.type = 'checkbox'; li.insertBefore(cb, li.firstChild); });
            }
          }
        }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        this._updateFmtToggleUI(ta);
        return;
      }
    },

    // desfaz <code> mantendo o texto
    _unwrap(codeEl) {
      const parent = codeEl.parentNode;
      while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
      parent.removeChild(codeEl);
      parent.normalize();
      $('#composer-input').dispatchEvent(new Event('input', { bubbles: true }));
    },

    // garante que existe um range DENTRO do editor (webviews podem focar sem seleção;
    // e um clique em botão externo deixa um range fora — ex.: dentro do próprio botão)
    _ensureSelection(ta) {
      const sel = getSelection();
      if (sel.rangeCount) {
        const r = sel.getRangeAt(0);
        const host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
        if (host && ta.contains(host)) return r;
      }
      const r = document.createRange();
      r.selectNodeContents(ta); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
      return r;
    },

    // ul/ol que contém o caret (ou null)
    _updateFmtToggleUI(ta) {
      let bold = false, italic = false, ul = false, ol = false;
      try { bold = document.queryCommandState('bold'); } catch {}
      try { italic = document.queryCommandState('italic'); } catch {}
      try { ul = document.queryCommandState('insertUnorderedList'); } catch {}
      try { ol = document.queryCommandState('insertOrderedList'); } catch {}
      const list = this._caretList(ta);
      const chk = !!(list && list.classList && list.classList.contains('md-checklist'));
      let inCode = false;
      if (getSelection().rangeCount) {
        const n = getSelection().getRangeAt(0).startContainer;
        const el = n.nodeType === 1 ? n : n.parentElement;
        inCode = !!(el && el.closest && ta.contains(el) && el.closest('code'));
      }
      document.querySelectorAll('.fmt-btn').forEach((b) => {
        const k = b.dataset.fmt;
        if (!k) return;
        let active;
        if (k === 'bold') active = bold;
        else if (k === 'italic') active = italic;
        else if (k === 'code') active = inCode;
        else if (k === 'checklist') active = chk;
        else if (k === 'list') active = ul && !chk;
        else if (k === 'ordered-list') active = ol;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    },

    // botão único send/áudio: com texto (ou anexo) mostra ✈ enviar; vazio mostra 🎤 gravar
};
