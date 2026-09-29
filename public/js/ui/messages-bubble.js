// A bolha em si: construção do elemento, meta/hora, checklists
// interativos, separador de dia e lightbox de imagem.
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { now, fmtTime, esc } from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import { ICON, wrapSvg } from '../icons.js';
import { burstConfetti } from '../confetti.js';
import { audioHtml, bindAudioPlayer } from '../audio.js';

export const MessagesBubbleMethods = {
    bubbleEl(n, opts) {
      const div = document.createElement('div');
      const clientId = n.clientId; // escopo p/ os handlers abaixo
      // minha nota: flag local OU userId = email OU userId = uuid auth (o eco do
      // realtime entrega user_id como UUID — sem isso a nota própria era "remota")
      const me = Store.user || {};
      const mine = !!n.local || n.userId === me.mail || (!!me.id && n.userId === me.id);
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === n.clientId;
      let cozyExtra = '';
      if (n.text && /ideia:/i.test(n.text)) cozyExtra = ' bubble-idea';
      // M1 fix: .is-new anima só bolhas novas (classe removida no animationend)
      div.className = 'bubble' + (mine ? '' : ' remote') + (n.pending ? ' pending' : '') + (isPinned ? ' pinned' : '') + cozyExtra
        + (opts && opts.isNew ? ' is-new' : '');
      div.dataset.clientId = n.clientId;
      div.dataset.day = new Date(n.ts).toDateString();
      div.setAttribute('draggable', 'true');
      // seleção de texto: arrastar o mouse DESLIGA o drag nativo (que rouba a seleção)
      div.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY;
        let off = false;
        const mv = (ev) => {
          if (!off && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) {
            off = true;
            div.setAttribute('draggable', 'false'); // browser assume seleção
          }
        };
        const up = () => {
          window.removeEventListener('mousemove', mv);
          window.removeEventListener('mouseup', up);
          // restaura o drag depois que a seleção termina
          setTimeout(() => { if (!el_isEditing()) div.setAttribute('draggable', 'true'); }, 60);
        };
        const el_isEditing = () => div.isContentEditable || div.classList.contains('editing');
        window.addEventListener('mousemove', mv);
        window.addEventListener('mouseup', up);
      });

      const editedMark = n.edited ? '<span class="edited">editada</span>' : '';
      const meta = `<span class="meta">${editedMark}${n.pending ? 'enviando…' : fmtTime(n.ts)}</span>`;
      const pinBadge = isPinned ? `<span class="pin-badge" title="Mensagem fixada">${wrapSvg(ICON.pin, 12)}</span>` : '';
      const toggle = `<button class="msg-toggle" title="Ações" aria-label="Ações">${wrapSvg(ICON.chevron, 12)}</button>`;
      const tags = (n.tags && n.tags.length) ? `<div class="bubble-tags">${n.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : '';
      const imgs = (n.images && n.images.length) ? `<div class="bubble-images">${n.images.map((src) => `<img class="bubble-img" src="${src}" alt="anexo" loading="lazy"/>`).join('')}</div>` : '';
      // mensagem de voz: player com waveform + avatar do remetente (v1.13.7)
      const vaudio = n.audio && n.audio.url ? audioHtml(n) : '';

      const hideDone = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
      const rxRow = this._reactionsHtml(n);
      div.innerHTML = `${pinBadge}${vaudio}${imgs}${renderMarkdown(n.text, hideDone)}${tags}${rxRow}${meta}${toggle}`;

      // Seta ▾ → popover
      div.querySelector('.msg-toggle').addEventListener('click', (e) => { e.stopPropagation(); this.openMsgPopover(div, n); });
      // pills de reação: clique alterna a reação do usuário
      div.querySelectorAll('.rx-pill').forEach((pill) => {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleReaction(n.clientId, pill.dataset.rx);
        });
      });
      // Long-press (mobile)
      div.addEventListener('touchstart', (e) => this.onTouchStart(e, div, n), { passive: true });
      div.addEventListener('touchend', () => this.onTouchEnd());
      div.addEventListener('touchmove', () => this.onTouchEnd(), { passive: true });
      // Drag-and-drop desktop
      div.addEventListener('dragstart', (e) => this.onDragStart(e, n));
      div.addEventListener('dragover', (e) => this.onDragOver(e, div));
      div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
      div.addEventListener('drop', (e) => this.onDrop(e, n));
      div.addEventListener('dragend', () => this.onDragEnd());
      // player de audio (um <audio> compartilhado, play/pause sem recriar o elemento)
      if (vaudio) bindAudioPlayer(div, n);
      // Lightbox: clicar na imagem abre em tela cheia
      div.querySelectorAll('.bubble-img').forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', (e) => { e.stopPropagation(); this.openLightbox(img.src); });
      });
      // Checkboxes clicáveis: marcar/desmarcar persiste no texto da nota
      div.querySelectorAll('.md-check input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => {
          try { this.toggleNoteCheckbox(clientId, +cb.dataset.chk, cb.checked); }
          catch (err) { console.error('[checklist] falha ao alternar:', err); }
        });
      });
      // Menções @: 1 clique = preview popover; 2 cliques = abre a nota
      div.querySelectorAll('.mention').forEach((m) => {
        m.addEventListener('click', (e) => {
          e.stopPropagation();
          const now = Date.now();
          const last = this._mentionLastClick || 0;
          if (now - last < 350) {
            // duplo clique → abre a nota direto
            clearTimeout(this._mentionTimer);
            this._mentionLastClick = 0;
            this.closeNotePreview();
            this.openThread(m.dataset.tid);
            return;
          }
          // clique simples → preview (com delay para permitir o segundo clique)
          this._mentionLastClick = now;
          clearTimeout(this._mentionTimer);
          this._mentionTimer = setTimeout(() => {
            this._mentionLastClick = 0;
            this.showNotePreview(m.dataset.tid);
          }, 260);
        });
      });

      return div;
    },

    // ---------- Copy cozy: frases variadas no empty state ----------
    // troca o texto do estado vazio com uma fala diferente a cada conversa nova criada
    _applyCozyEmptyCopy(empty) {
      if (!empty) return;
      const hint = empty.querySelector('.es-hint');
      const sub = hint && hint.nextElementSibling;
      if (!hint || !sub) return;
      const pool = [
        ['Página em branco, ideias à solta ✨', 'Salve sua primeira ideia como uma mensagem — ela fica guardadinha aqui.'],
        ['Tudo tranquilo por aqui 🌷', 'Crie sua primeira conversa e comece a guardar suas ideias como mensagens.'],
        ['Um cantinho só seu ☁️', 'Anote aquela ideia que apareceu no banho — aqui ela não se perde.'],
        ['Prontinho para começar ⭐', 'Despeje o que está na cabeça: listas, lembretes, pensamentos soltos.'],
        ['Suas ideias moram aqui 🏡', 'Escreva a primeira mensagem e deixe o cantinho aconchegante.'],
        ['Respire, anote, floresça 🌸', 'Uma mensagem de cada vez — o resto a gente guarda.'],
      ];
      const pick = pool[(Math.random() * pool.length) | 0];
      hint.textContent = pick[0];
      sub.textContent = pick[1];
    },

    // marca/desmarca o N-ésimo checkbox do texto ([ ] ↔ [x]) e sincroniza
    toggleNoteCheckbox(clientId, index, checked) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      let i = -1;
      const lines = (n.text || '').split('\n');
      const newLines = lines.map((l) => {
        const m = l.match(/^(\s*)\[( |x)\]\s*(.*)$/i);
        if (!m) return l;
        i += 1;
        if (i !== index) return l;
        return `${m[1]}[${checked ? 'x' : ' '}] ${m[3]}`;
      });
      if (i < index) return; // índice inválido
      n.text = newLines.join('\n'); n.editedAt = now(); n.rev = (n.rev || 0) + 1; Store.save();
      Sync.send('note:edit', { threadId: this.activeThread, clientId, text: n.text, edited: !!n.edited, editedAt: n.editedAt, rev: n.rev });
      const hideDone = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
      if (hideDone && checked) {
        // fade out suave e remoção DIRETA do nó (reflow automático do flex/gap)
        const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
        const input = el && el.querySelector(`.md-check input[data-chk="${index}"]`);
        const wrap = input && input.closest('.md-check');
        if (wrap) {
          wrap.style.maxHeight = wrap.scrollHeight + 'px'; // fixa altura atual p/ animar colapso
          requestAnimationFrame(() => {
            wrap.classList.add('chk-out');
            const remove = () => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
            wrap.addEventListener('transitionend', remove, { once: true });
            setTimeout(remove, 350); // fallback
          });
          // O aviso de "lista completa" precisa acontecer ANTES do return: com
          // "ocultar marcadas" ligado, marcar a ÚLTIMA caixa saía por este
          // caminho e nunca chamava _checkListComplete — sem nenhum feedback.
          this._checkListComplete(clientId, n);
          this._syncScrollMetrics();
          return;
        }
      }
      this._replaceBubble(clientId, n);
      // aviso quando todas as checkboxes estão marcadas
      this._checkListComplete(clientId, n);
      this._syncScrollMetrics();
    },
    // Aviso de lista completa. Funciona nos DOIS caminhos: com "ocultar
    // marcadas" ligado a última caixa sai do DOM, mas o aviso (badge na
    // bolha + toast + confete) ainda tem que aparecer.
    _checkListComplete(clientId, n) {
      const lines = (n.text || '').split('\n').filter((l) => /^\s*\[( |x)\]/i.test(l));
      if (!lines.length) return;
      const allDone = lines.every((l) => /\[\s*x\s*\]/i.test(l));
      if (!allDone) return;
      // não repete confete/toast a cada re-render da mesma transição
      const key = clientId + ':' + (n.rev || 0);
      if (this._chkDoneFor === key) return;
      this._chkDoneFor = key;
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (el && !el.querySelector('.chk-complete')) {
        const badge = document.createElement('div');
        badge.className = 'chk-complete';
        badge.textContent = '✓ Lista completa!';
        el.appendChild(badge);
        setTimeout(() => badge.remove(), 3000);
      }
      burstConfetti(el || document.body); // estrelinhas e pétalas ao concluir
      Sound.playName('sparkle');
      this.toast('✓ Lista completa!', { kind: 'success', duration: 2500 });
      // a caixa que sumiu encolheu a bolha: recalcula as métricas de scroll
      setTimeout(() => this._syncScrollMetrics(), 400);
    },
    // A barra de rolagem do fluxo reflete o tamanho REAL do conteúdo.
    // Depois de remover nós (apagar mensagem, ocultar item concluído, sumir
    // com um separador de dia) o flex/gap recalcula sozinho, mas em alguns
    // caminhos o scrollHeight ficava com a altura antiga e a barra "guardava"
    // o espaço da mensagem apagada.
    _syncScrollMetrics() {
      const box = document.getElementById('messages');
      if (!box) return;
      // a leitura mede; a escrita seguinte invalida o cache de layout
      void box.scrollHeight;
      void box.offsetHeight;
    },
    openLightbox(src) {
      let ov = document.getElementById('lightbox');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'lightbox';
        ov.className = 'lightbox hidden';
        ov.innerHTML = '<img class="lightbox-img" alt="imagem ampliada"/><button class="lightbox-close" aria-label="Fechar">×</button>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov || e.target.classList.contains('lightbox-close')) { ov.classList.add('hidden'); const img = ov.querySelector('.lightbox-img'); img.style.transform = ''; img.dataset.scale = '1'; } });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.classList.contains('hidden')) { ov.classList.add('hidden'); const img = ov.querySelector('.lightbox-img'); img.style.transform = ''; img.dataset.scale = '1'; } });
        // pinch-to-zoom
        const img = ov.querySelector('.lightbox-img');
        let startDist = 0, startScale = 1, curScale = 1;
        img.addEventListener('touchstart', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            startDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            startScale = curScale;
          }
        }, { passive: false });
        img.addEventListener('touchmove', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            curScale = Math.min(4, Math.max(1, startScale * (dist / startDist)));
            img.style.transform = `scale(${curScale})`;
            img.style.transformOrigin = 'center center';
          }
        }, { passive: false });
        img.addEventListener('touchend', (e) => {
          if (e.touches.length < 2) { if (curScale <= 1.1) { curScale = 1; img.style.transform = ''; } }
        });
        // double-tap to reset/zoom
        let lastTap = 0;
        img.addEventListener('touchend', (e) => {
          const now = Date.now();
          if (now - lastTap < 300 && e.touches.length === 0) {
            curScale = curScale > 1 ? 1 : 2;
            img.style.transform = curScale === 1 ? '' : `scale(${curScale})`;
          }
          lastTap = now;
        });
      }
      const img = ov.querySelector('.lightbox-img');
      img.style.transform = ''; img.dataset.scale = '1';
      img.src = src;
      ov.classList.remove('hidden');
    },
    daySepEl(dayKey) {
      // "Hoje", "Ontem" ou data por extenso
      const d = new Date();
      const today = d.toDateString();
      const yest = new Date(d.getTime() - 864e5).toDateString();
      let label;
      const resolved = dayKey || today;
      if (resolved === today) label = 'Hoje';
      else if (resolved === yest) label = 'Ontem';
      else label = new Date(resolved).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const wrap = document.createElement('div');
      wrap.className = 'day-sep-wrap';
      wrap.innerHTML = `<span class="day-sep">${esc(label)}</span>`;
      return wrap;
    },

    // ---------- Reações rápidas ----------
    // catálogo completo: afetivas + úteis para marcar as próprias mensagens
    REACTIONS: ['❤️', '✨', '🌸', '😊', '👍', '🙏', '🔥', '⭐', '✅', '❌', '❗', '❓', '💡', '🎯', '📌', '⏰', '👀', '💯', '😂', '🥰', '😮', '😢', '🤔', '🫶'],
    // reações "funcionais" — emoji fixo independente do tema
    _RX_EMOJI_ONLY: true,
    // + do quick row: abre a vista picker; a linha mostra as MAIS USADAS (4)
};
