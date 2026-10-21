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

const root = document.querySelector('[data-scene="live-grade"]');
const plate = root.querySelector('.plate');
const IDENTITY = { grayscale: 0, sepia: 0, saturate: 1, brightness: 1, contrast: 1, 'hue-rotate': 0 };
const UNITS = { 'hue-rotate': 'deg' };
const parse = (text) => {
  const g = { ...IDENTITY };
  for (const [, fn, v] of String(text).matchAll(/([a-z-]+)\(\s*(-?[\d.]+)/g)) if (fn in g) g[fn] = Number(v);
  return g;
};
const steps = [...root.querySelectorAll('[data-grade]')].map((el) => ({
  at: Number(el.dataset.at),
  grade: el.dataset.grade === 'none' ? { ...IDENTITY } : parse(getComputedStyle(root).getPropertyValue(`--grade-${el.dataset.grade}`)),
}));
const XFADE = 0.25;
export function seek(local) {
  let from = IDENTITY;
  let to = IDENTITY;
  let k = 1;
  for (const step of steps) {
    if (local < step.at) break;
    from = to;
    to = step.grade;
    k = outQuart(span(local, step.at, XFADE));
  }
  if (plate) plate.style.filter = Object.keys(IDENTITY).map((fn) => `${fn}(${from[fn] + (to[fn] - from[fn]) * k}${UNITS[fn] || ''})`).join(' ');
  return syncVideos(root, local);
}
