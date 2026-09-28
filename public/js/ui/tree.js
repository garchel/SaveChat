import { uid, now, esc, haptic, $ } from '../utils.js';
import { ICON, wrapSvg, COLOR_PALETTE, colorById, glyphSvg, GLYPH_ICONS } from '../icons.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';

export const TreeMethods = {

  // frases fofas ao criar conversa/pasta — uma diferente a cada vez
  _cozyCongrats() {
    const pool = [
      'Caderninho novo criado 🌷',
      'Prontinho! Aí é com você ✨',
      'Feito — cantinho criado ☁️',
      'Tá guardado. Bora encher de ideias! 🌸',
      'Novo espaço aconchegante pronto 🏡',
    ];
    return pool[(Math.random() * pool.length) | 0];
  },

bindTreeActions() {
      $('#btn-new-thread').addEventListener('click', () => this.createItem());
      // Lupa: revela a busca com fade no botão Novo (os três componentes antigos
      // — 2 botões + busca — vivem no mesmo espaço, um de cada vez)
      const sBtn = document.getElementById('btn-explorer-search');
      const row = document.querySelector('.explorer-row');
      const panel = document.getElementById('explorer-search-panel');
      if (sBtn && row && panel) {
        sBtn.addEventListener('click', () => {
          const open = panel.classList.toggle('open');
          row.classList.toggle('searching', open);
          sBtn.classList.toggle('active', open);
          sBtn.setAttribute('aria-expanded', String(open));
          const input = document.getElementById('search-input');
          if (open) setTimeout(() => input && input.focus(), 230);
          else if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
        });
      }
      $('#btn-back').addEventListener('click', () => $('#app').classList.remove('show-chat'));
    },

    // Botão unificado "+ NOVO": escolhe Conversa ou Caderno no mesmo modal
    createItem() {
      let type = 'thread'; // 'thread' | 'folder'
      let chosen = 'chat';
      let chosenColor = null;
      const $id = (i) => document.getElementById(i);
      const isFolder = () => type === 'folder';
      const body = `
        <div class="seg" id="ni-type" role="tablist" aria-label="Tipo do item" style="margin-bottom:14px">
          <button type="button" class="seg-btn active" data-type="thread">💬 Conversa</button>
          <button type="button" class="seg-btn" data-type="folder">📁 Caderno</button>
        </div>
        <div id="ni-body"></div>`;
      this.showModal('Nova conversa', body, () => {
        const v = ($id('nt-name').value || '').trim();
        if (!v) { $id('nt-name').focus(); return; }
        if (isFolder()) {
          const f = { id: uid(), name: v, emoji: chosen, color: chosenColor || undefined, parentId: null, createdAt: now(), userId: Store.user ? Store.user.mail : 'anon' };
          Store.upsertFolder(f);
          Store.setExpanded(f.id, true);
          Sync.send('folder:upsert', f);
          this.renderTree(); this.closeModal();
          Sound.play('create'); haptic('success');
          this.toast(this._cozyCongrats(), { kind: 'success' });
        } else {
          const sel = $id('nt-folder');
          const target = sel ? (sel.value || null) : null;
          const t = { id: uid(), name: v, emoji: chosen, color: chosenColor || undefined, folderId: target, favorite: false, createdAt: now(), updatedAt: now(), lastPreview: '', userId: Store.user ? Store.user.mail : 'anon' };
          Store.upsertThread(t);
          Sync.send('thread:upsert', t);
          this.renderTree(); this.closeModal();
          Sound.play('create'); haptic('success');
          this.toast(this._cozyCongrats(), { kind: 'success' });
          this.openThread(t.id);
        }
      });
      const renderType = () => {
        const wrap = $id('ni-body'); if (!wrap) return;
        const folders = Store.folderList();
        const locSel = (!isFolder() && folders.length) ? `
          <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Criar em</label>
          <select id="nt-folder" style="width:100%;background:var(--bg);border:1.5px solid var(--border);color:var(--text);border-radius:10px;padding:9px 12px;font-size:14px;font-family:inherit;cursor:pointer">
            <option value="">🌱 Raiz (sem caderno)</option>
            ${folders.map((f) => `<option value="${esc(f.id)}">${esc(f.emoji && GLYPH_ICONS[f.emoji] ? '' : (f.emoji || '') + ' ')}${esc(f.name)}</option>`).join('')}
          </select>` : '';
        const prev = $id('nt-name') ? $id('nt-name').value : '';
        wrap.innerHTML = `
          <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">${isFolder() ? 'Nome do caderno' : 'Nome da conversa'}</label>
          <input id="nt-name" type="text" placeholder="${isFolder() ? 'ex: Trabalho, Pessoal, Estudos…' : 'ex: Ideias de Projetos, Tarefas Diárias…'}" value="${esc(prev)}" autofocus />
          ${locSel}
          <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Cor</label>
          ${this._colorSwatchesHTML('nt', null)}
          <div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px">
            <label style="font-size:13px;color:var(--text-dim);font-weight:600;flex:1">Ícone</label>
            <label class="switch" style="transform:scale(0.85)"><input type="checkbox" id="nt-emoji-toggle"/><span class="slider"></span></label>
            <span style="font-size:12px;color:var(--text-dim)">Emojis</span>
          </div>
          <div id="nt-glyphs">${this._glyphPickerHTML('nt', chosen)}</div>
          <div id="nt-emojis" class="hidden"><div class="ep">${this._pickerHTML('nt-emoji', isFolder() ? '📁' : '💬')}</div></div>`;
        document.getElementById('modal-title').textContent = isFolder() ? 'Novo caderno' : 'Nova conversa';
        chosen = isFolder() ? 'folder' : 'chat'; chosenColor = null;
        this._bindColorSwatches('nt', null, (c) => { chosenColor = c; });
        this._bindGlyphPicker('nt', (g) => { chosen = g; });
        const tgl = $id('nt-emoji-toggle');
        if (tgl) tgl.addEventListener('change', () => {
          const on = tgl.checked;
          $id('nt-glyphs').classList.toggle('hidden', on);
          $id('nt-emojis').classList.toggle('hidden', !on);
          if (on) { this._bindPicker('nt-emoji', isFolder() ? '📁' : '💬', (e) => { chosen = e; }); this.ensureEmojiCats && this.ensureEmojiCats('nt-emoji', isFolder() ? '📁' : '💬'); }
        });
        this._bindPicker('nt-emoji', isFolder() ? '📁' : '💬', (e) => { chosen = e; });
        this.ensureEmojiCats && this.ensureEmojiCats('nt-emoji', isFolder() ? '📁' : '💬');
        setTimeout(() => { const i = $id('nt-name'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch {} } }, 50);
      };
      $id('ni-type').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.type === type) return;
        type = b.dataset.type;
        $id('ni-type').querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        renderType();
      }));
      renderType();
    },

    createThread(folderId = null) {
      let chosen = 'chat';
      let chosenColor = null;
      let useEmoji = false;
      // seletor de local: cadernos existentes + raiz; o do contexto vem pré-escolhido
      const folders = Store.folderList();
      const locSel = folders.length ? `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Criar em</label>
        <select id="nt-folder" style="width:100%;background:var(--bg);border:1.5px solid var(--border);color:var(--text);border-radius:10px;padding:9px 12px;font-size:14px;font-family:inherit;cursor:pointer">
          <option value="">🌱 Raiz (sem caderno)</option>
          ${folders.map((f) => `<option value="${esc(f.id)}"${f.id === folderId ? ' selected' : ''}>${esc(f.emoji && GLYPH_ICONS[f.emoji] ? '' : (f.emoji || '') + ' ')}${esc(f.name)}</option>`).join('')}
        </select>` : '';
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da conversa</label>
        <input id="nt-name" type="text" placeholder="ex: Ideias de Projetos, Tarefas Diárias…" autofocus />
        ${locSel}
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Cor</label>
        ${this._colorSwatchesHTML('nt', null)}
        <div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px">
          <label style="font-size:13px;color:var(--text-dim);font-weight:600;flex:1">Ícone</label>
          <label class="switch" style="transform:scale(0.85)"><input type="checkbox" id="nt-emoji-toggle"/><span class="slider"></span></label>
          <span style="font-size:12px;color:var(--text-dim)">Emojis</span>
        </div>
        <div id="nt-glyphs">${this._glyphPickerHTML('nt', chosen)}</div>
        <div id="nt-emojis" class="hidden"><div class="ep">${this._pickerHTML('nt-emoji', '💬')}</div></div>`;
      this.showModal('Nova conversa', body, () => {
        const v = ($('#nt-name').value || '').trim();
        if (!v) { $('#nt-name').focus(); return; }
        // o select MANDA quando existe (usuário decide; pré-escolhido se veio do contexto)
        const sel = $('#nt-folder');
        const target = sel ? (sel.value || null) : (folderId || null);
        const t = { id: uid(), name: v, emoji: chosen, color: chosenColor || undefined, folderId: target, favorite: false, createdAt: now(), updatedAt: now(), lastPreview: '', userId: Store.user ? Store.user.mail : 'anon' };
        Store.upsertThread(t);
        Sync.send('thread:upsert', t);
        this.renderTree();
        this.closeModal();
        Sound.play('create'); haptic('success');
        this.toast(this._cozyCongrats(), { kind: 'success' });
        this.openThread(t.id);
      });
      this._bindColorSwatches('nt', null, (c) => { chosenColor = c; });
      this._bindGlyphPicker('nt', (g) => { chosen = g; });
      const ntToggle = $('#nt-emoji-toggle');
      if (ntToggle) ntToggle.addEventListener('change', () => {
        useEmoji = ntToggle.checked;
        $('#nt-glyphs').classList.toggle('hidden', useEmoji);
        $('#nt-emojis').classList.toggle('hidden', !useEmoji);
        if (useEmoji) { this._bindPicker('nt-emoji', '💬', (e) => { chosen = e; }); this.ensureEmojiCats && this.ensureEmojiCats('nt-emoji', '💬'); }
      this.ensureEmojiCats && this.ensureEmojiCats('nt-emoji', '💬');
      });
      this._bindPicker('nt-emoji', '💬', (e) => { chosen = e; });
      this.ensureEmojiCats && this.ensureEmojiCats('nt-emoji', '💬');
      setTimeout(() => $('#nt-name') && $('#nt-name').focus(), 50);
    },

    createFolder() {
      let chosen = 'folder';
      let chosenColor = null;
      let useEmojiFolder = false;
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da pasta</label>
        <input id="nf-name" type="text" placeholder="ex: Trabalho, Pessoal, Estudos…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Cor</label>
        ${this._colorSwatchesHTML('nf', null)}
        <div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px">
          <label style="font-size:13px;color:var(--text-dim);font-weight:600;flex:1">Ícone</label>
          <label class="switch" style="transform:scale(0.85)"><input type="checkbox" id="nf-emoji-toggle"/><span class="slider"></span></label>
          <span style="font-size:12px;color:var(--text-dim)">Emojis</span>
        </div>
        <div id="nf-glyphs">${this._glyphPickerHTML('nf', chosen)}</div>
        <div id="nf-emojis" class="hidden"><div class="ep">${this._pickerHTML('nf-emoji', '📁')}</div></div>`;
      this.showModal('Nova pasta', body, () => {
        const v = ($('#nf-name').value || '').trim();
        if (!v) { $('#nf-name').focus(); return; }
        const f = { id: uid(), name: v, emoji: chosen, color: chosenColor || undefined, parentId: null, createdAt: now(), userId: Store.user ? Store.user.mail : 'anon' };
        Store.upsertFolder(f);
        Store.setExpanded(f.id, true);
        Sync.send('folder:upsert', f);
        this.closeModal();
        Sound.play('create'); haptic('success');
        this.toast(this._cozyCongrats(), { kind: 'success' });
        this.renderTree();
      });
      this._bindColorSwatches('nf', null, (c) => { chosenColor = c; });
      this._bindGlyphPicker('nf', (g) => { chosen = g; });
      const nfToggle = $('#nf-emoji-toggle');
      if (nfToggle) nfToggle.addEventListener('change', () => {
        useEmojiFolder = nfToggle.checked;
        $('#nf-glyphs').classList.toggle('hidden', useEmojiFolder);
        $('#nf-emojis').classList.toggle('hidden', !useEmojiFolder);
        if (useEmojiFolder) { this._bindPicker('nf-emoji', '📁', (e) => { chosen = e; }); this.ensureEmojiCats && this.ensureEmojiCats('nf-emoji', '📁'); }
      this.ensureEmojiCats && this.ensureEmojiCats('nf-emoji', '📁');
      });
      this._bindPicker('nf-emoji', '📁', (e) => { chosen = e; });
      this.ensureEmojiCats && this.ensureEmojiCats('nf-emoji', '📁');
      setTimeout(() => $('#nf-name') && $('#nf-name').focus(), 50);
    },

