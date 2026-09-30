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
        // `oldestTs` é o timestamp usado CONTRA o Supabase (.lt('ts')); a
        // paginação local anda por `oldestKey`, que é a chave de ordenação
        // (sortOrder). Misturar os dois travava o scroll: o findIndex
        // comparava sortOrder contra um ts e devolvia a mesma página para
        // sempre — indicador acendendo sem nada a carregar, e o scroll
        // voltando para o topo a cada rolagem.
        const local = Store.pageNotes(this.activeThread, this.oldestKey, PAGE_SIZE);
        if (local.hasMore) {
          this.loading = true;
          const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
          const { items, cursor, oldestTs } = local;
          if (items.length) {
            this.oldestKey = cursor;
            this.oldestTs = oldestTs;
            const frag = document.createDocumentFragment();
            const loader = $('#load-older');
            items.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
            box.insertBefore(frag, loader.nextSibling);
          }
          // Âncora MESMA em qualquer caminho: se nada foi inserido, o
          // delta é zero e o scroll não se move. A conta é a distância-do-pé
          // (scrollHeight crescendo acima do ponto de vista).
          if (box.scrollHeight !== prevHeight) {
            box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          }
          this.loading = false;
          return;
        }
        // local esgotado → tenta buscar no servidor (Supabase .range) — com faixa fina
        if (!Sync.fetchNotesPage) return;
        // Sem sessão não há o que buscar: acender o indicador aqui seria
        // mostrar "Carregando mensagens…" para um servidor que não existe.
        if (!Sync.supa) return;
        // O servidor acabou de responder "não tem mais nada" para esta
        // conversa. Sem esta marca, cada rolagem de volta ao topo refazia a
        // mesma consulta e reacendia o indicador para sempre. É um COOLDOWN
        // curto, não um cache eterno: mensagens antigas podem chegar depois
        // (outro dispositivo, sync em atraso) e têm de poder carregar — com
        // uma marca permanente elas nunca mais entravam.
        if (this.serverExhaustedUntil && Date.now() < this.serverExhaustedUntil) return;
        this.loading = true;
        // âncoras ANTES da faixa: o scrollTop final é calculado por distância-do-pé,
        // então a faixa precisa entrar DEPOIS da captura e sair ANTES da aplicação
        const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
        // O indicador só entra se a resposta demorar mais que este limite.
        // Boa parte dos casos é o servidor respondendo VAZIO em poucos ms (a
        // página é curta, ou o local já tinha tudo): acender aí mostrava
        // "Carregando mensagens…" para nada e apagava em seguida — o piscar
        // que o usuário reclamava. Resposta lenta é que merece o aviso.
        let skel = null;
        const delay = setTimeout(() => { skel = this._showLoadSkeleton(); }, 250);
        try {
          const serverItems = await Sync.fetchNotesPage(this.activeThread, this.oldestTs, PAGE_SIZE);
          if (!serverItems.length) { this.serverExhaustedUntil = Date.now() + 30000; return; }
          serverItems.forEach(n => Store.upsertNote(n));
          // cura de double-send: gêmeas (texto idêntico + ts quase igual) vindas do
          // servidor nas páginas antigas são descartadas e apagadas lá
          Store.dedupeIdentical(this.activeThread).forEach((r) => Sync.send('note:delete', { threadId: this.activeThread, clientId: r.clientId }));
          // pega do Store o que acabou de inserir (garante sortOrder)
          const { items, cursor, oldestTs } = Store.pageNotes(this.activeThread, this.oldestKey, PAGE_SIZE);
          // fallback: se pageNotes não retornou os recém-inseridos (ex: âncora null), usa serverItems
          const toRender = items.length ? items : serverItems;
          if (!toRender.length) return;
          this.oldestTs = oldestTs != null ? oldestTs : toRender[0].ts;
          const frag = document.createDocumentFragment();
          const loader = $('#load-older');
          toRender.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
          box.insertBefore(frag, loader.nextSibling);
        } catch (e) { console.warn('fetch page fail', e); }
        finally {
          clearTimeout(delay);
          this._hideLoadSkeleton(skel); // faixa sai ANTES da âncora (não sobra espaço fantasma)
          // Só ancora se algo entrou ACIMA do ponto de vista. Sem esta
          // guarda, `box.scrollHeight - prevHeight` é 0 e a linha abaixo
          // reescreve o scrollTop com o valor que o USUÁRIO tinha acabado de
          // escolher — Waswo o scroll de volta para o topo no meio da rolagem.
          if (box.scrollHeight !== prevHeight) {
            box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          }
          this.loading = false;
        }
      });
    },
};
