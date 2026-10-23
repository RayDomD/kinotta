const syncVideos = (root, local) => Promise.all([...root.querySelectorAll('video')].map(async (video) => {
  video.pause();
  if (video.readyState < 1) await new Promise((done, fail) => {
    video.addEventListener('loadedmetadata', done, {once: true});
    video.addEventListener('error', fail, {once: true});
  });
  const time = Math.max(0, Math.min(Number.isFinite(video.duration) ? Math.max(0, video.duration - .001) : local,
    local + Number(video.dataset.offset || 0)));
  if (Math.abs(video.currentTime - time) < .001 && video.readyState >= 2) return;
  await new Promise((done, fail) => {
    video.addEventListener('seeked', done, {once: true});
    video.addEventListener('error', fail, {once: true});
    video.currentTime = time;
  });
}));
const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="phone"]');
const screens = [...root.querySelector('.screens').children];
const tap = root.querySelector('.tap');
export function seek(local) {
  const active = screens.reduce((index, el, i) => local >= Number(el.dataset.at || 0) ? i : index, -1);
  screens.forEach((el, i) => {
    el.style.opacity = String(i === active ? 1 : 0);
    const scroll = Number(el.dataset.scroll || 0) * ease(span(local, Number(el.dataset.at || 0) + .3, 1));
    el.style.transform = `translateY(${-scroll}px)`;
  });
  const k = span(local, Number(tap.dataset.at || 2), .35);
  tap.style.opacity = String(local >= Number(tap.dataset.at || 2) && k < 1 ? 1 - k : 0);
  tap.style.transform = `scale(${.95 + .25 * k})`;
  return syncVideos(root, local);
}
