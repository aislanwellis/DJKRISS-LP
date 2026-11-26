// ─────────────────────────────────────────────────────────────
//  Player das prévias — Street Frequency
//  Cada faixa: capa HORIZONTAL em cima, player embaixo com a capa
//  QUADRADA ao lado. Toca de 0:00 a 0:30 e para (trava rígida).
// ─────────────────────────────────────────────────────────────
import { TRACKS, ALBUM, PREVIEW_SECONDS } from './tracks.js';

const $ = (s, r = document) => r.querySelector(s);
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const BARS = 48;

// Estado compartilhado com a cena 3D
export const SF = (window.SF = window.SF || {
  bass: 0, mid: 0, high: 0, beat: 0, playing: false,
  accent: TRACKS[0].accent, cover: TRACKS[0].cover, trackIndex: 0,
});

const ICON_PLAY = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zm6.4 0H17v14h-3.6z" fill="currentColor"/></svg>';

export function initPlayer() {
  const grid = $('#tracks');
  const dock = $('#dock');

  // ── Cards ───────────────────────────────────────────────
  grid.innerHTML = TRACKS.map((t, i) => `
    <article class="tc${t.featured ? ' is-featured' : ''}" data-i="${i}" style="--c:${t.accent}">
      <div class="tc-h">
        <img src="${t.coverH}" alt="${t.title} — capa horizontal" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async" width="1280" height="720">
        <span class="tc-num mono">${t.num}</span>
        ${t.featured ? '<span class="tc-flag mono">Faixa destaque</span>' : ''}
        <span class="tc-vibe mono">${t.vibe}</span>
      </div>
      <div class="tc-row">
        <img class="tc-sq" src="${t.cover}" alt="${t.title} — capa" loading="lazy" decoding="async" width="800" height="800">
        <div class="tc-body">
          <h3 class="tc-title">${t.title}${t.explicit ? ' <i class="e" title="Explícita">E</i>' : ''}</h3>
          <p class="tc-by">DJ KRISS · prod. Suspeyto</p>
          <div class="tc-wave" role="slider" tabindex="0" aria-label="Posição da prévia de ${t.title}" aria-valuemin="0" aria-valuemax="${PREVIEW_SECONDS}" aria-valuenow="0">
            ${t.wave.map((v) => `<i style="--h:${Math.max(0.12, v)}"></i>`).join('')}
          </div>
          <div class="tc-time mono"><span data-cur>0:00</span><span>0:${PREVIEW_SECONDS}</span></div>
        </div>
        <button class="tc-play" aria-label="Tocar prévia de ${t.title}">${ICON_PLAY}${ICON_PAUSE}</button>
      </div>
    </article>`).join('');
  const cards = [...grid.children];

  // ── Áudio ───────────────────────────────────────────────
  const audio = new Audio();
  audio.preload = 'none';
  audio.setAttribute('playsinline', '');
  let cur = -1, ctx, analyser, gain, freq, ending = false, wantPlay = false;

  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      gain = ctx.createGain();
      src.connect(gain).connect(analyser).connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { ctx = null; }
  }

  function select(i) {
    const n = TRACKS.length;
    i = ((i % n) + n) % n;
    if (i === cur) return;
    if (cur >= 0) { cards[cur].classList.remove('is-cur', 'is-playing'); paint(cur, 0); }
    cur = i;
    const t = TRACKS[i];
    cards[i].classList.add('is-cur');
    ending = false;
    audio.src = t.src;
    audio.currentTime = 0;
    SF.trackIndex = i; SF.accent = t.accent; SF.cover = t.cover;
    document.documentElement.style.setProperty('--accent', t.accent);
    $('.dock-cover', dock).src = t.cover;
    $('.dock-title', dock).textContent = t.title;
    $('.dock-num', dock).textContent = `${t.num}/12 · PRÉVIA`;
    window.dispatchEvent(new CustomEvent('sf:track', { detail: t }));
    mediaSession(t);
  }

  async function play(i = cur < 0 ? 0 : cur) {
    select(i);
    wantPlay = true;
    ensureCtx();
    if (gain) gain.gain.setValueAtTime(1, ctx.currentTime);
    if (audio.currentTime >= PREVIEW_SECONDS - 0.05) audio.currentTime = 0;
    ending = false;
    try { await audio.play(); } catch (e) { if (!(e && e.name === 'AbortError')) setPlaying(false); }
  }
  function pause() { wantPlay = false; audio.pause(); }
  function toggle(i = cur) {
    if (i !== cur || audio.paused) play(i); else pause();
  }

  function setPlaying(p) {
    SF.playing = p;
    cards.forEach((c, k) => c.classList.toggle('is-playing', p && k === cur));
    document.body.classList.toggle('sf-playing', p);
    if (cur >= 0) $('.tc-play', cards[cur]).setAttribute('aria-label', `${p ? 'Pausar' : 'Tocar'} prévia de ${TRACKS[cur].title}`);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
  }
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) { setPlaying(false); wantPlay = false; } });

  // trava rígida de 30s + fade final + avança faixa
  function guard() {
    const e = audio.currentTime;
    if (gain && ctx) { const left = PREVIEW_SECONDS - e; gain.gain.value = left < 1.2 ? Math.max(0, left / 1.2) : 1; }
    if (e >= PREVIEW_SECONDS && !ending) finish();
  }
  function finish() {
    ending = true;
    audio.pause();
    paint(cur, 1);
    if (wantPlay) setTimeout(() => play(cur + 1), 500);
  }
  audio.addEventListener('timeupdate', guard);
  audio.addEventListener('ended', () => { if (!ending) finish(); });

  // ── Waveform / progresso ────────────────────────────────
  function paint(i, p) {
    const card = cards[i];
    if (!card) return;
    p = Math.min(1, Math.max(0, p));
    const on = Math.round(p * BARS);
    const wave = $('.tc-wave', card);
    if (wave._on !== on) {
      [...wave.children].forEach((b, k) => b.classList.toggle('on', k < on));
      wave._on = on;
      wave.setAttribute('aria-valuenow', Math.round(p * PREVIEW_SECONDS));
    }
    $('[data-cur]', card).textContent = fmt(p * PREVIEW_SECONDS);
    if (i === cur) $('.dock-fill', dock).style.transform = `scaleX(${p})`;
  }

  // ── Eventos dos cards ───────────────────────────────────
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.tc');
    if (!card) return;
    const i = +card.dataset.i;
    const wave = e.target.closest('.tc-wave');
    if (wave) {
      const r = wave.getBoundingClientRect();
      const p = Math.min(0.99, Math.max(0, (e.clientX - r.left) / r.width));
      if (i !== cur) select(i);
      audio.currentTime = p * PREVIEW_SECONDS;
      paint(i, p);
      if (audio.paused) play(i);
      return;
    }
    if (e.target.closest('.tc-play, .tc-sq, .tc-h')) toggle(i);
  });
  grid.addEventListener('keydown', (e) => {
    const wave = e.target.closest('.tc-wave');
    if (!wave || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = +wave.closest('.tc').dataset.i;
    if (i !== cur) select(i);
    audio.currentTime = Math.min(PREVIEW_SECONDS - 0.3, Math.max(0, audio.currentTime + (e.key === 'ArrowRight' ? 3 : -3)));
    paint(i, audio.currentTime / PREVIEW_SECONDS);
  });

  // dock
  $('.dock-play', dock).addEventListener('click', () => toggle());
  $('.dock-next', dock).addEventListener('click', () => play(cur + 1));
  $('.dock-info', dock).addEventListener('click', () => cards[Math.max(0, cur)].scrollIntoView({ behavior: 'smooth', block: 'center' }));

  function mediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${t.title} (prévia)`, artist: ALBUM.artist, album: ALBUM.title,
      artwork: [{ src: t.cover, sizes: '800x800', type: 'image/webp' }],
    });
    try {
      const h = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      h('play', () => play()); h('pause', pause);
      h('previoustrack', () => play(cur - 1)); h('nexttrack', () => play(cur + 1));
      h('seekto', null);
    } catch (e) {}
  }

  // ── Análise de frequência → cena 3D ─────────────────────
  let lastBass = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    let bass, mid, high;
    const live = SF.playing && analyser && !audio.paused;
    if (live) {
      analyser.getByteFrequencyData(freq);
      const avg = (a, b) => { let s = 0; for (let k = a; k < b; k++) s += freq[k]; return s / (b - a) / 255; };
      bass = avg(1, 8); mid = avg(12, 60); high = avg(80, 180);
      paint(cur, audio.currentTime / PREVIEW_SECONDS);
    } else {
      const f = ((now / 1000) * (92 / 60)) % 1; // pulso simulado 92 BPM
      bass = 0.35 * Math.pow(Math.max(0, 1 - f * 2.6), 2) + 0.08;
      mid = 0.18 + 0.06 * Math.sin(now / 700);
      high = 0.12 * Math.pow(Math.max(0, 1 - ((now / 1000 * 3.07) % 1) * 4), 2);
    }
    SF.beat = bass > lastBass + 0.12 && bass > 0.45 ? 1 : SF.beat * 0.9;
    lastBass = bass;
    SF.bass += (bass - SF.bass) * 0.5;
    SF.mid += (mid - SF.mid) * 0.3;
    SF.high += (high - SF.high) * 0.4;
  }
  requestAnimationFrame(tick);

  select(0);
  return { play, pause, toggle, select };
}
