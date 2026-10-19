const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => 1 - Math.pow(1 - x, 4);
const inQuad = (x) => x * x;
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const syncVideos = (root, local) => Promise.all([...root.querySelectorAll('video')].map((video) => new Promise((done) => {
  video.pause();
  const time = local + Number(video.dataset.offset || 0);
  if (Math.abs(video.currentTime - time) < 0.001) return done();
  video.addEventListener('seeked', done, { once: true });
  setTimeout(done, 400);
  video.currentTime = time;
})));

const root = document.querySelector('[data-scene="activity-feed"]');
const notes = [...root.querySelectorAll('.note')].map((el) => ({ el, at: Number(el.dataset.at), dir: el.closest('.left') ? -1 : 1 }));
export function seek(local) {
  const out = exitAt(local, root);
  notes.forEach(({ el, at, dir }) => {
    const a = outExpo(span(local, at, 0.4));
    el.style.opacity = String(a * out);
    el.style.transform = `translateX(${dir * 48 * (1 - a)}px) scale(${0.97 + 0.03 * a})`;
  });
  return syncVideos(root, local);
}
