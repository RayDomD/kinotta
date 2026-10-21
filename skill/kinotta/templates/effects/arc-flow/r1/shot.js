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

const root = document.querySelector('[data-scene="arc-flow"]');
const ends = [...root.querySelectorAll('.end')];
const arc = root.querySelector('.arc');
const thumb = root.querySelector('.thumb');
const bar = root.querySelector('.bar');
const tick = root.querySelector('.done');
// The arc's curve in page pixels. Keep in step with the path and the .arc box in shot.css (its viewBox is drawn 1:1).
const ARC = { x: 470, y: 90, p0: [60, 290], p1: [500, -230], p2: [940, 290] };
const onArc = (k) => {
  const m = 1 - k;
  const x = m * m * ARC.p0[0] + 2 * m * k * ARC.p1[0] + k * k * ARC.p2[0];
  const y = m * m * ARC.p0[1] + 2 * m * k * ARC.p1[1] + k * k * ARC.p2[1];
  return [ARC.x + x, ARC.y + y];
};
const inOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export function seek(local) {
  const out = exitAt(local, root);
  const send = Number(root.dataset.sendAt);
  const arrive = Number(root.dataset.arriveAt);
  ends.forEach((el, i) => {
    const a = outExpo(span(local, 0.1 + i * 0.07, 0.4));
    el.style.opacity = String(a * out);
    el.style.transform = `translateY(${20 * (1 - a)}px) scale(${0.96 + 0.04 * a})`;
  });
  const d = outQuart(span(local, 0.2, 0.5));
  arc.style.opacity = String(out);
  arc.style.clipPath = `inset(-200px ${100 - 100 * d}% -10px 0)`;
  const k = inOutCubic(span(local, send, arrive - send));
  const [x, y] = onArc(k);
  const live = local >= send && local < arrive + 0.15;
  thumb.style.opacity = live ? String(1 - span(local, arrive, 0.15)) : '0';
  thumb.style.transform = `translate(${x}px, ${y}px) rotate(${-8 + 16 * k}deg)`;
  const fill = outQuart(span(local, arrive, 0.6));
  bar.style.transform = `scaleX(${fill})`;
  const t = outQuart(span(local, arrive + 0.65, 0.25));
  bar.style.opacity = String(1 - t);
  tick.style.clipPath = `inset(0 ${100 - 100 * t}% 0 0)`;
  return syncVideos(root, local);
}
