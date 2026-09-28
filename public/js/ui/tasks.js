import { esc, fmtTime, haptic } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';

// ---------- Visão "Pendências" (v1.8.2) ----------
// Todos os itens de checklist não concluídos de TODAS as conversas numa tela
// única. O índice do checkbox é GLOBAL no texto (mesma regra do
// toggleNoteCheckbox em messages.js: toda linha `[ ]`/`[x]` conta, aninhada ou
// não) — marcar aqui edits a nota de origem e sincroniza pelo evento note:edit.
export const TasksMethods = {
  showTasksPage() {
    const page = document.getElementById('tasks-page');
    if (!page) return;
    document.getElementById('messages').classList.add('hidden');
    document.getElementById('backlinks')?.classList.add('hidden');
    document.getElementById('live-region')?.classList.add('hidden');
    document.getElementById('search-page')?.classList.add('hidden');
    document.getElementById('reminders-page')?.classList.add('hidden');
    page.classList.remove('hidden');
    this.renderTasksPage();
    this.updateTasksBadge();
  },

  hideTasksPage() {
    const page = document.getElementById('tasks-page');
    if (page) page.classList.add('hidden');
    document.getElementById('messages').classList.remove('hidden');
    document.getElementById('backlinks')?.classList.remove('hidden');
  },

  // todas as pendências abertas, da conversa mexida mais recentemente para a mais antiga
  _allOpenTasks() {
    const out = [];
    Object.entries(Store.data.notes).forEach(([tid, arr]) => {
      const th = Store.getThread(tid);
      if (!th || !arr || !arr.length) return;
      (arr || []).forEach((n) => {
        if (!n.text) return;
        let i = -1;
        const lines = n.text.split('\n');
        for (const l of lines) {
          const m = l.match(/^\s*\[( |x)\]\s*(.*)$/i);
          if (!m) continue;
          i += 1;
          if (m[1].toLowerCase() === 'x') continue; // só as abertas
          const txt = m[2].trim();
          if (!txt) continue;
          out.push({ threadId: tid, clientId: n.clientId, index: i, text: txt, ts: n.ts, threadName: th.name, threadEmoji: th.emoji, threadAt: th.updatedAt || 0 });
        }
      });
    });
    out.sort((a, b) => b.threadAt - a.threadAt);
    return out;
  },

  renderTasksPage() {
    const list = document.getElementById('tasks-page-list');
    if (!list) return;
    const items = this._allOpenTasks();
    const count = document.getElementById('tasks-count');
    if (count) count.textContent = items.length ? `${items.length} aberta${items.length !== 1 ? 's' : ''}` : '';
    if (!items.length) {
      list.innerHTML = '<div class="tasks-empty">Nada pendente por aqui 🎉<br/><span style="font-size:12px">Itens de checklist (<code>[ ]</code>) de todas as conversas aparecem nesta lista.</span></div>';
      return;
    }
    list.innerHTML = items.map((t) => `
      <div class="task-row" data-tid="${t.threadId}" data-cid="${t.clientId}" data-chk="${t.index}" role="button" tabindex="0" aria-label="Abrir nota com o item ${esc(t.text)}">
        <input type="checkbox" class="task-chk" aria-label="Concluir ${esc(t.text)}" />
        <span class="task-body">
          <span class="task-text">${esc(t.text)}</span>
          <span class="task-meta">${esc(t.threadEmoji || '')} ${esc(t.threadName || 'Conversa')} · ${fmtTime(t.ts)}</span>
        </span>
        <svg class="task-go" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`).join('');
    // marcar concluída (não propaga para o clique de navegação)
    list.querySelectorAll('.task-row').forEach((row) => {
      const cb = row.querySelector('.task-chk');
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        this.toggleTaskRemote({
          threadId: row.dataset.tid,
          clientId: row.dataset.cid,
          index: +row.dataset.chk,
          checked: cb.checked,
          row,
        });
      });
      // clique/Enter na linha → abre a conversa na nota
      const open = () => {
        this.hideTasksPage();
        this.openThread(row.dataset.tid);
        setTimeout(() => this.scrollToNote(row.dataset.cid), 250);
      };
      row.addEventListener('click', (e) => { if (e.target !== cb) open(); });
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  },

  // marca/desmarca o item na nota de ORIGEM (mesmo contrato do
  // toggleNoteCheckbox) e anima a linha para fora da lista
  toggleTaskRemote({ threadId, clientId, index, checked, row }) {
    const arr = Store.notesFor(threadId);
    const n = arr && arr.find((x) => x.clientId === clientId);
    if (!n) return;
    let i = -1, hit = false;
    const lines = (n.text || '').split('\n');
    const newLines = lines.map((l) => {
      const m = l.match(/^(\s*)\[( |x)\]\s*(.*)$/i);
      if (!m) return l;
      i += 1;
      if (i !== index) return l;
      hit = true;
      return `${m[1]}[${checked ? 'x' : ' '}] ${m[3]}`;
    });
    if (!hit) return;
    n.text = newLines.join('\n');
    n.editedAt = Date.now();
    n.rev = (n.rev || 0) + 1;
    Store.save();
    Sync.send('note:edit', { threadId, clientId, text: n.text, edited: !!n.edited, editedAt: n.editedAt, rev: n.rev });
    Sound.playName('toggle');
    haptic('light');
    // bolha da conversa aberta ao fundo permanece em sync
    if (this.activeThread === threadId) {
      const bubble = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (bubble) this._replaceBubble(clientId, n);
    }
    this.updateTasksBadge();
    // sai da lista com carinho: fade + colapso, depois re-render
    if (checked && row) {
      row.classList.add('task-done');
      setTimeout(() => {
        row.style.maxHeight = row.scrollHeight + 'px';
        void row.offsetHeight;
        row.classList.add('chk-out');
      }, 380);
      setTimeout(() => this.renderTasksPage(), 780);
    } else {
      this.renderTasksPage();
    }
  },

  updateTasksBadge() {
    const badge = document.getElementById('tasks-badge');
    if (!badge) return;
    const count = this._allOpenTasks().length;
    if (count > 0) { badge.textContent = count > 9 ? '9+' : String(count); badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  },
};
