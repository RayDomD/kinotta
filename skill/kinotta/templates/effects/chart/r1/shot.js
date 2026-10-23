const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="chart"]');
const rows = [...root.querySelector('[data-el="data"]').children].map((el, i) => {
  const [label, raw] = el.textContent.split('|');
  const value = Number(raw);
  if (!label || raw === undefined || !Number.isFinite(value) || value < 0) throw new Error('chart requires label|nonnegative value from the plan');
  el.className = 'chart-row'; el.dataset.el = `row-${i + 1}`; el.textContent = '';
  const name = document.createElement('span'); name.textContent = label;
  const track = document.createElement('div'); track.className = 'track';
  const bar = document.createElement('div'); bar.className = 'bar'; bar.dataset.el = `bar-${i + 1}`;
  const number = document.createElement('span'); number.className = 'value'; number.textContent = raw;
  track.appendChild(bar); el.append(name, track, number);
  return {el, bar, value};
});
const maximum = Math.max(1, ...rows.map((r) => r.value));
export function seek(local) {
  rows.forEach(({el, bar, value}) => {
    const k = rise(span(local, Number(el.dataset.at || 0), .45));
    el.style.opacity = local >= Number(el.dataset.at || 0) ? '1' : '0';
    bar.style.transform = `scaleX(${value / maximum * k})`;
  });
}
