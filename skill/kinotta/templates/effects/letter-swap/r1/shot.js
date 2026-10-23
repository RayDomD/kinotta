const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="letter-swap"]');
const words = [...root.querySelector('[data-el="words"]').children];
const oldText = words[0].textContent;
const newText = words[1].textContent;
const letters = words.map((word, index) => {
  word.className = 'word';
  const text = index ? newText : oldText;
  word.textContent = '';
  return [...text].map((letter, i) => {
    const el = document.createElement('span');
    el.className = 'letter'; el.dataset.el = `${index ? 'new' : 'old'}-letter-${i + 1}`;
    el.textContent = letter === ' ' ? '\u00a0' : letter;
    word.appendChild(el); return el;
  });
});
export function seek(local) {
  const at = Number(words[1].dataset.at || 2);
  const stagger = .05, exitDuration = .2;
  // All old glyphs clear before any replacement glyph appears, including unequal lengths.
  const enterAt = at + Math.max(0, letters[0].length - 1) * stagger + exitDuration + .05;
  letters[0].forEach((el, i) => {
    const k = span(local, at + i * stagger, exitDuration);
    el.style.opacity = String(1 - k); el.style.transform = `translateY(${-40 * k}px)`;
  });
  letters[1].forEach((el, i) => {
    const k = rise(span(local, enterAt + i * stagger, .25));
    el.style.opacity = String(k); el.style.transform = `translateY(${40 * (1 - k)}px)`;
  });
}
