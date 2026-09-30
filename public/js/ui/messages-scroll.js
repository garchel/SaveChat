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
        // (sortOrder). Misturar os dois travava o scroll.
        const local = Store.pageNotes(this.activeThread, this.oldestKey, PAGE_SIZE);

        // O caminho local entra quando HÁ ITENS a entregar — não quando há
        // "mais" para entregar. `hasMore` responde "existe algo ANTES desta
        // página", que é outra pergunta: a última página de uma conversa
        // vem com `hasMore: false` e mesmo assim precisa ser pintada.
        // Medido: 60 notas, a 3ª página devolvia 10 itens com `hasMore: false`
        // e o guard antigo (hasMore) jogava as 10 fora — a conversa parava
        // em 50 e as mais antigas nunca apareciam.
        if (local.items.length) {
          this.loading = true;
          const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
          const { items, cursor, oldestTs } = local;
          // as mensagens entram logo abaixo do SLOT, que fica no topo do
          // fluxo e está sempre presente (é ele que segura o indicador)
          const slot = $('#load-slot');
          const frag = document.createDocumentFragment();
          // `renderedClientIds` é o filtro de idempotência: a mesma nota
          // nunca entra duas vezes, mesmo que a página seja reemprida.
          for (const n of items) {
            if (this.renderedClientIds.has(n.clientId)) continue;
            this.renderedClientIds.add(n.clientId);
            frag.appendChild(this.bubbleEl(n));
          }
          // A âncora avança sempre que a página foi lida, mesmo se o filtro
          // não inseriu nada: `oldestKey` é "até onde já paginei", e essa
          // página foi consumida do mesmo jeito. Sem isto o scroll repete a
          // mesma requisição para sempre.
          this.oldestKey = cursor;
          this.oldestTs = oldestTs;
          if (frag.childNodes.length) box.insertBefore(frag, slot.nextSibling);

          // Âncora por DISTÂNCIA-DO-PÉ: as mensagens novas entram ACIMA do
          // ponto de vista, então o scrollTop anda pelo tanto que o conteúdo
          // cresceu — a mensagem que o usuário lia fica parada na tela.
          //
          // A guarda `scrollHeight !== prevHeight` é o que impede o puxão:
          // com delta zero não se escreve NADA no scrollTop. Reescrever
          // `prevTop` de qualquer jeito sobrescreveria a posição que o
          // usuário acabou de escolher rolando para baixo.
          if (box.scrollHeight !== prevHeight) {
            box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          }
          this.loading = false;
          return;
        }

        // local esgotado → tenta buscar no servidor (Supabase .range)
        if (!Sync.fetchNotesPage) return;
        // Sem sessão não há o que buscar: acender o indicador aqui seria
        // mostrar "Carregando mensagens…" para um servidor que não existe.
        if (!Sync.supa) return;
        // O servidor acabou de responder "não tem mais nada" para esta
        // conversa. Sem esta marca, cada rolagem de volta ao topo refazia a
        // mesma consulta e reacendia o indicador para sempre. É um COOLDOWN
        // curto, não um cache eterno: mensagens antigas podem chegar depois
        // (outro dispositivo, sync em atraso) e têm de poder carregar.
        if (this.serverExhaustedUntil && Date.now() < this.serverExhaustedUntil) return;
        this.loading = true;
        // âncoras ANTES da faixa: o scrollTop final é calculado por
        // distância-do-pé, então a faixa precisa entrar DEPOIS da captura e
        // sair ANTES da aplicação
        const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
        // O indicador só entra se a resposta demorar mais que este limite.
        // Boa parte dos casos é o servidor respondendo VAZIO em poucos ms (a
        // página é curta, ou o local já tinha tudo): acender aí mostrava
        // "Carregando mensagens…" para nada e apagava em seguida. Resposta
        // lenta é que merece o aviso.
        let skel = null;
        const delay = setTimeout(() => { skel = this._showLoadSkeleton(); }, 250);
        try {
          const serverItems = await Sync.fetchNotesPage(this.activeThread, this.oldestTs, PAGE_SIZE);
          if (!serverItems.length) { this.serverExhaustedUntil = Date.now() + 30000; return; }
          serverItems.forEach(n => Store.upsertNote(n));
          // cura de double-send: gêmeas (texto idêntico + ts quase igual)
          // vindas do servidor nas páginas antigas são descartadas e apagadas lá
          Store.dedupeIdentical(this.activeThread).forEach((r) => Sync.send('note:delete', { threadId: this.activeThread, clientId: r.clientId }));
          // pega do Store o que acabou de inserir (garante sortOrder)
          const { items, cursor, oldestTs } = Store.pageNotes(this.activeThread, this.oldestKey, PAGE_SIZE);
          // fallback: se pageNotes não retornou os recém-inseridos (ex:
          // âncora null), usa serverItems
          const toRender = items.length ? items : serverItems;
          if (!toRender.length) return;
          this.oldestTs = oldestTs != null ? oldestTs : toRender[0].ts;
          this.oldestKey = cursor != null ? cursor : this.oldestKey;
          const frag = document.createDocumentFragment();
          const slot = $('#load-slot');
          for (const n of toRender) {
            if (this.renderedClientIds.has(n.clientId)) continue;
            this.renderedClientIds.add(n.clientId);
            frag.appendChild(this.bubbleEl(n));
          }
          if (frag.childNodes.length) box.insertBefore(frag, slot.nextSibling);
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
