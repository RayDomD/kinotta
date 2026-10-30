/** Request clipboard access in the click task; the save supplies the text later. */
export function copySavedText(text: Promise<string>): Promise<boolean> {
  try {
    const write = typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function'
      ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })) })])
      : text.then((value) => navigator.clipboard.writeText(value));
    return write.then(() => true, () => false);
  } catch {
    // The save still runs when clipboard access is unavailable.
    void text.catch(() => undefined);
    return Promise.resolve(false);
  }
}
