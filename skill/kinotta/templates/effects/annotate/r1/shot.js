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

const root = document.querySelector('[data-scene="annotate"]');
const enters = [...root.querySelectorAll('.label, .word')].map((el) => ({ el, at: Number(el.dataset.at) }));
const strikes = [...root.querySelectorAll('.strike')].map((el) => ({ el, at: Number(el.dataset.at), lines: [...el.querySelectorAll('path')] }));
const loops = [...root.querySelectorAll('.loop')].map((el) => ({ el, at: Number(el.dataset.at) }));
export function seek(local) {
  const out = exitAt(local, root);
  enters.forEach(({ el, at }) => {
    const a = outExpo(span(local, at, 0.35));
    el.style.opacity = String(a * out);
    el.style.transform = `translateY(${18 * (1 - a)}px) scale(${0.96 + 0.04 * a})`;
  });
  strikes.forEach(({ el, at, lines }) => {
    el.style.opacity = local >= at ? '1' : '0';
    lines.forEach((line, i) => { line.style.clipPath = `inset(0 ${100 - 100 * outQuart(span(local, at + i * 0.1, 0.16))}% 0 0)`; });
  });
  loops.forEach(({ el, at }) => {
    const k = outQuart(span(local, at, 0.45));
    el.style.opacity = k > 0 ? '1' : '0';
    el.style.clipPath = sweep(k);
  });
  return syncVideos(root, local);
}
