// ---------- Página de Tarefas (v1.20.0) ----------
// Dois acordeões, duas origens:
//
// 1) "Minhas tarefas" — criadas DENTO desta página (CRUD próprio). Não
//    pertencem a nenhuma conversa. Moram em `ui.tasksOwn`, uma lista de
//    { id, text, done, createdAt }. Sincronizam pelo Supabase como
//    preferência da conta? NÃO: ficam em `ui`, que é o escopo do
//    DISPOSITIVO (ver SCOPE_KEYS em store.js) — a página não as declara,
//    então elas NÃO vão para o bucket da conta e ficam só no aparelho.
//    Isso é deliberado: uma lista de afazeres pessoal não deve atravessar
//    contas nem exigir schema novo no servidor. O histórico de conversa
//    (`ui.aiChat`) tem o mesmo tratamento.
//
// 2) "Tarefas das conversas" — itens de checklist `[ ]` escritos em notas
//    das conversas ( comportamento anterior, a "visão Pendências"). Estas
//    são SOMENTE LEITURA aqui: marcar edita a nota de ORIGEM e sincroniza
//    pelo evento note:edit — a fonte da verdade é a nota, não esta lista.
import { esc, fmtTime, haptic, uid, now } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { COLOR_PALETTE, colorById } from '../icons.js';

// Cor do marcador de origem de uma tarefa de conversa. É a MESMA cor que a
// árvore usa no ícone do caderno (tree.js `_cadernoColor`), replicada aqui
// em vez de reaproveitada: `tasks.js` é um mixin plano e importar TreeMethods
// criaria acoplamento para uma função de 8 linhas. A regra do repo é
// replicar constantes/lógica pequena no módulo que usa (ver
// tests/orphans.test.js) — mas aqui é uma FUNÇÃO, então fica local.
//
// Ordem: cor escolhida pelo usuário (`t.color`) tem prioridade; senão, hash
// determinístico do id — a mesma conversa tem sempre a mesma cor, em
// qualquer tela.
function threadSrcColor(t) {
  if (!t) return null;
  const chosen = t.color && colorById(t.color);
  if (chosen) return typeof chosen === 'object' ? chosen.bg : chosen;
  let hash = 0;
  const str = String(t.id) + String(t.emoji || t.name || '');
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const c = COLOR_PALETTE[hash % COLOR_PALETTE.length];
  return c ? c.bg : null;
}

// onde as tarefas próprias moram (fora do bucket da conta, de propósito —
// ver o cabeçalho). `tasksOwn` não está em SCOPE_KEYS, então `save()` a
// grava na RAIZ do localStorage, junto do tema e das preferências de
// dispositivo.
const OWN_KEY = 'tasksOwn';

