// Backfill da Fase 1: cifra o conteúdo que ainda está em texto claro no
// servidor (notas antigas e prévias de conversa), uma linha por vez.
//
// Retomável por construção: cada rodada busca de novo as linhas que ainda têm
// `text`/`last_preview` em claro. Se a rede cair (ou a aba fechar), a próxima
// execução continua de onde parou sem repetir o que já foi cifrado.
import { encryptNoteText, encryptThreadPreview, decryptNoteText, decryptThreadPreview } from './note-crypto.js';
import { getDek } from './keyring.js';

const PAGE = 25;

// `shouldStop()` é consultado entre lotes (usado pelos testes e por quem quer
// interromper ao ficar offline). `batchSize` também é para teste, assim como
// `dek` (o keyring real só entrega a chave depois do unlock).
export const Backfill = {
  running: false,

  async run(supa, uid, { onProgress, shouldStop, batchSize, dek } = {}) {
    if (!supa || !uid) return { skipped: true, done: 0, total: 0 };
    const key = dek || getDek();
    if (!key) return { skipped: true, done: 0, total: 0 };
    if (this.running) return { skipped: true, done: 0, total: 0 };
    this.running = true;
    const page = Math.max(1, Number(batchSize) || PAGE);
    try {
      const pendingNotes = await this._count(supa, 'notes', uid, 'text');
      const pendingThreads = await this._count(supa, 'threads', uid, 'last_preview', { nonEmpty: true });
      const total = pendingNotes + pendingThreads;
      let done = 0;
      const report = (phase) => {
        if (onProgress) onProgress({ done, total, phase });
      };
      report('notes');

      const seenNotes = new Set();
      for (;;) {
        if (shouldStop && shouldStop()) return { done, total, stopped: true };
        const { data, error } = await supa.from('notes')
          .select('client_id,thread_id,text')
          .eq('user_id', uid)
          .not('text', 'is', null)
          .order('ts', { ascending: true })
          .limit(page);
        if (error) throw error;
        const rows = (data || []).filter((r) => r && !seenNotes.has(r.client_id));
        if (!rows.length) break;

        for (const row of rows) {
          seenNotes.add(row.client_id);
          const enc = await encryptNoteText(
            { text: row.text, threadId: row.thread_id, clientId: row.client_id }, key, uid,
          );
          // `.eq('text', row.text)`: se a nota foi editada no meio do caminho,
          // não sobrescreve a versão nova com a antiga — a próxima rodada pega.
          const { data: updated, error: upErr } = await supa.from('notes')
            .update({ text: null, text_enc: enc.text_enc, enc_version: enc.enc_version })
            .eq('client_id', row.client_id)
            .eq('user_id', uid)
            .eq('text', row.text)
            .select('client_id');
          if (upErr) throw upErr;
          if (!updated || updated.length) { done++; report('notes'); }
        }
      }

      const seenThreads = new Set();
      for (;;) {
        if (shouldStop && shouldStop()) return { done, total, stopped: true };
        const { data, error } = await supa.from('threads')
          .select('id,last_preview')
          .eq('user_id', uid)
          .not('last_preview', 'is', null)
          .neq('last_preview', '')
          .limit(page);
        if (error) throw error;
        const rows = (data || []).filter((r) => r && !seenThreads.has(r.id));
        if (!rows.length) break;

        for (const row of rows) {
          seenThreads.add(row.id);
          const preview = await encryptThreadPreview(row.last_preview, key, uid, row.id);
          const { data: updated, error: upErr } = await supa.from('threads')
            .update({ last_preview: '', last_preview_enc: preview })
            .eq('id', row.id)
            .eq('user_id', uid)
            .eq('last_preview', row.last_preview)
            .select('id');
          if (upErr) throw upErr;
          if (!updated || updated.length) { done++; report('threads'); }
        }
      }

      report('done');
      return { done, total };
    } finally {
      this.running = false;
    }
  },

  // Desligar o PIN: devolve o texto em claro ao servidor. Roda com a DEK em
  // memória (o usuário acabou de digitar o PIN) e é a única forma de desfazer
  // a cifragem — sem a chave, `text_enc` é irrecuperável.
  // Se qualquer decifragem falhar, para na hora e não grava lixo.
  async revert(supa, uid, { onProgress, batchSize, dek } = {}) {
    if (!supa || !uid) return { skipped: true, done: 0, total: 0 };
    const key = dek || getDek();
    if (!key) throw new Error('PIN bloqueado — desbloqueie antes de desligar.');
    const size = batchSize || PAGE;
    let done = 0, total = 0;

    for (;;) {
      const { data, error } = await supa.from('notes')
        .select('client_id, thread_id, text_enc')
        .eq('user_id', uid)
        .not('text_enc', 'is', null)
        .limit(size);
      if (error) {
        // banco sem a coluna: nada a reverter
        if (error.code === '42703') break;
        throw error;
      }
      if (!data || !data.length) break;
      total = Math.max(total, done + data.length);
      for (const row of data) {
        const texto = await decryptNoteText(row, key, uid);
        const { error: upErr } = await supa.from('notes')
          .update({ text: texto, text_enc: null, enc_version: null })
          .eq('client_id', row.client_id).eq('user_id', uid);
        if (upErr) throw upErr;
        done++;
        if (onProgress) onProgress({ done, total });
      }
      if (data.length < size) break;
    }

    for (;;) {
      const { data, error } = await supa.from('threads')
        .select('id, last_preview_enc')
        .eq('user_id', uid)
        .not('last_preview_enc', 'is', null)
        .limit(size);
      if (error) {
        if (error.code === '42703') break;
        throw error;
      }
      if (!data || !data.length) break;
      for (const row of data) {
        const previa = await decryptThreadPreview(row, key, uid);
        const { error: upErr } = await supa.from('threads')
          .update({ last_preview: previa, last_preview_enc: null })
          .eq('id', row.id).eq('user_id', uid);
        if (upErr) throw upErr;
      }
      if (data.length < size) break;
    }

    return { done, total };
  },

  async _count(supa, table, uid, column, { nonEmpty = false } = {}) {
    let q = supa.from(table)
      .select(column, { count: 'exact', head: true })
      .eq('user_id', uid)
      .not(column, 'is', null);
    if (nonEmpty) q = q.neq(column, '');
    const { count, error } = await q;
    // banco antigo sem a coluna: não há o que migrar
    if (error) return 0;
    return Number(count) || 0;
  },
};
