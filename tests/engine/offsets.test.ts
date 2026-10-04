import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { composePlan } from '../helpers/engine.ts';

const BROWSER_TIMEOUT_MS = 60_000;
const PAGE = { width: 1920, height: 1080 };
/** Times inside the clip where its animation is somewhere different. */
const TIMES = [0.4, 1.3, 2.6];

/** A clip that animates one element's transform, left and top, as the engine's own clips do. */
const MOVER = `<title>09 Mover</title>
<style>#dot{position:absolute;width:60px;height:40px;background:#E14A12}</style>
<div data-slot="over"><div id="dot"></div></div><!--/over-->
<script>
M.scene({W:1920,H:1080,bg:null,T:3,center:[960,540],intro:null,SH:{p:{w:400,h:300,r:10,bg:'#fff',cam:1}},start:'p',SEQ:[],
  extra:(t)=>{const d=document.getElementById('dot'); d.style.left=(100+100*t)+'px'; d.style.top=(200+50*t)+'px'; d.style.transform='rotate('+(t*10)+'deg) scale('+(1+t/10)+')';}});
</script>`;

type Offsets = Record<string, { x: number; y: number; scale: number }>;

function compose(offsets: Offsets | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-offsets-'));
  mkdirSync(join(dir, 'clips'));
  writeFileSync(join(dir, 'clips', '09-mover.html'), MOVER);
  const clip = { id: '09', title: 'Mover', in: 0, out: 3, kind: 'panel', clip: 'clips/09-mover.html', ...(offsets ? { offsets } : {}) };
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ title: 'Offsets', duration: 3, clips: [clip] }));
  composePlan(join(dir, 'plan.json'), join(dir, 'page.html'));
  return join(dir, 'page.html');
}

interface Box {
  cx: number;
  cy: number;
  width: number;
}

/** The dot's box on the page at each time, as the engine draws it. */
async function boxes(page: string): Promise<Box[]> {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const tab = await browser.newPage({ viewport: PAGE });
    await tab.goto(`${pathToFileURL(page).href}?render`);
    const found: Box[] = [];
    for (const t of TIMES) {
      found.push(
        await tab.evaluate((at) => {
          (window as unknown as { seek(t: number): void }).seek(at);
          const r = document.querySelector('[data-el="dot"]')!.getBoundingClientRect();
          return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, width: r.width };
        }, t),
      );
    }
    return found;
  } finally {
    await browser.close();
  }
}

describe('element offsets in a composed plan', () => {
  it('stack on an element whose transform, left and top are animated: where it is equals the animation plus the offset, at every time', { timeout: BROWSER_TIMEOUT_MS }, async () => {
    const home = await boxes(compose(undefined));
    const moved = await boxes(compose({ dot: { x: 30, y: -20, scale: 2 } }));

    for (const [i, box] of moved.entries()) {
      expect(box.cx - home[i]!.cx).toBeCloseTo(30, 3);
      expect(box.cy - home[i]!.cy).toBeCloseTo(-20, 3);
      expect(box.width / home[i]!.width).toBeCloseTo(2, 3);
    }
    // The animation itself still runs under the offset: the dot is not in the same place at two times.
    expect(Math.abs(moved[2]!.cx - moved[0]!.cx)).toBeGreaterThan(100);
  });

  it('moves a whole clip through its root, whatever its elements do', { timeout: BROWSER_TIMEOUT_MS }, async () => {
    const home = await boxes(compose(undefined));
    const moved = await boxes(compose({ '@clip': { x: -40, y: 25, scale: 1 } }));

    for (const [i, box] of moved.entries()) {
      expect(box.cx - home[i]!.cx).toBeCloseTo(-40, 3);
      expect(box.cy - home[i]!.cy).toBeCloseTo(25, 3);
    }
  });

  it('writes only offsets that move something: none, or all at home, builds the same page', () => {
    const plain = readFileSync(compose(undefined), 'utf8');
    expect(readFileSync(compose({}), 'utf8')).toBe(plain);
    expect(readFileSync(compose({ dot: { x: 0, y: 0, scale: 1 } }), 'utf8')).toBe(plain);
    expect(readFileSync(compose({ dot: { x: 4, y: 0, scale: 1 } }), 'utf8')).toContain('[data-el="dot"]{translate:4px 0px;}');
  });
});
