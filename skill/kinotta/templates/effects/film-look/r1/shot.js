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
const root = document.querySelector('[data-scene="film-look"]');
const canvas = root.querySelector('canvas');
const context = canvas.getContext('2d', {alpha: false});
const pixels = context.createImageData(canvas.width, canvas.height);
const plate = root.querySelector('.plate');
const layers = ['.bloom', '.grain', '.vignette'].map((selector) => root.querySelector(selector));
export function seek(local) {
  const enabled = root.dataset.enabled !== 'false';
  layers.forEach((el) => { el.style.display = enabled ? '' : 'none'; });
  if (plate) plate.style.filter = enabled && root.dataset.mono === 'true' ? 'var(--grade-mono)' : 'none';
  if (!enabled) return syncVideos(root, local);
  const frame = Math.max(0, Math.floor(local * Math.max(1, Number(root.dataset.fps) || 30)));
  // A fresh, fixed-seed noise field per frame, never a translated texture.
  let seed = (Math.imul(frame + 1, 2654435761) ^ 0x6d2b79f5) >>> 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const value = seed >>> 24;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return syncVideos(root, local);
}
