// Skeleton de carregamento e a paginação por infinite scroll.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { $, PAGE_SIZE } from '../utils.js';

export const MessagesScrollMethods = {
    _showLoadSkeleton() {
      const slot = document.getElementById('load-slot');
      if (slot) slot.classList.add('loading');
      return slot || null;
    },
    _hideLoadSkeleton() {
      const slot = document.getElementById('load-slot');
      if (slot) slot.classList.remove('loading');
    },
    setupInfiniteScroll() {
      const box = $('#messages');
      box.addEventListener('scroll', async () => {
        if (box.scrollTop >= 60 || this.loading || !this.activeThread) return;
        const local = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
        if (local.hasMore) {
          this.loading = true;
          const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
          const { items } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
          this.oldestTs = items.length ? items[0].ts : this.oldestTs;
          const frag = document.createDocumentFragment();
          const loader = $('#load-older');
          items.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
          box.insertBefore(frag, loader.nextSibling);
          box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          this.loading = false;
          return;
        }
        // local esgotado → tenta buscar no servidor (Supabase .range) — com faixa fina
        if (!Sync.fetchNotesPage) return;
        this.loading = true;
        // âncoras ANTES da faixa: o scrollTop final é calculado por distância-do-pé,
        // então a faixa precisa entrar DEPOIS da captura e sair ANTES da aplicação
        const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
        const skel = this._showLoadSkeleton();
        try {
          const serverItems = await Sync.fetchNotesPage(this.activeThread, this.oldestTs, PAGE_SIZE);
          if (!serverItems.length) return;
          serverItems.forEach(n => Store.upsertNote(n));
          // cura de double-send: gêmeas (texto idêntico + ts quase igual) vindas do
          // servidor nas páginas antigas são descartadas e apagadas lá
          Store.dedupeIdentical(this.activeThread).forEach((r) => Sync.send('note:delete', { threadId: this.activeThread, clientId: r.clientId }));
          // pega do Store o que acabou de inserir (garante sortOrder)
          const { items } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
          // fallback: se pageNotes não retornou os recém-inseridos (ex: beforeTs null), usa serverItems
          const toRender = items.length ? items : serverItems;
          if (!toRender.length) return;
          this.oldestTs = toRender[0].ts;
          const frag = document.createDocumentFragment();
          const loader = $('#load-older');
          toRender.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
          box.insertBefore(frag, loader.nextSibling);
        } catch (e) { console.warn('fetch page fail', e); }
        finally {
          this._hideLoadSkeleton(skel); // faixa sai ANTES da âncora (não sobra espaço fantasma)
          box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          this.loading = false;
        }
      });
    },
};
