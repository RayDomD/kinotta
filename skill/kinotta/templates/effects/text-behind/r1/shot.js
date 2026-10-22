const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => globalThis.M?.curves?.rise?.(x) ?? (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
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
const root = document.querySelector('[data-scene="text-behind"]');
const lines = [...root.querySelectorAll('.line')];
const STAGGER = 0.08;
export function seek(local) {
  const out = exitAt(local, root);
  lines.forEach((line, i) => {
    const a = outExpo(span(local, 0.1 + i * STAGGER, 0.6));
    line.style.opacity = String(a * out);
    line.style.transform = `translateY(${60 * (1 - a)}px)`;
  });
  return syncVideos(root, local);
}
