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

const root = document.querySelector('[data-scene="chip-tally"]');
const chips = [...root.querySelectorAll('.chip')].map((el) => ({ el, at: Number(el.dataset.at), tick: el.querySelector('.tick') }));
export function seek(local) {
  const out = exitAt(local, root);
  chips.forEach(({ el, at, tick }) => {
    el.style.display = local >= at ? 'flex' : 'none';
    const a = outExpo(span(local, at, 0.3));
    el.style.opacity = String(a * out);
    el.style.transform = `translateY(${16 * (1 - a)}px) scale(${0.96 + 0.04 * a})`;
    tick.style.clipPath = `inset(0 ${100 - 100 * outQuart(span(local, at + 0.12, 0.25))}% 0 0)`;
  });
  return syncVideos(root, local);
}
