import { PRESAVE_URL, RELEASE_DATE } from './tracks.js';
import { initPlayer, SF } from './player.js';
import { initMural } from './mural.js';

const $$ = (s) => [...document.querySelectorAll(s)];

// ── Pre-save ──────────────────────────────────────────────
$$('[data-presave-link]').forEach((a) => (a.href = PRESAVE_URL));
const frame = document.querySelector('[data-presave-frame]');
new IntersectionObserver((es, o) => {
  if (es[0].isIntersecting) { frame.src = PRESAVE_URL; o.disconnect(); }
}, { rootMargin: '600px' }).observe(frame);

// ── Contagem regressiva ───────────────────────────────────
const cd = document.getElementById('countdown');
const cells = Object.fromEntries(['d', 'h', 'm', 's'].map((k) => [k, cd.querySelector(`[data-cd=${k}]`)]));
function tickCountdown() {
  const diff = RELEASE_DATE - Date.now();
  if (diff <= 0) {
    cd.classList.add('is-live');
    cd.querySelector('.cd-label').innerHTML = '<b>DISPONÍVEL AGORA</b> · em 450 plataformas';
    $$('[data-cta-label]').forEach((s) => (s.textContent = 'Ouvir o álbum agora'));
    return;
  }
  const s = Math.floor(diff / 1000);
  const v = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  for (const k in v) {
    const txt = String(v[k]).padStart(2, '0');
    if (cells[k].textContent !== txt) { cells[k].textContent = txt; cells[k].classList.remove('flip'); void cells[k].offsetWidth; cells[k].classList.add('flip'); }
  }
  setTimeout(tickCountdown, 1000 - (Date.now() % 1000));
}
tickCountdown();

// ── Revelar ao rolar + contadores ─────────────────────────
const ro = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  e.target.querySelectorAll('[data-count]').forEach(countUp);
  ro.unobserve(e.target);
}), { threshold: 0.15 });
$$('.reveal, .sec-title, .stat').forEach((el) => ro.observe(el));
function countUp(el) {
  const end = +el.dataset.count, plus = el.hasAttribute('data-plus');
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 1400);
    el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + (plus ? '+' : '');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const hero = document.querySelector('.hero');
new IntersectionObserver(([e]) => document.body.classList.toggle('past-hero', !e.isIntersecting), { threshold: 0.12 }).observe(hero);

// ── Player + mural ────────────────────────────────────────
const player = initPlayer();
$$('.tc').forEach((el) => ro.observe(el)); // cards criados pelo player
document.querySelector('[data-play-first]').addEventListener('click', () => {
  player.play(0);
  document.getElementById('previas').scrollIntoView({ behavior: 'smooth' });
});
initMural();

// ── Intro + cena 3D ───────────────────────────────────────
const intro = document.getElementById('intro');
let ready = false, minTime = false;
const finishIntro = () => {
  if (!ready || !minTime || !intro.isConnected) return;
  intro.classList.add('out');
  document.body.classList.add('loaded');
  setTimeout(() => intro.remove(), 1200);
};
setTimeout(() => { minTime = true; finishIntro(); }, 1700);
setTimeout(() => { ready = minTime = true; finishIntro(); }, 6000);
intro.addEventListener('click', () => { ready = minTime = true; finishIntro(); });

const canvas = document.getElementById('scene');
const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
if (webgl) {
  import('./scene.js')
    .then(({ initScene }) => initScene(canvas, SF, () => { ready = true; finishIntro(); }))
    .catch((e) => { console.error(e); document.documentElement.classList.add('no-webgl'); ready = true; finishIntro(); });
} else {
  document.documentElement.classList.add('no-webgl');
  ready = true;
}
