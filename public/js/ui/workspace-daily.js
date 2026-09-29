// Diária: checklist de ROTINA que se renova todo dia. Os itens são
// fixos (cadastrados uma vez) e a marcação de "concluído"
// vale só para a data — o log é por dia, então a lista
// recomeça limpa à meia-noite.

import { Store } from '../store.js';
import { ICON, wrapSvg } from '../icons.js';
import { esc, haptic, uid, now } from '../utils.js';
// todayKey: chave YYYY-MM-DD local (o log da Diária é por data)
const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TAB_LABEL = { conversations: 'Cadernos', ai: 'IA', reminders: 'Lembretes', daily: 'Diária' };

export const WorkspaceDailyMethods = {
  _daily() {
    Store.data.ui = Store.data.ui || {};
    Store.data.ui.dailyRoutine = Store.data.ui.dailyRoutine || { items: [], log: {} };
    Store.data.ui.dailyRoutine.items = Store.data.ui.dailyRoutine.items || [];
    Store.data.ui.dailyRoutine.log = Store.data.ui.dailyRoutine.log || {};
    return Store.data.ui.dailyRoutine;
  },

  _dailyLog(d, key = todayKey()) {
    d.log[key] = d.log[key] || { done: [], notified: [] };
    d.log[key].done = d.log[key].done || [];
    d.log[key].notified = d.log[key].notified || [];
    return d.log[key];
  },

  addDailyItem(text, opts = {}) {
    const d = this._daily();
    d.items.push({
      id: uid(),
      text: String(text).slice(0, 160),
      createdAt: now(),
      time: /^\d{2}:\d{2}$/.test(opts.time || '') ? opts.time : '',
      notify: !!(opts.time && opts.notify),
    });
    Store.save();
    this.renderDailyPage();
    haptic('light');
  },

  // ---------- Modal de criação/edição de tarefa diária ----------

  openDailyTaskModal(id = null) {
    const d = this._daily();
    const item = id ? d.items.find((x) => x.id === id) : null;
    const editing = !!item;
    const curTime = item ? (item.time || '') : '';
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const permNote = perm === 'granted'
      ? '<p class="dly-perm ok">✓ Notificações ativas neste dispositivo</p>'
      : perm === 'denied'
        ? '<p class="dly-perm warn">⚠ Notificações bloqueadas no navegador — o aviso aparecerá dentro do app</p>'
        : '<p class="dly-perm">Ao ativar o aviso, pediremos permissão para notificá-lo.</p>';
    const body = `
      <div class="dly-field">
        <label class="dly-label" for="dly-text">Tarefa da rotina</label>
        <input id="dly-text" type="text" maxlength="160" autocomplete="off"
               placeholder="ex.: beber 2L de água" value="${item ? esc(item.text) : ''}" />
      </div>
      <div class="dly-field">
        <label class="dly-label" for="dly-time">Horário <span class="dly-hint">opcional</span></label>
        <input id="dly-time" type="time" value="${curTime}" />
        <p class="dly-help">Sem horário, a tarefa só aparece na lista do dia. Com horário, ela ganha um lembrete.</p>
      </div>
      <label class="dly-switch-row" for="dly-notify">
        <span class="dly-switch-text">
          <span class="dly-switch-title">${wrapSvg(ICON.bell, 15)} Avisar neste horário</span>
          <span class="dly-switch-sub">Recebe uma notificação no dia, no horário escolhido</span>
        </span>
        <span class="switch"><input type="checkbox" id="dly-notify" ${item && item.notify ? 'checked' : ''} /><span class="slider"></span></span>
      </label>
      ${permNote}`;
    this.showModal(editing ? 'Editar tarefa' : 'Nova tarefa diária', body, () => {
      const text = (document.getElementById('dly-text').value || '').trim();
      if (!text) { this.toast('Escreva a tarefa primeiro', { kind: 'error' }); return; }
      const time = document.getElementById('dly-time').value || '';
      const notify = !!(time && document.getElementById('dly-notify').checked);
      if (editing) {
        item.text = text.slice(0, 160);
        item.time = time;
        item.notify = notify;
        Store.save();
      } else {
        this.addDailyItem(text, { time, notify });
      }
      this.closeModal();
      this.renderDailyPage();
      if (notify) {
        this._ensureNotifPermissionSilent().then((granted) => {
          if (!granted) this.toast('Aviso ativado — o lembrete aparece dentro do app', { kind: 'info', duration: 4000 });
        });
      }
      this.toast(editing ? 'Tarefa atualizada' : `Tarefa adicionada${time ? ` · ${time}` : ''}`, { kind: 'success' });
    });
    // rótulo do botão de confirmação + foco no campo de texto
    const okBtn = this.dom.modalOk;
    if (okBtn) okBtn.textContent = editing ? 'Salvar' : 'Adicionar';
    const textField = document.getElementById('dly-text');
    if (textField) setTimeout(() => { textField.focus(); textField.select && textField.select(); }, 40);
    // o switch só faz sentido com horário definido
    const timeInput = document.getElementById('dly-time');
    const notifyBox = document.getElementById('dly-notify');
    if (timeInput && notifyBox) {
      const sync = () => {
        const has = !!timeInput.value;
        notifyBox.disabled = !has;
        if (!has) notifyBox.checked = false;
      };
      timeInput.addEventListener('change', sync);
      timeInput.addEventListener('input', sync);
      sync();
    }
    // Enter no campo de texto confirma (sem o tab Away do foco)
    if (textField) {
      textField.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (okBtn) okBtn.click();
      });
    }
  },

  toggleDailyItem(id) {
    const d = this._daily();
    const entry = this._dailyLog(d);
    const i = entry.done.indexOf(id);
    if (i >= 0) entry.done.splice(i, 1); else entry.done.push(id);
    Store.save();
    this.renderDailyPage();
    haptic('light');
  },

  deleteDailyItem(id) {
    const d = this._daily();
    d.items = d.items.filter((x) => x.id !== id);
    Object.values(d.log).forEach((entry) => {
      if (entry.done) entry.done = entry.done.filter((x) => x !== id);
      if (entry.notified) entry.notified = entry.notified.filter((x) => x !== id);
    });
    Store.save();
    this.renderDailyPage();
  },

  renderDailyPage() {
    const list = document.getElementById('daily-list');
    if (!list) return;
    const d = this._daily();
    const key = todayKey();
    const doneToday = (d.log[key] && d.log[key].done) || [];
    const total = d.items.length;
    const doneCount = d.items.filter((x) => doneToday.includes(x.id)).length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    // data em 3 blocos: dia da semana / dia do mês / mês-ano
    const now2 = new Date();
    const weekday = now2.toLocaleDateString('pt-BR', { weekday: 'long' });
    const monthYear = now2.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setTxt('daily-weekday', weekday);
    setTxt('daily-daynum', String(now2.getDate()));
    setTxt('daily-monthyear', monthYear);
    setTxt('daily-done-count', String(doneCount));
    setTxt('daily-total-count', String(total));
    // progresso
    const bar = document.getElementById('daily-progress-bar');
    if (bar) bar.style.width = `${pct}%`;
    const prog = document.getElementById('daily-progress');
    if (prog) prog.setAttribute('aria-valuenow', String(pct));
    const counter = document.getElementById('daily-counter');
    if (counter) counter.classList.toggle('complete', total > 0 && doneCount >= total);
    const sub = document.getElementById('daily-sub');
    if (sub) {
      sub.textContent = !total
        ? 'Cadastre sua rotina uma vez — ela se renova todo dia.'
        : doneCount >= total
          ? `Tudo concluído hoje (${pct}%) — amanhã a lista recomeça. 🎉`
          : `${pct}% concluído · ${total - doneCount} ${total - doneCount === 1 ? 'tarefa restante' : 'tarefas restantes'}.`;
    }
    // streak: dias seguidos (até ontem) com tudo concluído
    const streakEl = document.getElementById('daily-streak');
    if (streakEl) {
      let streak = 0;
      const cursor = new Date();
      for (;;) {
        cursor.setDate(cursor.getDate() - 1);
        const k = todayKey(cursor);
        const entry = d.log[k];
        if (total && entry && entry.done && entry.done.length >= total) streak++; else break;
      }
      streakEl.innerHTML = `🔥 <strong>${streak}</strong>`;
      streakEl.classList.toggle('zero', streak === 0);
      streakEl.title = streak === 0
        ? 'Nenhum dia seguido ainda — conclua a rotina inteira hoje para começar'
        : (streak === 1 ? '1 dia seguido completando toda a rotina' : `${streak} dias seguidos completando toda a rotina`);
    }
    // lista
    if (!total) {
      list.innerHTML = '<li class="daily-empty">Nenhuma tarefa da rotina ainda. Use <strong>Nova tarefa</strong> para cadastrar com horário e aviso — por exemplo: <em>beber 2L de água</em>, <em>exercício</em>, <em>ler 10 páginas</em>.</li>';
      return;
    }
    const nowMin = now2.getHours() * 60 + now2.getMinutes();
    list.innerHTML = d.items.map((item) => {
      const done = doneToday.includes(item.id);
      const hasTime = /^\d{2}:\d{2}$/.test(item.time || '');
      const hasNotify = hasTime && !!item.notify;
      let timeState = '';
      if (hasTime) {
        const [hh, mm] = item.time.split(':').map(Number);
        const mins = hh * 60 + mm;
        timeState = done ? 'done' : (mins < nowMin ? 'late' : 'soon');
      }
      const timeChip = hasTime
        ? `<span class="daily-time ${timeState}">${hasNotify ? wrapSvg(ICON.bell, 11) : ''}${esc(item.time)}</span>`
        : '';
      return `<li class="daily-item${done ? ' done' : ''}" data-id="${item.id}">` +
        `<button type="button" class="daily-check" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Desmarcar' : 'Concluir'}: ${esc(item.text)}">` +
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 12.5l4 4 9-9"/></svg></button>` +
        `<span class="daily-main">` +
        `<span class="daily-text">${esc(item.text)}</span>` +
        `${timeChip}` +
        `</span>` +
        `<span class="daily-item-actions">` +
        `<button type="button" class="daily-edit" aria-label="Editar ${esc(item.text)}" title="Editar">${wrapSvg(ICON.pencil, 13)}</button>` +
        `<button type="button" class="daily-del" aria-label="Excluir ${esc(item.text)}" title="Excluir">${wrapSvg(ICON.trash, 13)}</button>` +
        `</span></li>`;
    }).join('');
  },

  // avisa (notificação + toast) as tarefas com horário e notificação ligada

  checkDailyNotifications() {
    const d = this._daily();
    if (!d.items.some((i) => i.time && i.notify)) return;
    const now3 = new Date();
    const key = todayKey(now3);
    const mins = now3.getHours() * 60 + now3.getMinutes();
    // só grava o log de hoje quando algo realmente for disparado
    const entry = d.log[key] || { done: [], notified: [] };
    let fired = 0;
    d.items.forEach((item) => {
      if (!item.time || !item.notify) return;
      if ((entry.done || []).includes(item.id) || (entry.notified || []).includes(item.id)) return;
      const [hh, mm] = item.time.split(':').map(Number);
      // janela de 1 minuto de tolerância; se o app ficou fechado, avisa na primeira checagem
      if (hh * 60 + mm > mins || mins - (hh * 60 + mm) > 60) return;
      entry.notified = entry.notified || [];
      entry.done = entry.done || [];
      entry.notified.push(item.id);
      fired++;
      this._notifyReminder('🗓️ Diária', `É hora de: ${item.text}`, `daily-${key}-${item.id}`);
      this.toast(`🗓️ Diária — ${item.text}`, { kind: 'pin', duration: 6000 });
      haptic('medium');
    });
    if (fired) { d.log[key] = entry; Store.save(); }
  },
};
