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
const root = document.querySelector('[data-scene="number-cut"]');
const [plate, blur] = root.querySelectorAll('.plate');
const number = root.querySelector('.number');
export function seek(local) {
  const out = exitAt(local, root, 0.25);
  const push = outQuart(span(local, 0, 0.35));
  const zoom = 1 + 0.12 * push;
  plate.style.transform = blur.style.transform = `scale(${zoom})`;
  blur.style.opacity = String(push * out);
  const n = outExpo(span(local, 0.15, 0.4));
  number.style.opacity = String(n * out);
  number.style.transform = `scale(${0.96 + 0.04 * n})`;
  return syncVideos(root, local);
}
