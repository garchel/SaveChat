import { $ } from './utils.js';
import { Store } from './store.js';
import { OfflineQueue } from './offline-queue.js';

// CONFIGURAÇÃO DE SINCRONIZAÇÃO (Supabase — definido em index.html)
  // ---------------------------------------------------------------------
  // CONFIGURAÇÃO DE SINCRONIZAÇÃO (Supabase — definido em index.html)
  export const SUPABASE_URL = (typeof window !== 'undefined' && window.SUPABASE_URL) || '';
  export const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) || '';
  export const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  // singleton Supabase client — memoiza a PROMISE para chamadas concorrentes
  let _supaPromise = null;
  export function getSupa() {
    if (!_supaPromise) {
      _supaPromise = import('https://esm.sh/@supabase/supabase-js@2.112.3').then(m => m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    }
    return _supaPromise;
  }

  // ===================================================================
  // SYNC (Supabase: Postgres + Realtime + RLS — sem backend próprio)
  // ===================================================================
  export const SupaSync = {
    supa: null, channel: null, handlers: {}, lastSync: 0, connected: false,
    on(type, fn) { this.handlers[type] = fn; },
    emit(type, payload) { this.lastSync = Date.now(); if (this.handlers[type]) this.handlers[type](payload); },
    _connecting: false,
    _uidCache: null,
    _lastStatus: null, _lastStatusAt: 0,
    setStatus(s) {
      if (s === this._lastStatus) return;
      const now = Date.now();
      // debounce só para 'connecting' (evita frenesi); online/offline sempre aplicam
      if (s === 'connecting' && this._lastStatus && now - this._lastStatusAt < 400) return;
      this._lastStatus = s; this._lastStatusAt = now;
      const el = $('#sync-status');
      // banner de erro no composer: visível em offline, escondido quando online
      if (window.NoteThread && window.NoteThread.UI) {
        if (s === 'offline') window.NoteThread.UI.showSyncError();
        else if (s === 'online') window.NoteThread.UI.hideSyncError();
      }
      if (!el) return;
      el.className = 'sync-status ' + s;
      el.dataset.state = s;
      el.dataset.status = s === 'online' ? 'Sincronizado' : s === 'connecting' ? 'Conectando…' : 'Offline — suas notas ficam salvas neste dispositivo';
      while (el.firstChild) el.removeChild(el.firstChild);
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('fill', 'currentColor');
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '7');
      svg.appendChild(circle);
      el.appendChild(svg);
      if (window.NoteThread && window.NoteThread.UI) window.NoteThread.UI.updateSyncLabel();
    },
    // uid da sessão LOCAL (sem rede) — getUser() fazia request por evento e falhava silencioso
    async _uid() {
      if (!this.supa) return null;
      if (this._uidCache) return this._uidCache;
      const { data: { session } } = await this.supa.auth.getSession();
      this._uidCache = session && session.user ? session.user.id : null;
      return this._uidCache;
    },
    // grava linha na tabela profiles ao logar
    async ensureProfile(user) {
      if (!this.supa || !user) return;
      try {
        await this.supa.from('profiles').upsert({ id: user.id, email: user.email, name: (user.email || 'u').split('@')[0] });
      } catch (e) { console.warn('[supabase] profile save fail', e); }
    },
    async connect() {
      if (this._connecting || (this.connected && this.supa)) return;
      // offline: não tenta conectar repetidamente
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.setStatus('offline'); return; }
      this._connecting = true;
      this.setStatus('connecting');
      if (!USE_SUPABASE) { this._connecting = false; this.setStatus('offline'); return; }
      const t = setTimeout(() => { if (!this.connected) { this.setStatus('offline');  } this._connecting = false; }, 8000);
      try {
        this.supa = await getSupa();
        const { data: { session } } = await this.supa.auth.getSession();
        this._uidCache = session && session.user ? session.user.id : null;
        this.supa.auth.onAuthStateChange((_ev, sess) => {
          if (sess && sess.user) {
            Store.setUser({ name: sess.user.email.split('@')[0], mail: sess.user.email, provider: 'supabase', id: sess.user.id });
            this._uidCache = sess.user.id;
            this.ensureProfile(sess.user);
            if (window.NoteThread && window.NoteThread.UI) window.NoteThread.UI.renderMe();
          } else {
            this._uidCache = null;
          }
        });
        if (session && session.user) {
          Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
          this.ensureProfile(session.user);
        }
        this.connected = true; this.setStatus('online'); clearTimeout(t); this._connecting = false;
        // online: 1º reenvia eventos pendentes (checkboxes/edições), DEPOIS snapshot
        // (assim o snapshot já traz o estado mais novo e não desfaz mudanças locais)
        if (navigator.onLine !== false) {
          await this.flushQueue();
          await this.loadSnapshot();
        }
        if (this.connected) this.subscribe();
      } catch (e) { clearTimeout(t); this._connecting = false; console.warn('[supabase] connect fail', e); this.setStatus('offline'); }
    },
    async loadSnapshot() {
      // paginado: só últimas 200 notas para não pesar Brave (base64) — infinite scroll carrega resto sob demanda
      const [th, fo, no] = await Promise.all([
        this.supa.from('threads').select('*').order('updated_at', { ascending: false }).limit(100),
        this.supa.from('folders').select('*').limit(100),
        this.supa.from('notes').select('*').order('ts', { ascending: false }).limit(200)
      ]);
      const payload = {
        threads: Object.fromEntries((th.data || []).map(t => [t.id, { id: t.id, name: t.name, emoji: t.emoji, color: t.color || undefined, folderId: t.folder_id, favorite: t.favorite, pinnedId: t.pinned_id, createdAt: new Date(t.created_at).getTime(), updatedAt: new Date(t.updated_at).getTime(), lastPreview: t.last_preview }])),
        folders: Object.fromEntries((fo.data || []).map(f => [f.id, { id: f.id, name: f.name, emoji: f.emoji, color: f.color || undefined, parentId: f.parent_id, createdAt: new Date(f.created_at).getTime() }])),
        notes: (() => { const m = {}; (no.data || []).forEach(n => { (m[n.thread_id] = m[n.thread_id] || []).push({ clientId: n.client_id, threadId: n.thread_id, text: n.text, images: n.images || [], tags: n.tags || [], ts: Number(n.ts), sortOrder: n.sort_order, edited: n.edited, editedAt: n.edited_at, rev: n.rev, remindAt: n.remind_at ? Number(n.remind_at) : null, remindFired: !!n.remind_fired, ...(n.reactions && Object.keys(n.reactions).length ? { reactions: n.reactions } : {}), userId: Store.user ? Store.user.mail : 'anon' }); }); return m; })()
      };
      this.emit('snapshot', payload);
    },
    subscribe() {
      if (this.channel) try { this.supa.removeChannel(this.channel); } catch {}
      // usa sessão local (sem rede); filtra por user_id
      this.supa.auth.getSession().then(({ data: { session } }) => {
        const uid = session && session.user ? session.user.id : null;
        const filt = uid ? `user_id=eq.${uid}` : undefined;
        const ch = this.supa.channel('notethread')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', ...(filt?{filter:filt}:{}) }, (p) => {
            const r = p.new || p.old; if (!r) return;
            if (p.eventType === 'DELETE') this.emit('note:delete', { threadId: r.thread_id, clientId: r.client_id });
            else {
              const payload = { clientId: r.client_id, threadId: r.thread_id, text: r.text, images: (r.images||[]).slice(0,2), tags: r.tags || [], ts: Number(r.ts), sortOrder: r.sort_order, edited: r.edited, editedAt: r.edited_at, rev: r.rev, ...(r.reactions && Object.keys(r.reactions).length ? { reactions: r.reactions } : {}), userId: r.user_id };
              this.emit('note:upsert', payload);
              // A6: evento separado APENAS para nota de OUTRO usuário (tint de chegada).
              // Antes disparava também no eco da própria nota → a bolha piscava azul
              // ~300ms após cada envio (parecia a animação de envio repetindo 2-3x)
              if (uid && r.user_id && r.user_id !== uid) this.emit('note:remote', payload);
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', ...(filt?{filter:filt}:{}) }, (p) => {
            const r = p.new || p.old; if (!r) return;
            if (p.eventType === 'DELETE') this.emit('thread:delete', { id: r.id });
            else this.emit('thread:upsert', { id: r.id, name: r.name, emoji: r.emoji, color: r.color || undefined, folderId: r.folder_id, favorite: r.favorite, pinnedId: r.pinned_id, createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(), lastPreview: r.last_preview });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'folders', ...(filt?{filter:filt}:{}) }, (p) => {
            const r = p.new || p.old; if (!r) return;
            if (p.eventType === 'DELETE') this.emit('folder:delete', { id: r.id });
            else this.emit('folder:upsert', { id: r.id, name: r.name, emoji: r.emoji, color: r.color || undefined, parentId: r.parent_id, createdAt: new Date(r.created_at).getTime() });
          })
          .subscribe();
        this.channel = ch;
      });
    },
    // fila offline robusta — IndexedDB com backoff exponencial + Background Sync
    async _enqueue(type, payload) {
      await OfflineQueue.add(type, payload);
      OfflineQueue.registerSync();
      // fallback para offline: tenta reenviar quando voltar online
      window.addEventListener('online', () => this.flushQueue(), { once: true });
    },
    async flushQueue() {
      const q = await OfflineQueue.getAll();
      if (!q.length || !this.supa) return;
      const nowTs = Date.now();
      for (const item of q) {
        if (item.nextRetry && item.nextRetry > nowTs) continue;
        try {
          this.lastSync = Date.now();
          await this._doSend(item.type, item.payload);
          await OfflineQueue.remove(item.id);
        } catch (e) {
          await OfflineQueue.bump(item.id);
        }
      }
      const rest = await OfflineQueue.getAll();
      if (!q.length || !rest.length) {
        if (window.NoteThread && window.NoteThread.UI) window.NoteThread.UI.toast('Sincronização restaurada', { kind: 'success' });
        this._warnedFail = false;
      }
    },
    async send(type, payload) {
      if (!this.supa) return;
      this.lastSync = Date.now();
      try {
        await this._doSend(type, payload);
      } catch (e) {
        console.warn('[supabase] send fail', type, e);
        await this._enqueue(type, payload);
        if (!this._warnedFail && window.NoteThread && window.NoteThread.UI) {
          this._warnedFail = true;
          window.NoteThread.UI.toast('Falha ao sincronizar — será reenviado automaticamente', { kind: 'error' });
        }
      }
    },
    async fetchNotesPage(threadId, beforeTs, count) {
      if (!this.supa) return [];
      let q = this.supa.from('notes').select('*').eq('thread_id', threadId).order('ts', { ascending: false }).limit(count || 25);
      if (beforeTs != null) q = q.lt('ts', beforeTs);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).reverse().map(n => ({ clientId: n.client_id, threadId: n.thread_id, text: n.text, images: n.images||[], tags: n.tags||[], ts: Number(n.ts), sortOrder: n.sort_order, edited: n.edited, editedAt: n.edited_at, rev: n.rev, remindAt: n.remind_at ? Number(n.remind_at) : null, remindFired: !!n.remind_fired, ...(n.reactions && Object.keys(n.reactions).length ? { reactions: n.reactions } : {}), userId: Store.user ? Store.user.mail : 'anon' }));
    },
    async _doSend(type, payload) {
      const uid = await this._uid(); if (!uid) throw new Error('sem sessão');
      if (type === 'note:upsert') {
        const n = payload;
        const row = { client_id: n.clientId, thread_id: n.threadId, text: n.text, images: n.images || [], tags: n.tags || [], ts: n.ts, sort_order: n.sortOrder || 0, edited: !!n.edited, edited_at: n.editedAt || null, rev: n.rev || 0, remind_at: n.remindAt || null, remind_fired: !!n.remindFired, reactions: n.reactions || {}, user_id: uid };
        // (supabase-js devolve { error } em vez de lançar — checar o resultado)
        let res = await this.supa.from('notes').upsert(row, { onConflict: 'client_id' });
        // servidor sem a migração reactions (v1.8.0, erro 42703): reenvia SEM a
        // coluna para não derrubar o sync de notas como um todo
        if (res.error && (res.error.code === '42703' || /reactions/i.test(res.error.message || ''))) {
          delete row.reactions;
          res = await this.supa.from('notes').upsert(row, { onConflict: 'client_id' });
        }
        if (res.error) throw res.error;
      } else if (type === 'note:reactions') {
        // reações por nota: grava exatamente o mapa local (única fonte de verdade,
        // o conflito é resolvido pelo merge por usuário/emoji no Store)
        const res = await this.supa.from('notes').update({ reactions: payload.reactions || {} }).eq('client_id', payload.clientId);
        // sem a coluna no servidor ainda (42703): não enfileira retry infinito
        if (res.error && !(res.error.code === '42703' || /reactions/i.test(res.error.message || ''))) throw res.error;
        else if (res.error) console.warn('[supabase] coluna reactions ausente — rode o supabase.sql atualizado');
      } else if (type === 'note:remind') {
        await this.supa.from('notes').update({ remind_at: payload.remindAt || null, remind_fired: !!payload.remindFired }).eq('client_id', payload.clientId);
      } else if (type === 'thread:upsert') {
        const t = payload; await this.supa.from('threads').upsert({ id: t.id, name: t.name, emoji: t.emoji, color: t.color || null, folder_id: t.folderId || null, favorite: !!t.favorite, pinned_id: t.pinnedId || null, updated_at: new Date().toISOString(), last_preview: t.lastPreview || '', user_id: uid }, { onConflict: 'id' });
      } else if (type === 'thread:delete') {
        await this.supa.from('threads').delete().eq('id', payload.id);
      } else if (type === 'folder:upsert') {
        const f = payload; await this.supa.from('folders').upsert({ id: f.id, name: f.name, emoji: f.emoji, color: f.color || null, parent_id: f.parentId || null, user_id: uid }, { onConflict: 'id' });
      } else if (type === 'folder:delete') {
        await this.supa.from('folders').delete().eq('id', payload.id);
      } else if (type === 'note:delete') {
        await this.supa.from('notes').delete().eq('client_id', payload.clientId);
      } else if (type === 'note:edit') {
        await this.supa.from('notes').update({ text: payload.text, edited: payload.edited !== undefined ? !!payload.edited : true, edited_at: payload.editedAt, rev: payload.rev }).eq('client_id', payload.clientId);
      } else if (type === 'note:tags') {
        await this.supa.from('notes').update({ tags: payload.tags }).eq('client_id', payload.clientId);
      } else if (type === 'note:pin') {
        // usa estado explícito do payload (não recomputa — Store local já foi flipado)
        const cur = payload.pinned ? payload.clientId : null;
        await this.supa.from('threads').update({ pinned_id: cur }).eq('id', payload.threadId);
      } else if (type === 'thread:move') {
        await this.supa.from('threads').update({ folder_id: payload.folderId || null }).eq('id', payload.threadId);
      }
    },

    // LB-W3 fix: apaga TODOS os dados do usuário no Supabase (RLS limita ao próprio user_id).
    // Usado pelo "Apagar tudo" — sem isso os dados ressincronizam ao recarregar (risco LGPD).
    async deleteAllRemote() {
      if (!this.supa) return { ok: false, reason: 'sem supabase' };
      try {
        const uid = await this._uid();
        if (!uid) return { ok: false, reason: 'sem sessão' };
        // ordem importa: notes → threads/folders (notas referenciam thread_id)
        const delNotes = await this.supa.from('notes').delete().neq('client_id', '');
        const delThreads = await this.supa.from('threads').delete().neq('id', '');
        const delFolders = await this.supa.from('folders').delete().neq('id', '');
        const errors = [delNotes.error, delThreads.error, delFolders.error].filter(Boolean);
        if (errors.length) {
          console.warn('[supabase] deleteAllRemote falhou', errors);
          return { ok: false, reason: errors[0].message };
        }
        return { ok: true };
      } catch (e) {
        console.warn('[supabase] deleteAllRemote exceção', e);
        return { ok: false, reason: String((e && e.message) || e) };
      }
    }
  };

  export const Sync = SupaSync;

