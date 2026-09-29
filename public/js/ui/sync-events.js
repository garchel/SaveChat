import { $ } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';

export const SyncEventsMethods = {
bindSync() {
      Sync.on('snapshot', (db) => {
        // fingerprint da conversa aberta ANTES do merge — se o snapshot não mudou
        // nada visível (reconexões frequentes re-baixam tudo), pula o re-render
        // completo que causava o "flash" ao criar nota/logo após o envio
        const fp = (tid) => JSON.stringify((Store.notesFor(tid) || []).map((n) => [n.clientId, n.text, n.sortOrder, n.editedAt, n.rev]));
        const beforeActive = this.activeThread ? fp(this.activeThread) : '';
        if (db.threads) Object.values(db.threads).forEach((t) => Store.upsertThread(t));
        if (db.folders) Object.values(db.folders).forEach((f) => Store.upsertFolder(f));
        if (db.notes) Object.entries(db.notes).forEach(([tid, arr]) => {
          arr.forEach((n) => {
            const eff = Store.upsertNote(n);
            // gêmea absorvida pelo guard estrutural: apaga a linha no servidor
            if (eff && eff.clientId !== n.clientId) Sync.send('note:delete', { threadId: tid, clientId: n.clientId });
          });
          // cura de double-send: gêmeas vindas do servidor (builds antigos enviavam
          // a mesma nota com client_id diferentes) são descartadas e apagadas lá
          Store.dedupeIdentical(tid).forEach((r) => Sync.send('note:delete', { threadId: tid, clientId: r.clientId }));
        });
        this.renderTree();
        if (this.activeThread && fp(this.activeThread) !== beforeActive) { this.oldestTs = null; this.renderedClientIds = new Set(); this.renderMessages(true); this.updatePinButton(); }
      });
      Sync.on('note:upsert', (n) => {
        const eff = Store.upsertNote(n);
        // gêmea absorvida pelo guard estrutural anti-double-fire: a existente venceu —
        // apaga a chegada no servidor e não renderiza nada
        if (eff && eff.clientId !== n.clientId) {
          Sync.send('note:delete', { threadId: n.threadId, clientId: n.clientId });
          return;
        }
        // cura de double-send: se a nota recebida for gêmea de uma já existente
        // (texto idêntico + autor + ts quase igual), não renderiza e apaga no servidor
        const removed = Store.dedupeIdentical(n.threadId);
        if (removed.some((r) => r.clientId === n.clientId)) {
          Sync.send('note:delete', { threadId: n.threadId, clientId: n.clientId });
          this.updateNoteCount();
          return;
        }
        if (removed.length) removed.forEach((r) => Sync.send('note:delete', { threadId: n.threadId, clientId: r.clientId }));
        if (this.activeThread === n.threadId) this.appendNoteRealtime(n, true);
        this.updateNoteCount();
        // atualiza backlinks se a thread aberta foi mencionada
        if (this.activeThread && n.text && n.text.includes(`(t:${this.activeThread})`)) this.renderBacklinks(this.activeThread);
        const th = Store.getThread(n.threadId);
        if (this.activeThread !== n.threadId) this.toast(`Nova mensagem em "${th ? th.name : 'conversa'}"`, { kind: 'success' });
      });
      // A6 delight: nota de OUTRO usuário na thread aberta → slide do topo + tint azulado
      Sync.on('note:remote', (n) => {
        if (this.activeThread !== n.threadId) return;
        // defesa extra: eco da própria nota NUNCA tinta (o filtro por user_id vive
        // no subscribe; este cobre payload sem uid — mesmos checks de `mine` do bubbleEl)
        const me = Store.user || {};
        if (!!n.local || n.userId === me.mail || (!!me.id && n.userId === me.id)) return;
        const el = document.querySelector(`.bubble[data-client-id="${n.clientId}"]`);
        if (el && !el.classList.contains('incoming-note')) {
          el.classList.add('incoming-note');
          setTimeout(() => el.classList.remove('incoming-note'), 900);
        }
      });
      Sync.on('note:edit', ({ threadId, clientId, text, edited, editedAt, rev }) => {
        const arr = Store.notesFor(threadId); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        const incoming = editedAt || 0, local = n.editedAt || 0;
        const incomingRev = rev || 0, localRev = n.rev || 0;
        if (incoming < local || (incoming === local && incomingRev <= localRev)) return;
        n.text = text; n.edited = edited; n.editedAt = editedAt; n.rev = incomingRev; Store.save();
        if (this.activeThread === threadId) this._replaceBubble(clientId, n);
        if (this.activeThread && text && text.includes(`(t:${this.activeThread})`)) this.renderBacklinks(this.activeThread);
      });
      Sync.on('note:tags', ({ threadId, clientId, tags }) => {
        const arr = Store.notesFor(threadId); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        n.tags = tags || []; Store.save();
        if (this.activeThread === threadId) this._replaceBubble(clientId, n);
      });
      // sync de reações (P0): mapa completo de OUTRO device → união dos que chegaram
      // + remoção dos que saíram; se este device também mexeu nas reações nesse meio-
      // tempo, o estado local vence (reenviado no próximo toggle)
      Sync.on('note:reactions', ({ threadId, clientId, reactions }) => {
        const local = Store.reactionsOf(threadId, clientId);
        const gone = {};
        Object.entries(local || {}).forEach(([e2, users]) => {
          const inc = (reactions && reactions[e2]) || [];
          const missing = users.filter((u) => !inc.includes(u));
          if (missing.length) gone[e2] = missing;
        });
        const updated = Store.updateReaction(threadId, clientId, reactions || {});
        if (Object.keys(gone).length) Store.removeReactions(threadId, clientId, gone);
        if (updated && this.activeThread === threadId) this._replaceBubble(clientId, updated);
      });
      Sync.on('note:pin', ({ threadId, clientId }) => {
        const th = Store.getThread(threadId); if (!th) return;
        const wasPinned = (th.pinnedId === clientId);
        th.pinnedId = wasPinned ? null : clientId; Store.save();
        if (this.activeThread === threadId) {
          this.renderedClientIds = new Set(); this.renderMessages(true); this.updatePinButton();
        }
        // notifica em ambos os casos (fixou / desfixou)
        this.toast(wasPinned ? `Nota desfixada em "${th.name}"` : `Nota fixada em "${th.name}"`, { kind: 'pin' });
      });
      Sync.on('note:reorder', ({ threadId, order }) => {
        const arr = Store.notesFor(threadId); if (!arr || !order) return;
        order.forEach(({ clientId, sortOrder }) => {
          const n = arr.find((x) => x.clientId === clientId); if (n) n.sortOrder = sortOrder;
        });
        // re-renderiza na nova ordem
        if (this.activeThread === threadId) {
          this.oldestTs = null; this.renderedClientIds = new Set(); this.renderMessages(true);
        }
      });
      Sync.on('note:delete', ({ threadId, clientId }) => {
        const wasOpen = this.activeThread === threadId;
        Store.deleteNote(threadId, clientId);
        const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`); if (el) el.remove();
        this.renderedClientIds.delete(clientId);
        const box = document.getElementById('messages');
        // mesmo bug do deleteNote local: separador órfão + espaço guardado
        if (box && wasOpen) {
          this._pruneOrphanDaySeps(box);
          if (!(Store.notesFor(threadId) || []).length) {
            document.getElementById('empty-state')?.classList.remove('hidden');
          }
          requestAnimationFrame(() => this._syncScrollMetrics());
        }
        if (wasOpen) this.updatePinButton();
      });
      Sync.on('thread:upsert', (t) => {
        const isNew = !Store.data.threads[t.id];
        Store.upsertThread(t); this.queueRenderTree();
        if (this.activeThread === t.id) this.updatePinButton();
        if (isNew) this.toast(`Nova conversa: "${t.name}"`);
      });
      Sync.on('thread:delete', ({ id }) => { delete Store.data.threads[id]; delete Store.data.notes[id]; Store.save(); this.queueRenderTree(); });
      Sync.on('folder:upsert', (f) => { Store.upsertFolder(f); this.queueRenderTree(); });
      Sync.on('folder:delete', ({ id }) => { Store.deleteFolder(id, false); this.queueRenderTree(); });
      Sync.on('thread:move', ({ threadId, folderId, beforeId }) => {
        Store.moveThread(threadId, folderId || null, beforeId || null);
        this.setManualSort();
        this.queueRenderTree();
      });
    },
};
