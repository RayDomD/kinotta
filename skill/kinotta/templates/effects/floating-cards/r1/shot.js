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
const root = document.querySelector('[data-scene="floating-cards"]');
const cards = [...root.querySelectorAll('.card')];
const STAGGER = 0.07;
export function seek(local) {
  const out = exitAt(local, root);
  cards.forEach((card, i) => {
    const a = outExpo(span(local, 0.1 + i * STAGGER, 0.55));
    const tilt = card.style.getPropertyValue('--tilt') || '0deg';
    card.style.opacity = String(a * out);
    card.style.transform = `translateY(${90 * (1 - a)}px) rotate(${tilt}) scale(${0.96 + 0.04 * a})`;
  });
  return syncVideos(root, local);
}
