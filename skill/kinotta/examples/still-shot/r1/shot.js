// A still shot shows the same frame at every local time. A moving shot sets its styles from the time passed to seek.
const root = document.querySelector('[data-scene="example"]');
export function seek(local) {
  root.dataset.local = String(local);
}
