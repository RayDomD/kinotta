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
const root = document.querySelector('[data-scene="phone"]');
const screenArea = root.querySelector('.screens');
const screens = [...screenArea.children].map((media, i) => {
  const el = document.createElement('div');
  el.className = 'screen-item'; el.dataset.el = `screen-${i + 1}`;
  const header = document.createElement('div'); header.className = 'screen-header';
  const body = document.createElement('div'); body.className = 'screen-body';
  const headerMedia = media.cloneNode(true);
  headerMedia.removeAttribute('data-el');
  media.replaceWith(el); header.appendChild(headerMedia); body.appendChild(media);
  el.append(header, body);
  return {el, media, headerMedia, header, body};
});
const tap = root.querySelector('.tap');
export function seek(local) {
  const active = screens.reduce((index, {media}, i) => local >= Number(media.dataset.at || 0) ? i : index, -1);
  screens.forEach(({el, media, headerMedia, header, body}, i) => {
    el.style.visibility = i === active ? 'visible' : 'hidden';
    // Protect the supplied header band; only the content below it scrolls.
    const headerHeight = Math.max(0, Math.min(screenArea.clientHeight,
      Number(media.dataset.headerHeight ?? root.dataset.headerHeight ?? 150)));
    header.style.height = `${headerHeight}px`;
    body.style.top = `${headerHeight}px`;
    headerMedia.style.transform = 'none';
    const maximum = Math.max(0, media.getBoundingClientRect().height - screenArea.clientHeight);
    const distance = Math.max(0, Math.min(Number(media.dataset.scroll || 0), maximum));
    const scroll = distance * ease(span(local, Number(media.dataset.at || 0) + .3, 1));
    media.style.transform = `translateY(${-headerHeight - scroll}px)`;
  });
  const k = span(local, Number(tap.dataset.at || 2), .35);
  tap.style.opacity = String(local >= Number(tap.dataset.at || 2) && k < 1 ? 1 - k : 0);
  tap.style.transform = `scale(${.95 + .25 * k})`;
  return syncVideos(root, local);
}