sortThreads(list) {
      const mode = (Store.data && Store.data.ui && Store.data.ui.sort) || 'recent';
      const arr = list.slice();
      if (mode === 'manual') arr.sort((a, b) => (a.order || 0) - (b.order || 0));
      else if (mode === 'name') arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
      else arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return arr;
    },

queueRenderTree() { clearTimeout(this._rtTimer); this._rtTimer = setTimeout(() => this.renderTree(), 90); },

renderTree() {
      // ANTI-FLICK: se nada visível na árvore mudou, NÃO reconstrói. Ecos do
      // realtime (thread:upsert da própria criação), snapshots de reconexão e
      // outros eventos chamam renderTree sem mudar nada — reconstruir a lista e
      // re-animar todos os nós era o flick ao criar conversa/caderno.
      const threadSig = (t) => [t.id, t.name, t.emoji || '', t.color || '', t.favorite ? 1 : 0, (Store.notesFor(t.id) || []).length, (Store.notesFor(t.id) || []).some((x) => x.remindAt && !x.remindFired) ? 1 : 0].join('~');
      const fpFolders = Store.folderList();
      const fpRoots = this.sortThreads(Store.threadList().filter((t) => !t.favorite && !t.folderId));
      const fp = [
        'F:' + this.sortThreads(Store.threadList().filter((t) => t.favorite)).map((t) => t.id).join(','),
        'D:' + fpFolders.map((f) => [f.id, f.name, f.emoji || '', f.color || '', Store.isExpanded(f.id) ? 1 : 0].join('~')).join(','),
        'R:' + fpRoots.map(threadSig).join(','),
        ...fpFolders.map((f) => 'K' + f.id + ':' + this.sortThreads(Store.threadList().filter((t) => !t.favorite && t.folderId === f.id)).map(threadSig).join(',')),
      ].join(';');
      if (fp === this._lastTreeFp) return;

      // anima SOMENTE nós que não existiam no render anterior (entrada pontual)
      const prevIds = this._lastTreeThreadIds || new Set();
      const allIds = new Set();
      const collect = (t) => allIds.add(t.id);
      fpRoots.forEach(collect);
      Store.threadList().filter((t) => t.favorite).forEach(collect);
      fpFolders.forEach((f) => Store.threadList().filter((t) => !t.favorite && t.folderId === f.id).forEach(collect));
      this._newTreeIds = new Set([...allIds].filter((id) => !prevIds.has(id)));
      this._lastTreeThreadIds = allIds;
      this._lastTreeFp = fp;

      this.renderFavorites();
      const tree = this.dom.tree;
      tree.innerHTML = '';
      const folders = Store.folderList();
      const threads = Store.threadList().filter((t) => !t.favorite && !t.folderId);

      if (!folders.length && !threads.length) {
        tree.innerHTML = `<div class="tree-empty">
          <div class="te-title">Comece sua primeira conversa</div>
          <div class="te-sub">Anote ideias, tarefas e reflexões como mensagens de chat.</div>
          <button class="te-btn" id="te-create">${wrapSvg(ICON.plus, 14)} Nova conversa</button>
        </div>`;
        const b = tree.querySelector('#te-create'); if (b) b.addEventListener('click', () => this.createThread());
      }

      // Pastas (com suas threads dentro)
      folders.forEach((f) => tree.appendChild(this.folderNode(f)));
      // Threads soltas (raiz)
      this.sortThreads(threads).forEach((t) => tree.appendChild(this.threadNode(t, 0)));
      // limpa a classe de entrada após a animação (não re-anima em renders futuros)
      clearTimeout(this._treeNewTimer);
      this._treeNewTimer = setTimeout(() => document.querySelectorAll('.tree-new').forEach((el) => el.classList.remove('tree-new')), 350);
    },

