// Player de mensagem de voz — waveform real (picos) + play/pause + avatar do remetente.
// Usado por messages.js ao renderizar notas com `audio`. Tudo em um arquivo só
// para manter o player (canvas, decodificação e estado de reprodução) isolado do
// resto da UI de mensagens.
//
// Onde o `audio` da nota vem de (v1.13.7):
//   { url, mime, dur, peaks: number[], sender: { name, photo } }
// `peaks` são os picos normalizados (0..1) calculados na gravação e guardados no
// banco; se faltar (nota antiga), o player os recalcula decodificando o áudio.

import { ICON, wrapSvg } from './icons.js';
import { esc } from './utils.js';

const WAVE_BARS = 34;          // número de barrinhas do player
const PEAK_TARGET = 120;       // resolução do waveform guardado no banco

// ---------- geração dos picos ----------
// Decodifica o áudio com WebAudio e devolve os picos normalizados. Amostragem
// por buckets: cada barra recebe o MÁXIMO do seu intervalo (e não a média) —
// é o que o WhatsApp usa, e é o que faz silêncio entre falas virar barra baixa
// em vez de "fundo" alto.
export async function computePeaks(blob, bars = PEAK_TARGET) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  let ctx;
  try {
    ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const ch = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(ch.length / bars));
    const out = [];
    let max = 0;
    for (let i = 0; i < bars; i++) {
      const start = i * block;
      const end = Math.min(ch.length, start + block);
      let peak = 0;
      for (let j = start; j < end; j++) { const v = Math.abs(ch[j]); if (v > peak) peak = v; }
      out.push(peak);
      if (peak > max) max = peak;
    }
    // normaliza: um áudio baixo não pode sair como uma linha plana no meio da
    // bolha (dá a impressão de áudio "quebrado"). O teto evita dividir por ~0.
    const norm = max > 0.001 ? 1 / max : 0;
    return out.map((v) => +(v * norm).toFixed(3));
  } catch (err) {
    console.warn('[audio] falha ao decodificar para o waveform', err);
    return null;
  } finally {
    try { ctx && ctx.close(); } catch {}
  }
}

// ---------- player ----------
// Monta o HTML da bolha de áudio. O botão de play é o MESMO elemento em todos os
// estados (não é recriado), então trocar play↔pause nunca reinicia o <audio>.
function audioHtml(n) {
  const a = n.audio || {};
  const sender = a.sender || {};
  const peaks = Array.isArray(a.peaks) && a.peaks.length ? a.peaks : null;
  const dur = Number(a.dur) || 0;
  const name = sender.name || 'Áudio';
  const photo = sender.photo
    ? `<img class="va-av" src="${esc(sender.photo)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="va-av va-av-ini" aria-hidden="true">${esc((name.charAt(0) || 'A').toUpperCase())}</span>`;

  const bars = peaks
    ? peaks.map((p, i) => `<i class="va-bar${i / peaks.length < 0.06 ? ' on' : ''}" data-i="${i}" style="--h:${Math.max(12, Math.round(p * 100))}%"></i>`).join('')
    // sem picos guardados (nota antiga): esqueleto uniforme. O player recalcula
    // os picos ao carregar e repinta as barrinhas sem mexer no resto.
    : Array.from({ length: WAVE_BARS }, (_, i) => `<i class="va-bar" data-i="${i}" style="--h:${28 + ((i * 7) % 34)}%"></i>`).join('');

  return `<div class="vaudio" data-dur="${dur}">
    <button type="button" class="va-play" aria-label="Reproduzir áudio">${wrapSvg(ICON.play, 15)}</button>
    <div class="va-mid">
      <div class="va-wave" role="presentation">${bars}</div>
      <div class="va-time"><span class="va-elapsed">0:00</span> <span class="va-dur">${fmtDur(dur)}</span></div>
    </div>
    <span class="va-who" title="${esc(name)}">${photo}<span class="va-name">${esc(name)}</span></span>
  </div>`;
}

function fmtDur(s) {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// Liga o player de uma bolha. Um <audio> compartilhado para o app inteiro: só
// um áudio toca por vez (tocar um segundo pausa o anterior) e o estado global
// fica simples.
let shared = null;
function sharedAudio() {
  if (!shared) shared = new Audio();
  return shared;
}

export function bindAudioPlayer(rootEl, note) {
  const box = rootEl && rootEl.querySelector('.vaudio');
  if (!box || box._bound) return;
  box._bound = true;
  const a = note.audio || {};
  const btn = box.querySelector('.va-play');
  const wave = box.querySelector('.va-wave');
  const elapsed = box.querySelector('.va-elapsed');
  const audio = sharedAudio();

  // peaks ausentes: calcula na hora (nota antiga, ou o waveform ainda não foi
  // guardado) e repinta as barrinhas. Silencioso se falhar (URL morta/offline).
  if (!(Array.isArray(a.peaks) && a.peaks.length) && a.url) {
    fetch(a.url)
      .then((r) => r.blob())
      .then((b) => computePeaks(b))
      .then((peaks) => {
        if (!peaks || !peaks.length || !wave.isConnected) return;
        const bars = wave.querySelectorAll('.va-bar');
        if (!bars.length) return;
        peaks.slice(0, bars.length).forEach((p, i) => {
          bars[i].style.setProperty('--h', `${Math.max(12, Math.round(p * 100))}%`);
          bars[i].classList.toggle('on', i / peaks.length < 0.06);
        });
      })
      .catch(() => {});
  }

  const paint = (ratio) => {
    const bars = wave.querySelectorAll('.va-bar');
    const n = Math.round(bars.length * ratio);
    bars.forEach((b, i) => b.classList.toggle('played', i < n));
  };

  const setIcon = (playing) => {
    btn.innerHTML = wrapSvg(playing ? ICON.pause : ICON.play, 15);
    btn.setAttribute('aria-label', playing ? 'Pausar áudio' : 'Reproduzir áudio');
    box.classList.toggle('playing', playing);
  };

  const reset = () => {
    paint(0);
    elapsed.textContent = '0:00';
    setIcon(false);
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!a.url) { box.classList.add('failed'); return; }
    if (audio.paused) {
      // só um áudio por vez
      if (shared._owner && shared._owner !== box) shared._owner.click();
      audio.src = a.url;
      audio.play().then(() => { setIcon(true); shared._owner = box; }).catch(() => box.classList.add('failed'));
    } else {
      audio.pause();
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (shared._owner !== box) return;
    const d = audio.duration || Number(a.dur) || 0;
    if (d) paint(audio.currentTime / d);
    elapsed.textContent = fmtDur(audio.currentTime);
  });
  audio.addEventListener('ended', () => { if (shared._owner === box) { reset(); shared._owner = null; } });
  audio.addEventListener('pause', () => { if (shared._owner === box) setIcon(false); });
  audio.addEventListener('play', () => { if (shared._owner === box) setIcon(true); });
  audio.addEventListener('error', () => { if (shared._owner === box || audio.src === a.url) box.classList.add('failed'); });

  // clique numa barra pula para aquele ponto — o player é "seekable" como o
  // WhatsApp, sem um <input type=range> por cima (quebraria o visual das barras).
  wave.addEventListener('click', (e) => {
    const i = e.target && e.target.classList && e.target.classList.contains('va-bar') ? +e.target.dataset.i : -1;
    if (i < 0 || !audio.duration) return;
    e.stopPropagation();
    const d = audio.duration || Number(a.dur) || 0;
    audio.currentTime = (i + 0.5) * (d / wave.querySelectorAll('.va-bar').length);
  });
}

export { audioHtml };
