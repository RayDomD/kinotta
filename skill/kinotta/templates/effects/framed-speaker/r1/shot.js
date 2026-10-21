const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => globalThis.M?.curves?.rise?.(x) ?? (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => globalThis.M?.curves?.state?.(x) ?? (1 - Math.pow(1 - x, 4));
const inQuad = (x) => globalThis.M?.curves?.sink?.(x) ?? (x * x);
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const syncVideos = (root, local) => Promise.all([...root.querySelectorAll('video')].map((video) => new Promise((done) => {
  video.pause();
  const time = local + Number(video.dataset.offset || 0);
  if (Math.abs(video.currentTime - time) < 0.001) return done();
  video.addEventListener('seeked', done, { once: true });
  setTimeout(done, 400);
  video.currentTime = time;
})));
// A clockwise wedge from 12 o'clock covering k of a turn, to draw rings and loops with clip-path.
const sweep = (k) => {
  if (k >= 1) return 'none';
  const pts = ['50% 50%', '50% -50%'];
  for (let i = 1; i <= 24; i++) {
    const a = Math.min(i / 24, k) * 2 * Math.PI;
    pts.push(`${50 + 100 * Math.sin(a)}% ${50 - 100 * Math.cos(a)}%`);
    if (i / 24 >= k) break;
  }
  return `polygon(${pts.join(', ')})`;
};

const root = document.querySelector('[data-scene="framed-speaker"]');
const plate = root.querySelector('.plate');
const ring = root.querySelector('.ring');
const block = root.querySelector('.block');
const bars = root.querySelector('.bars');
const barItems = [...bars.children];
const squiggle = root.querySelector('.squiggle');
const CARD = 0.5;
const STAGGER = 0.07;
export function seek(local) {
  const out = exitAt(local, root);
  const at = Number(root.dataset.frameAt || 0);
  const f = outExpo(span(local, at, 0.5));
  if (plate) plate.style.transform = `scale(${1 - (1 - CARD) * f})`;
  if (plate) plate.style.clipPath = `inset(0 round ${56 * f}px)`;
  const s = at + 0.3;
  const r = outQuart(span(local, s, 0.45));
  ring.style.opacity = String((r > 0 ? 1 : 0) * out);
  ring.style.clipPath = sweep(r);
  const b = outExpo(span(local, s + STAGGER, 0.35));
  block.style.opacity = String(b * out);
  block.style.transform = `rotate(${-20 * (1 - b)}deg) scale(${0.96 + 0.04 * b})`;
  bars.style.opacity = String((local >= s ? 1 : 0) * out);
  barItems.forEach((bar, i) => { bar.style.transform = `scaleY(${outQuart(span(local, s + 2 * STAGGER + i * 0.05, 0.3))})`; });
  const q = outQuart(span(local, s + 3 * STAGGER, 0.45));
  squiggle.style.opacity = String((q > 0 ? 1 : 0) * out);
  squiggle.style.clipPath = `inset(0 ${100 - 100 * q}% 0 0)`;
  return syncVideos(root, local);
}
