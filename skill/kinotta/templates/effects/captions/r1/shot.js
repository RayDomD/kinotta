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

const root = document.querySelector('[data-scene="captions"]');
const words = [...root.querySelectorAll('.w')].map((el) => ({ el, at: Number(el.dataset.at) }));
const BLUR = 12;
const IN = 0.2;
export function seek(local) {
  const out = exitAt(local, root);
  words.forEach(({ el, at }, i) => {
    const next = i + 1 < words.length ? words[i + 1].at : Infinity;
    const live = local >= at && local < next;
    const a = outExpo(span(local, at, IN));
    el.style.opacity = live ? String(a * out) : '0';
    el.style.transform = `scale(${0.97 + 0.03 * a})`;
    el.style.filter = a < 1 ? `blur(${BLUR * (1 - a)}px)` : 'none';
  });
  return syncVideos(root, local);
}
