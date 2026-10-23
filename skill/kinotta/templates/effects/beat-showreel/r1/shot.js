const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="beat-showreel"]');
const hook = root.querySelector('.hook');
const motif = root.querySelector('.motif');
const events = [...root.querySelector('.events').children];
export function seek(local) {
  const beat = 60 / Math.max(1, Number(root.dataset.bpm));
  const beatsPerBar = Math.max(1, Number(root.dataset.beatsPerBar));
  const total = beat * beatsPerBar * Math.max(2, Number(root.dataset.bars));
  const t = ((local % total) + total) % total;
  const finalBar = total - beat * beatsPerBar;
  const away = ease(span(t, beat * beatsPerBar, beat));
  const back = ease(span(t, finalBar, beat));
  const k = away * (1 - back);
  motif.style.transform = `translate(${-680 * k}px, ${160 * k}px) rotate(${180 * k}deg)`;
  motif.style.borderRadius = `${100 * (1 - k)}px`;
  hook.style.opacity = String(1 - k);
  events.forEach((el, i) => {
    const at = (beatsPerBar + i * 2) * beat;
    el.style.opacity = String(span(t, at, beat / 4) * (1 - span(t, at + beat, beat / 4)) * (1 - back));
    el.style.transform = `translateY(${20 * (1 - rise(span(t, at, beat / 2)))}px)`;
  });
}
