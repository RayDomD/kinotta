const stepsWidth = 1480;
const stepGap = 100;
const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="diagram"]');
const steps = [...root.querySelector('[data-el="steps"]').children].map((el, i, all) => {
  const text = el.textContent; el.textContent = ''; el.className = 'step'; el.style.width = `${Math.floor((stepsWidth - (all.length - 1) * stepGap) / all.length)}px`; el.dataset.el = `step-${i + 1}`;
  const box = document.createElement('div'); box.className = 'box'; box.textContent = text;
  el.appendChild(box);
  const arrow = i < all.length - 1 ? document.createElement('div') : null;
  if (arrow) { arrow.className = 'arrow'; arrow.dataset.el = `arrow-${i + 1}`; el.appendChild(arrow); }
  return {el, box, arrow};
});
export function seek(local) {
  steps.forEach(({el, box, arrow}) => {
    const at = Number(el.dataset.at || 0);
    const k = rise(span(local, at, .4));
    box.style.opacity = String(k); box.style.clipPath = `inset(0 ${100 * (1 - k)}% 0 0)`;
    if (arrow) arrow.style.transform = `scaleX(${ease(span(local, at + .4, .3))})`;
  });
}