folderNode(f) {
      const kids = this.sortThreads(Store.threadList().filter((t) => !t.favorite && t.folderId === f.id));
      const expanded = Store.isExpanded(f.id);

      const row = document.createElement('div');
      const fIsNew = !!(this._newTreeIds && this._newTreeIds.has(f.id));
      row.className = 'tnode folder-node' + (expanded ? '' : ' collapsed') + (fIsNew ? ' tree-new' : '');
      row.dataset.fid = f.id;
      row.setAttribute('draggable', 'true');
      // ícone grande colorido (mesmo estilo dos cadernos); cor salva ou hash
      // estilos inline: independem do styles.css (cache-proof)
      const fcol = this._cadernoColor(f);
      const fglyph = glyphSvg(f.emoji);
      const fInner = fglyph || esc(f.emoji || '📁');
      const isGlyphF = !!fglyph;
      // alinha com as notas: mesmo padding-left (8px) — a arrow twist já reserva o espaço
      row.style.paddingLeft = '8px';
      // PASTA = caderno: aba lateral escura no tile (estilo fichário) —
      // diferencia de conversa à primeira vista, herda a cor da paleta,
      // sem markup extra (gradiente inline, à prova de cache).
      // Compensação ÓTICA do glifo: a aba escura tem peso visual, então o
      // centro percebido fica entre o centro do tile e o do corpo — usamos
      // METADE da aba (3.5px), não os 7px inteiros (fica ~2px à direita).
      // Não gera desalinhho com os filhos: na árvore eles já partem 16px à
      // direita (indent), então nunca há coluna de glifos pai×filho.
      const ftab = `linear-gradient(90deg, ${this._darken(fcol.bg, .55)} 0 7px, ${fcol.bg} 7px)`;
      const fico = `<span class="caderno-ico" style="width:52px;height:52px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;padding-left:3.5px;background:${ftab};color:${fcol.fg};font-size:${isGlyphF ? '0' : '22px'};box-shadow:var(--shadow-sm)">${isGlyphF ? fInner.replace('<svg ', '<svg style="width:26px;height:26px" ') : fInner}</span>`;
      // count só quando há conversas — pílula vazia com background virava
      // uma "linha branca" fantasma à direita do nome
      const fcount = kids.length ? `<span class="count">${kids.length}</span>` : '';
      row.innerHTML = `<span class="twist">${wrapSvg(ICON.chevron, 10)}</span><span class="ico">${fico}</span>
                       <span class="label">${esc(f.name)}</span>${fcount}`;
      row.addEventListener('click', () => {
        const v = !Store.isExpanded(f.id);
        Store.setExpanded(f.id, v);
        row.classList.toggle('collapsed', !v);
        const ch = row.nextElementSibling;
        if (ch && ch.classList.contains('children')) {
          // M3 fix: toggle via grid-template-rows (0fr↔1fr) — sem max-height/jank
          ch.classList.toggle('expanded', v);
        }
      });
      // menu de contexto na pasta (reutiliza thread ctx levemente)
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); this.ctxFolderId = f.id; this.openFolderMenu(e, f); });
      // Long-press para mobile
      row.addEventListener('touchstart', (e) => {
        this.onTnodeTouchEnd();
        this.tnodeLongPressTimer = setTimeout(() => {
          const touch = e.touches[0];
          const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} };
          this.ctxFolderId = f.id; this.openFolderMenu(fakeEvent, f);
        }, 500);
      }, { passive: true });
      row.addEventListener('touchend', () => this.onTnodeTouchEnd());
      row.addEventListener('touchmove', () => this.onTnodeTouchEnd());

      const wrap = document.createElement('div');
      wrap.appendChild(row);
      const children = document.createElement('div');
      children.className = 'children' + (expanded ? ' expanded' : '');
      const inner = document.createElement('div');
      inner.className = 'children-inner';
      children.appendChild(inner);
      kids.forEach((t) => inner.appendChild(this.threadNode(t, 1)));
      if (!kids.length) {
        // estado vazio da pasta: ícone + texto + ação direta de criar nota
        const empty = document.createElement('button');
        empty.type = 'button';
        empty.className = 'folder-empty';
        empty.title = 'Criar uma conversa nesta pasta';
        empty.innerHTML = `<span class="fe-ic">${wrapSvg(ICON.plus, 14)}</span>
                           <span class="fe-text"><strong>Pasta vazia</strong><small>Clique para criar a primeira conversa</small></span>`;
        empty.addEventListener('click', (e) => {
          e.stopPropagation();
          // folderId capturado no closure AGORA — estado mutável compartilhado
          // (activeFolderContext) era zerado antes do modal fechar → bug raiz
          this.createThread(f.id);
        });
        inner.appendChild(empty);
      }
      wrap.appendChild(children);
      return wrap;
    },

    _colorSwatchesHTML(prefix, selectedId) {
      return `<div class="color-swatches" id="${prefix}-colors">` +
        COLOR_PALETTE.map((c) => `<button type="button" class="color-swatch${c.id === selectedId ? ' sel' : ''}" data-color="${c.id}" style="background:${c.bg}" title="${c.id}" aria-label="Cor ${c.id}"></button>`).join('') +
        `</div>`;
    },
    _bindColorSwatches(prefix, initialId, onPick) {
      const root = $(`#${prefix}-colors`);
      if (!root) return;
      let current = initialId;
      root.querySelectorAll('.color-swatch').forEach((b) => b.addEventListener('click', () => {
        root.querySelectorAll('.color-swatch.sel').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        current = b.dataset.color;
        onPick(current);
      }));
      return () => current;
    },
    _cadernoColor(t) {
      // cor escolhida pelo usuário tem prioridade; senão, hash determinístico
      const chosen = t.color && colorById(t.color);
      if (chosen) return chosen;
      const palette = COLOR_PALETTE;
      let hash = 0;
      const str = t.id + (t.emoji || t.name || '');
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      return palette[hash % palette.length];
    },
    _darken(hex, f = 0.8) {
      // escurece hex p/ as "folhas" de trás do tile — dá separação visual entre camadas
      try {
        const n = parseInt(String(hex).replace('#', ''), 16);
        const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
        return `rgb(${r},${g},${b})`;
      } catch { return hex; }
    },
    threadNode(t, depth) {
      const el = document.createElement('div');
      // .tree-new: animação de entrada só no nó realmente novo (anti-flick)
      const isNew = !!(this._newTreeIds && this._newTreeIds.has(t.id));
      el.className = 'tnode cozy-caderno' + (this.activeThread === t.id ? ' active' : '') + (t.favorite ? ' fav' : '') + (isNew ? ' tree-new' : '');
      el.dataset.tid = t.id;
      el.setAttribute('draggable', 'true');
      el.style.paddingLeft = (8 + depth * 16) + 'px';
      let ic;
      const col = this._cadernoColor(t);
      // ícone escolhido (glifo vetorial) > emoji legado > favorito > fallback
      // estilos inline: independem do styles.css (cache-proof)
      const tGlyph = t.emoji && glyphSvg(t.emoji);
      const icoBase = `width:52px;height:52px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;background:${col.bg};color:${col.fg};font-size:22px;box-shadow:var(--shadow-sm)`;
      if (tGlyph) ic = `<span class="caderno-ico" style="${icoBase};font-size:0">${tGlyph.replace('<svg ', '<svg style="width:26px;height:26px" ')}</span>`;
      else if (t.favorite) ic = `<span class="caderno-ico" style="${icoBase}">${wrapSvg(ICON.star, 20)}</span>`;
      else if (t.emoji) ic = `<span class="caderno-ico" style="${icoBase}">${esc(t.emoji)}</span>`;
      else ic = `<span class="caderno-ico" style="${icoBase};font-size:0">${glyphSvg('chat').replace('<svg ', '<svg style="width:26px;height:26px" ')}</span>`;
      const noteCount = Store.notesFor(t.id).length;
      const countEl = noteCount ? `<span class="note-count" title="${noteCount} nota${noteCount !== 1 ? 's' : ''}">${noteCount}</span>` : '';
      // badge ⏰ se a thread tem lembrete pendente
      const hasRemind = Store.notesFor(t.id).some((x) => x.remindAt && !x.remindFired);
      const remindEl = hasRemind ? '<span class="remind-badge" title="Lembrete pendente">⏰</span>' : '';
      el.innerHTML = `<span class="twist" style="visibility:hidden">${wrapSvg(ICON.chevron, 10)}</span>
                      <span class="ico">${ic}</span>
                      <span class="label">${esc(t.name)}</span>
                      ${remindEl}
                      ${countEl}
                      <span class="star" title="Favoritar">${wrapSvg(ICON.star, 13)}</span>`;
      el.addEventListener('click', () => this.openThread(t.id));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openThreadMenu(e, t); });
      // Long-press para mobile (touch)
      el.addEventListener('touchstart', (e) => this.onTnodeTouchStart(e, t), { passive: true });
      el.addEventListener('touchend', () => this.onTnodeTouchEnd());
      el.addEventListener('touchmove', () => this.onTnodeTouchEnd());
      el.querySelector('.star').addEventListener('click', (e) => { e.stopPropagation(); this.toggleFavorite(t.id); });
      return el;
    },

