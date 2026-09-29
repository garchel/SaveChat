// Áudio do composer: botão único send/mic, gravação, upload para o bucket
// note-audio e a mensagem de voz (player na bolha, em js/audio.js).
import { Store } from '../store.js';
import { Sync, getSupa, USE_SUPABASE } from '../sync-supabase.js';
import { Sound } from '../sound.js';
import { uid, now, haptic, $ } from '../utils.js';
import { computePeaks } from '../audio.js';

// Glifos do botão único. MESMOS paths de composer.js/_updateSendAudioState, para
// que voltar do modo gravação para o modo enviar não troque o desenho do ícone.
// Antes estas duas constantes viviam no topo do composer.js monolítico; o split
// em mixins deixou a referência órfã em composer-audio.js (que é quem usa), e o
// bug só aparecia em runtime — depois de gravar — nunca no boot.
const MIC_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

export const ComposerAudioMethods = {
    _updateSendAudioState(ta, send) {
      const hasContent = this._editorText(ta).replace(/\u200B/g, '').trim() !== '' || ((this.pendingImages || []).length > 0);
      this._audioMode = !hasContent;
      send.classList.toggle('audio-mode', this._audioMode);
      send.disabled = false; // áudio está sempre disponível
      const micSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      const sendSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
      const want = this._audioMode ? micSvg : sendSvg;
      if (!send.innerHTML.includes(this._audioMode ? 'M12 1a3' : 'x1="22"')) {
        send.innerHTML = want;
        send.setAttribute('aria-label', this._audioMode ? 'Gravar áudio' : 'Enviar');
        send.title = this._audioMode ? 'Gravar áudio' : 'Enviar';
      }
    },

    // Envia o blob para o bucket note-audio e devolve a URL pública.
    // Sem sessão (modo local), devolve null: o áudio segue só neste aparelho e
    // a nota guarda um objectURL temporário para tocar agora.
    async _uploadAudio(blob, name) {
      if (!USE_SUPABASE) return null;
      try {
        const supa = await getSupa();
        const { data: { session } } = await supa.auth.getSession();
        const uid = session && session.user ? session.user.id : null;
        if (!uid) return null;
        const path = `${uid}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supa.storage.from('note-audio').upload(path, blob, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        return supa.storage.from('note-audio').getPublicUrl(path).data.publicUrl;
      } catch (e) {
        console.warn('[audio] upload falhou, segue só local', e);
        return null;
      }
    },

    // Identidade do remetente usada no player de áudio (v1.13.7): foto do Google
    // quando existir, senão o próprio player desenha a inicial do nome.
    _audioSender() {
      const u = Store.user || {};
      const photo = (u.photo) || null;
      return { name: u.name || u.mail || 'Você', photo };
    },

    // gravação de áudio via MediaRecorder -> mensagem de voz (player na bolha)
    async _startAudioRecording(send) {
      if (this._recording) {
        // parar e enviar
        this._mediaRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const mime = rec.mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: mime });
          const duration = Math.round((Date.now() - this._recStart) / 1000);
          this._recording = false;
          clearInterval(this._recTimer);
          send.classList.remove('recording');
          send.innerHTML = SEND_SVG; // volta ao ícone de enviar (não é mais gravação)
          if (duration < 1) { this.toast('Gravação muito curta', { kind: 'info' }); this._updateSendAudioState($('#composer-input'), send); return; }

          const peaks = await computePeaks(blob);
          send.classList.add('busy');
          const url = await this._uploadAudio(blob, `audio-${Date.now()}.webm`);
          send.classList.remove('busy');
          this._pendingAudio = {
            url: url || URL.createObjectURL(blob),
            mime, dur: duration, peaks: peaks || [], sender: this._audioSender(),
            local: !url,
          };
          this.toast(`Áudio de ${duration}s — mandando…`, { kind: 'success' });
          this._sendVoiceNote();
        };
        this._mediaRecorder = rec;
        this._recStart = Date.now();
        this._recording = true;
        rec.start();
        send.classList.add('recording');
        let secs = 0;
        this._recTimer = setInterval(() => { secs++; send.title = `Gravando… ${secs}s (clique para parar)`; }, 1000);
        this.toast('Gravando áudio — clique novamente para parar', { kind: 'info', duration: 2500 });
      } catch (err) {
        this.toast('Não foi possível acessar o microfone', { kind: 'error' });
      }
    },

    // ---------- Mensagem de voz: cria a nota com o player e envia ----------
    // A nota de voz não passa pelo caminho de texto: nasce com `audio` já
    // preenchido, o que a renderiza como player (messages.js). Pode vir
    // sozinha (só áudio) ou junto de um texto já digitado no composer.
    _sendVoiceNote() {
      const a = this._pendingAudio;
      if (!a || !this.activeThread) { this._pendingAudio = null; return; }
      this._pendingAudio = null;
      const ta = $('#composer-input');
      const text = ta ? this._editorText(ta).replace(/\u200B/g, '').trim() : '';
      if (ta) { ta.innerHTML = ''; }
      this.resetComposerSize();
      this._updateSendAudioState(ta || $('#composer-input'), $('#btn-send'));

      const note = {
        clientId: uid(), threadId: this.activeThread, text,
        images: [], audio: a, ts: now(),
        userId: Store.user ? Store.user.mail : 'anon', pending: true, local: true,
      };
      const eff = Store.upsertNote(note) || note;
      this.appendNoteRealtime(eff);
      this._recentLocalCids = this._recentLocalCids || new Map();
      this._recentLocalCids.set(eff.clientId, Date.now());
      if (this._recentLocalCids.size > 50) this._recentLocalCids.delete(this._recentLocalCids.keys().next().value);

      const box = $('#messages');
      if (box) box.scrollTop = box.scrollHeight;
      const stored = (Store.notesFor(this.activeThread) || []).find((x) => x.clientId === eff.clientId);
      Sync.send('note:upsert', Object.assign({}, stored || eff, { pending: false }));
      this.markSent(eff.clientId);
      this.updateNoteCount();
      Sound.play('send'); haptic('light');
      // áudio só-local: o objectURL morre com a aba — avisa em vez de deixar uma
      // bolha muda que parece arquivo corrompido
      if (a.local) this.toast('Áudio enviado só neste aparelho (sem sessão para sincronizar)', { kind: 'info', duration: 5000 });
    },
};