export const TasksMethods = {
  showTasksPage() {
    const page = document.getElementById('tasks-page');
    if (!page) return;
    // Exclusiva: esconde TODAS as outras páginas do canvas (inclusive IA/Diária
    // do workspace — antes ficavam abertas em conjunto por baixo das Pendências)
    document.getElementById('messages').classList.add('hidden');
    document.getElementById('backlinks')?.classList.add('hidden');
    document.getElementById('live-region')?.classList.add('hidden');
    document.getElementById('search-page')?.classList.add('hidden');
    document.getElementById('reminders-page')?.classList.add('hidden');
    document.getElementById('ai-page')?.classList.add('hidden');
    document.getElementById('daily-page')?.classList.add('hidden');
    page.classList.remove('hidden');
    this.setChatActiveUi(true);
    // A aba "Tarefas" do seletor é a entrada desta página, então ela precisa
    // acender aqui — senão abrir por outro caminho deixa o seletor sem item
    // ativo. `syncExplorerChrome` só cuida dos botões da marca, não do
    // seletor de páginas.
    document.querySelectorAll('.page-switch').forEach((button) => {
      const active = button.dataset.page === 'tasks';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    this.renderTasksPage();
    this.updateTasksBadge();
    // A aba REAL da página. Tarefas não passa por showWorkspaceTab (que só
    // conhece TABS, e TABS não tem 'tasks'), então sem esta linha
    // `_workspaceTab` continuava valendo 'conversations' com a página de
    // Tarefas aberta na tela. Foi o que travou o arrasto entre páginas: de
    // Tarefas ele achava que ainda estava em Cadernos e voltava para cá.
    // Também é o que faz conversationOnScreen() saber que a conversa não
    // está na tela quando o usuário está em Tarefas.
    this._workspaceTab = 'tasks';
    // No celular o canvas precisa ficar à frente da sidebar. Sem isto a página
    // de Tarefas abria "por trás" da sidebar, com o cabeçalho 8px fora de
    // posição — era a única das três abas que não revelava o canvas (as
    // outras passam por showWorkspaceTab, que já faz isso).
    this._mobileRevealCanvas();
    this.syncExplorerChrome();
  },

  hideTasksPage() {
    const page = document.getElementById('tasks-page');
    if (page) page.classList.add('hidden');
    // Volta para a aba ativa do workspace (não força messages se estava na IA/Diária)
    const tab = this._workspaceTab || 'conversations';
    // 'tasks' é a própria página que está saindo — o destino é Cadernos.
    if (tab === 'conversations' || tab === 'tasks') {
      document.getElementById('messages')?.classList.remove('hidden');
      document.getElementById('backlinks')?.classList.remove('hidden');
    } else if (typeof this.showWorkspaceTab === 'function') {
      this.showWorkspaceTab(tab, { updateUrl: false });
    } else {
      document.getElementById('messages')?.classList.remove('hidden');
      document.getElementById('backlinks')?.classList.remove('hidden');
    }
    this.syncExplorerChrome();
  },

  // ---------- "Minhas tarefas": lista própria, CRUD completo ----------

  _ownTasks() {
    const ui = Store.data.ui || (Store.data.ui = {});
    if (!Array.isArray(ui[OWN_KEY])) ui[OWN_KEY] = [];
    return ui[OWN_KEY];
  },

  // cria uma tarefa própria. `silent` é usado no restore/seed para não
  // tocar som nem vibração.
  addOwnTask(text, { silent = false } = {}) {
    const t = String(text || '').trim();
    if (!t) return null;
    const list = this._ownTasks();
    const item = { id: uid(), text: t, done: false, createdAt: now() };
    list.unshift(item);
    Store.save();
    if (!silent) { Sound.playName('toggle'); haptic('light'); }
    this.renderTasksPage();
    this.updateTasksBadge();
    return item;
  },

  // marca/desmarca. A tarefa própria não tem nota de origem: some da
  // lista quando concluída (mesmo comportamento das de conversa), mas
  // fica registrada em `done` no Store para poder ser restaurada depois.
  toggleOwnTask(id, done) {
    const list = this._ownTasks();
    const item = list.find((x) => x.id === id);
    if (!item) return;
    item.done = done;
    item.doneAt = done ? now() : null;
    Store.save();
    Sound.playName('toggle');
    haptic('light');
    this.renderTasksPage();
    this.updateTasksBadge();
  },

  editOwnTask(id, newText) {
    const t = String(newText || '').trim();
    const list = this._ownTasks();
    const item = list.find((x) => x.id === id);
    if (!item || !t) return;
    item.text = t;
    Store.save();
    this.renderTasksPage();
  },

  deleteOwnTask(id) {
    const list = this._ownTasks();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    list.splice(i, 1);
    Store.save();
    haptic('medium');
    this.renderTasksPage();
    this.updateTasksBadge();
  },

  // ---------- "Tarefas das conversas": somente leitura daqui ----------
  // todos os itens `[ ]` abertos de TODAS as conversas, da conversa mexida
  // mais recentemente para a mais antiga. O índice do checkbox é GLOBAL no
  // texto (mesma regra do toggleNoteCheckbox em messages.js) — marcar aqui
  // edita a nota de origem e sincroniza pelo evento note:edit.
  _allOpenTasks() {
    const out = [];
    Object.entries(Store.data.notes).forEach(([tid, arr]) => {
      const th = Store.getThread(tid);
      if (!th || !arr || !arr.length) return;
      // a thread da IA é local-only e estrutural: seus itens de checklist
      // não são tarefas do usuário, então ficam fora desta lista
      if (th.localOnly) return;
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
          out.push({ threadId: tid, clientId: n.clientId, index: i, text: txt, ts: n.ts, threadName: th.name, threadEmoji: th.emoji, threadColor: threadSrcColor(th), threadAt: th.updatedAt || 0 });
        }
      });
    });
    out.sort((a, b) => b.threadAt - a.threadAt);
    return out;
  },

  renderTasksPage() {
    // --- accordion 1: minhas tarefas ---
    const ownList = document.getElementById('tasks-own-list');
    if (ownList) {
      const own = this._ownTasks().filter((t) => !t.done);
      const ownCount = document.getElementById('tasks-own-count');
      if (ownCount) ownCount.textContent = own.length;
      const ownEmpty = document.getElementById('tasks-own-empty');
      if (ownEmpty) ownEmpty.classList.toggle('hidden', own.length > 0);
      ownList.innerHTML = own.map((t) => `
        <div class="task-row task-own" data-id="${t.id}" data-own="1">
          <input type="checkbox" class="task-chk" aria-label="Concluir ${esc(t.text)}" />
          <span class="task-body">
            <span class="task-text" data-role="text">${esc(t.text)}</span>
          </span>
          <span class="task-own-actions">
            <button type="button" class="task-ico" data-act="edit" aria-label="Editar tarefa" title="Editar"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
            <button type="button" class="task-ico task-ico-danger" data-act="del" aria-label="Excluir tarefa" title="Excluir"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </span>
        </div>`).join('');
      ownList.querySelectorAll('.task-row').forEach((row) => {
        const id = row.dataset.id;
        const cb = row.querySelector('.task-chk');
        cb?.addEventListener('change', () => this.toggleOwnTask(id, cb.checked));
        row.querySelector('[data-act="edit"]')?.addEventListener('click', (e) => { e.stopPropagation(); this._editOwnTaskInline(row, id); });
        row.querySelector('[data-act="del"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._saiComCarinho(row, () => this.deleteOwnTask(id));
        });
      });
    }

    // --- accordion 2: tarefas das conversas ---
    const thList = document.getElementById('tasks-threads-list');
    if (thList) {
      const items = this._allOpenTasks();
      const thCount = document.getElementById('tasks-threads-count');
      if (thCount) thCount.textContent = items.length;
      const thEmpty = document.getElementById('tasks-threads-empty');
      if (thEmpty) thEmpty.classList.toggle('hidden', items.length > 0);
      thList.innerHTML = items.map((t) => `
        <div class="task-row" data-tid="${t.threadId}" data-cid="${t.clientId}" data-chk="${t.index}">
          <input type="checkbox" class="task-chk" aria-label="Concluir ${esc(t.text)}" />
          <span class="task-body">
            <span class="task-text">${esc(t.text)}</span>
            <span class="task-meta">
              <!-- marcador da conversa de origem: círculo/quadrado
                   arredondado na COR da conversa (a mesma cor que a árvore
                   usa, via _cadernoColor) + o nome. Substitui o emoji cru
                   (🚩) que aparecia quando a conversa não tinha emoji
                   escolhido — gerava um "flag" solto sem sentido de marca. -->
              <span class="task-src" style="background:${esc(t.threadColor || 'var(--border)')}" aria-hidden="true"></span>
              <span class="task-src-name">${esc(t.threadName || 'Conversa')}</span>
              <span class="task-meta-sep" aria-hidden="true">·</span>
              ${fmtTime(t.ts)}
            </span>
          </span>
          <svg class="task-go" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`).join('');
      thList.querySelectorAll('.task-row').forEach((row) => {
        const cb = row.querySelector('.task-chk');
        cb?.addEventListener('click', (e) => e.stopPropagation());
        cb?.addEventListener('change', () => {
          this.toggleTaskRemote({
            threadId: row.dataset.tid,
            clientId: row.dataset.cid,
            index: +row.dataset.chk,
            checked: cb.checked,
            row,
          });
        });
        const open = () => {
          this.hideTasksPage();
          this.openThread(row.dataset.tid);
          setTimeout(() => this.scrollToNote(row.dataset.cid), 250);
        };
        row.addEventListener('click', (e) => { if (e.target !== cb) open(); });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (e.target === cb) return;
            open();
          }
        });
      });
    }

    // cabeçalho: total aberto (próprias + conversas)
    const count = document.getElementById('tasks-count');
    if (count) {
      const total = this._ownTasks().filter((t) => !t.done).length + this._allOpenTasks().length;
      count.textContent = total ? `${total} aberta${total !== 1 ? 's' : ''}` : '';
    }
  },

  // edição inline de tarefa própria: o vira um <input> no lugar
  _editOwnTaskInline(row, id) {
    const body = row.querySelector('.task-body');
    const item = this._ownTasks().find((x) => x.id === id);
    if (!body || !item) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.value = item.text;
    input.maxLength = 300;
    input.setAttribute('aria-label', 'Editar tarefa');
    body.innerHTML = '';
    body.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    const commit = () => {
      const v = input.value.trim();
      if (v) this.editOwnTask(id, v); else this.renderTasksPage();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); this.renderTasksPage(); }
    });
    input.addEventListener('blur', commit);
  },

  // animação de saída e depois executa a ação (usado por concluir/excluir
  // das próprias, que não têm nota de origem para re-render)
  _saiComCarinho(row, action) {
    row.classList.add('task-done');
    setTimeout(() => {
      row.style.maxHeight = row.scrollHeight + 'px';
      void row.offsetHeight;
      row.classList.add('chk-out');
    }, 200);
    setTimeout(action, 600);
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
    if (checked && row) {
      this._saiComCarinho(row, () => this.renderTasksPage());
    } else {
      this.renderTasksPage();
    }
  },

  // o badge do cabeçalho da marca foi REMOVIDO (a página de tarefas agora
  // tem aba própria na barra). Mantido como no-op para não quebrar
  // chamadas antigas; a contagem visível está no cabeçalho da página
  // (#tasks-count) e nos acordeões.
  updateTasksBadge() {},

  // ---------- bindings (chamado uma vez no boot) ----------
  bindTasksPage() {
    if (this._tasksBound) return;
    this._tasksBound = true;

    const form = document.getElementById('task-new-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('task-new-input');
      if (!input) return;
      const v = input.value.trim();
      if (!v) return;
      this.addOwnTask(v);
      input.value = '';
      input.focus();
    });

    // acordeões: abrem/fecham. `aria-expanded` e a classe `.open` são a
    // fonte da verdade (o CSS usa grid-template-rows para animar sem jank).
    document.querySelectorAll('.task-acc-head').forEach((head) => {
      head.addEventListener('click', () => {
        const acc = head.closest('.task-acc');
        if (!acc) return;
        const open = acc.classList.toggle('open');
        head.setAttribute('aria-expanded', String(open));
      });
    });
  },
};
