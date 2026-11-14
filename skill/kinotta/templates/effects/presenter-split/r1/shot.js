const syncVideos = (root, local) => Promise.all([...root.querySelectorAll('video')].map((video) => new Promise((done) => {
  video.pause();
  const time = local + Number(video.dataset.offset || 0);
  if (Math.abs(video.currentTime - time) < 0.001) return done();
  video.addEventListener('seeked', done, { once: true });
  setTimeout(done, 400);
  video.currentTime = time;
})));

const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="presenter-split"]');
const speaker = root.querySelector('.speaker-window');
const plate = root.querySelector('.plate');
const insert = root.querySelector('.insert');
export function seek(local) {
  const k = rise(span(local, Number(insert.dataset.at || .5), .5));
  const right = root.dataset.side !== 'left';
  const width = mix(1920, 960, k);
  const left = right ? 0 : 1920 - width;
  speaker.style.width = `${width}px`; speaker.style.transform = `translateX(${left}px)`;
  // The plate keeps its aspect ratio and scale; only the viewport and crop move.
  const focus = clamp(Number(root.dataset.focusX || .5));
  if (plate) plate.style.transform = `translateX(${-Math.max(0, Math.min(1920 - width, 1920 * focus - width / 2))}px)`;
  insert.style.transform = `translateX(${right ? mix(1920, 960, k) : mix(-960, 0, k)}px)`;
  return syncVideos(root, local);
}