onTnodeTouchStart(e, t) {
      this.onTnodeTouchEnd();
      this.tnodeLongPressTimer = setTimeout(() => {
        // Cria um evento fake com clientX/clientY do touch
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} };
        this.openThreadMenu(fakeEvent, t);
      }, 500);
    },

onTnodeTouchEnd() {
      if (this.tnodeLongPressTimer) { clearTimeout(this.tnodeLongPressTimer); this.tnodeLongPressTimer = null; }
    },

updateNoteCount() {
      Store.threadList().forEach((t) => {
        const count = Store.notesFor(t.id).length;
        document.querySelectorAll(`.tnode[data-tid="${t.id}"]`).forEach((el) => {
          let c = el.querySelector('.note-count');
          if (!count) { if (c) c.remove(); return; }
          if (!c) {
            c = document.createElement('span');
            c.className = 'note-count';
            const star = el.querySelector('.star');
            if (star) el.insertBefore(c, star); else el.appendChild(c);
          }
          c.textContent = count;
          c.title = `${count} nota${count !== 1 ? 's' : ''}`;
        });
      });
    },

renderFavorites() {
      const sec = this.dom.favSection, list = this.dom.favList;
      const favs = this.sortThreads(Store.threadList().filter((t) => t.favorite));
      if (!favs.length) { sec.classList.add('hidden'); return; }
      sec.classList.remove('hidden');
      list.innerHTML = '';
      favs.forEach((t) => list.appendChild(this.threadNode(t, 0)));
    },

