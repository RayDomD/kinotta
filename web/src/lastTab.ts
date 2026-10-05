const KEY_PREFIX = 'kinotta.tab.';

export type Tab = 'Storyboard' | 'Review';
const TABS: readonly Tab[] = ['Storyboard', 'Review'];

/** The tab last used for a reel, or null when none was or the browser keeps nothing. Per viewer, so browser storage is enough. */
export function lastTab(slug: string): Tab | null {
  try {
    const stored = window.localStorage.getItem(KEY_PREFIX + slug);
    return TABS.find((tab) => tab === stored) ?? null;
  } catch {
    return null;
  }
}

export function rememberTab(slug: string, tab: Tab): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + slug, tab);
  } catch {
    // Storage is blocked or full: the reel simply opens in Storyboard next time.
  }
}