toggleFavorite(id) {
      const t = Store.getThread(id); if (!t) return;
      t.favorite = !t.favorite; t.updatedAt = now();
      Store.upsertThread(t);
      Sync.send('thread:upsert', t);
      this.renderTree();
      Sound.play(t.favorite ? 'favorite' : 'pin'); haptic('light');
    },

    bindContextMenu() {
      document.addEventListener('click', (e) => {
        if (e.button === 2) return;
        if (!this.dom.ctx.contains(e.target)) this.dom.ctx.classList.add('hidden');
      });
      document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.tnode')) this.dom.ctx.classList.add('hidden');
      });
      // handler global para ações do menu de thread (data-act)
      this.dom.ctx.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b && b.dataset.act && ['fav', 'unfav', 'rename', 'delete', 'move'].includes(b.dataset.act)) {
          this.handleCtx(b.dataset.act);
        }
      });
    },

    openThreadMenu(e, t) {
      this.ctxThreadId = t.id;
      const m = this.dom.ctx;
      // restaura o HTML de threads se o menu estiver com o HTML de pastas
      if (m.dataset.origHtml) { m.innerHTML = m.dataset.origHtml; delete m.dataset.origHtml; }
      const favBtn = m.querySelector('[data-act="fav"]');
      const unfavBtn = m.querySelector('[data-act="unfav"]');
      // '' remove o estilo inline: o display:flex do CSS volta a valer
      // ('block' quebrava o flex e o texto caía para a linha de baixo do ícone)
      if (favBtn) favBtn.style.display = t.favorite ? 'none' : '';
      if (unfavBtn) unfavBtn.style.display = t.favorite ? '' : 'none';
      m.classList.remove('hidden');
      m.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      m.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
      e.stopPropagation();
    },

    openFolderMenu(e, f) {
      const m = this.dom.ctx;
      // preserva o HTML original do menu de threads para não quebrar o próximo openThreadMenu
      if (!m.dataset.origHtml) m.dataset.origHtml = m.innerHTML;
      // mesmos SVGs do menu de notas (15×15, stroke 2) — coluna de glifos alinhada
      m.innerHTML = `<button data-act="new-thread-folder"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nova conversa</button>
                     <button data-act="rename-folder"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Renomear pasta</button>
                     <button data-act="delete-folder" class="danger"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Excluir caderno</button>`;
      m.classList.remove('hidden');
      m.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      m.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
      m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'new-thread-folder') this.createThread(f.id);
        else if (act === 'rename-folder') this.renameFolder(f.id);
        else if (act === 'delete-folder') this.confirmDeleteFolder(f.id);
        m.classList.add('hidden');
        // restaura o menu de threads para o próximo uso
        if (m.dataset.origHtml) { m.innerHTML = m.dataset.origHtml; delete m.dataset.origHtml; }
      }));
      // restaura ao fechar por clique fora
      const restore = () => {
        if (m.dataset.origHtml) { m.innerHTML = m.dataset.origHtml; delete m.dataset.origHtml; }
        document.removeEventListener('click', restore);
      };
      setTimeout(() => document.addEventListener('click', restore, { once: true }), 0);
      e.stopPropagation();
    },
    renameFolder(id) {
      const f = Store.getFolder(id); if (!f) return;
      const body = `<label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Novo nome do caderno</label>
        <input id="rename-folder-input" type="text" value="${esc(f.name)}" autofocus />`;
      this.showModal('Renomear caderno', body, () => {
        const v = ($('#rename-folder-input').value || '').trim();
        if (!v) { $('#rename-folder-input').focus(); return; }
        f.name = v; Store.upsertFolder(f); Sync.send('folder:upsert', f);
        this.renderTree(); this.closeModal();
      });
      setTimeout(() => { const el = $('#rename-folder-input'); if (el) { el.focus(); el.select(); } }, 50);
    },
    confirmDeleteFolder(id) {
      const f = Store.getFolder(id); if (!f) return;
      const count = Store.threadList().filter(t => t.folderId === id).length;
      const body = `
        <p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja excluir o caderno <b>"${esc(f.name)}"</b>?</p>
        <p style="font-size:13px;color:var(--text-dim);margin-top:8px">${count ? `${count} conversa${count !== 1 ? 's' : ''} dentro voltará${count !== 1 ? 'ão' : ''} para a raiz.` : 'Nenhuma conversa neste caderno.'} Esta ação não pode ser desfeita.</p>`;
      this.showModal('Excluir caderno', body, () => {
        Store.deleteFolder(f.id, false); Sync.send('folder:delete', { id: f.id });
        this.renderTree(); this.closeModal();
        Sound.play('delete'); haptic('delete');
      });
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
    },

    renameThread(id) {
      const t = Store.getThread(id); if (!t) return;
      const body = `<label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Novo nome da conversa</label>
        <input id="rename-thread-input" type="text" value="${esc(t.name)}" autofocus />`;
      this.showModal('Renomear conversa', body, () => {
        const v = ($('#rename-thread-input').value || '').trim();
        if (!v) { $('#rename-thread-input').focus(); return; }
        t.name = v; t.updatedAt = now(); Store.upsertThread(t); Sync.send('thread:upsert', t);
        this.renderTree(); this.closeModal();
        if (this.activeThread === id) $('#chat-name').textContent = v;
      });
      setTimeout(() => { const el = $('#rename-thread-input'); if (el) { el.focus(); el.select(); } }, 50);
    },
    handleCtx(act) {
      const id = this.ctxThreadId; const t = Store.getThread(id); if (!t) return;
      if (act === 'fav') this.toggleFavorite(id);
      else if (act === 'unfav') this.toggleFavorite(id);
      else if (act === 'rename') this.renameThread(id);
      else if (act === 'delete') {
        this.confirmDeleteThread(id);
      } else if (act === 'move') {
        const folders = Store.folderList();
        const opts = ['<option value="">— Raiz (sem pasta) —</option>']
          .concat(folders.map((f) => `<option value="${f.id}" ${t.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`)).join('');
        this.showModal('Mover para pasta', `<select id="move-sel">${opts}</select>`, () => {
          const v = $('#move-sel').value || null; t.folderId = v; t.updatedAt = now();
          Store.upsertThread(t); Sync.send('thread:upsert', t); this.renderTree(); this.closeModal();
        });
      }
      this.dom.ctx.classList.add('hidden');
    },

confirmDeleteThread(id) {
      const t = Store.getThread(id); if (!t) return;
      const noteCount = Store.notesFor(id).length;
      const body = `
        <p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja excluir a conversa <b>"${esc(t.name)}"</b>?</p>
        <p style="font-size:13px;color:var(--text-dim);margin-top:8px">${noteCount ? `${noteCount} nota${noteCount !== 1 ? 's' : ''} serão removida${noteCount !== 1 ? 's' : ''} permanentemente.` : 'Nenhuma nota nesta conversa.'} Esta ação não pode ser desfeita.</p>`;
      this.showModal('Excluir conversa', body, () => {
        delete Store.data.threads[id]; delete Store.data.notes[id];
        if (this.activeThread === id) {
          this.activeThread = null;
          $('#chat-name').textContent = 'Selecione uma conversa';
          $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
          $('#empty-state').classList.remove('hidden');
          const ci = $('#composer-input');
          ci.setAttribute('contenteditable', 'false'); ci.classList.add('composer-disabled'); ci.innerHTML = '';
          $('#btn-send').disabled = true;
          this.dom.btnPin.classList.add('hidden');
          this.setChatActiveUi(false);
        }
        Store.save(); Sync.send('thread:delete', { id });
        this.renderTree();
        this.closeModal();
        Sound.play('delete'); haptic('delete');
      });
      // destaca o botão OK como perigoso
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
    },
};
