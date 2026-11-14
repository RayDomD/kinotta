import { describe, expect, it } from 'vitest';
import { assembleParts, checkShotsAgainstPage, openProject, scanPage } from '../../server/core/index.ts';
import { partsFixture, partsInputs } from '../helpers/parts.ts';

describe('parts assembler', () => {
  it('assembles the same manifest and revisions into identical contract-1-compatible bytes', async () => {
    const { dir, reelDir, manifest } = partsFixture();
    const inputs = partsInputs(reelDir, manifest);
    const html = assembleParts(manifest, inputs);
    expect(assembleParts(manifest, { ...inputs, shots: Object.fromEntries(Object.entries(inputs.shots).reverse()) })).toBe(html);
    const scan = scanPage(html);
    expect(scan.issues).toEqual([]);
    expect(scan.scenes.map((scene) => [scene.name, scene.start, scene.duration])).toEqual([['hook', 0, 1], ['proof', 1, 1], ['close', 2, 1]]);
    expect(checkShotsAgainstPage((await openProject(dir).readVersion('parts', 1)).shots, scan.scenes)).toEqual([]);
    expect(html.match(/<script type="module"/g)).toHaveLength(3);
  });

  it.each([
    '.label{color:red}',
    '[data-scene="hook"] .label,body{color:red}',
    '@media(min-width:1px){body{color:red}}',
    '[data-scene="hook-other"] .label{color:red}',
    '[data-scene="hook"] + section{color:red}',
  ])('refuses unscoped shot CSS: %s', (css) => {
    const { reelDir, manifest } = partsFixture();
    const inputs = partsInputs(reelDir, manifest);
    inputs.shots['hook/r1'].css = css;
    expect(() => assembleParts(manifest, inputs)).toThrow(/hook.*CSS.*scope/i);
  });

  it('keeps scoped selector lists and grouping rules with isolated namespaced keyframes', () => {
    const { reelDir, manifest } = partsFixture();
    const inputs = partsInputs(reelDir, manifest);
    inputs.shots['hook/r1'].css = '@media(min-width:1px){[data-scene="hook"] .label,[data-scene="hook"] .other{color:red}}@keyframes hook--pulse{from{opacity:0}to{opacity:1}}';
    expect(assembleParts(manifest, inputs)).toContain('hook--pulse');
  });

  it('refuses a fragment with the wrong scene name and a non-self-contained script', () => {
    const { reelDir, manifest } = partsFixture();
    const inputs = partsInputs(reelDir, manifest);
    inputs.shots['hook/r1'].html = '<section data-scene="other"><div data-el="label">Other</div></section>';
    expect(() => assembleParts(manifest, inputs)).toThrow(/hook.*root/);
    inputs.shots['hook/r1'].html = '<section data-scene="hook"><div data-el="label">Hook</div></section>';
    inputs.shots['hook/r1'].js = 'import { animate } from "./motion.js";export function seek(t){animate(t)}';
    expect(() => assembleParts(manifest, inputs)).toThrow(/hook.*self-contained/);
  });

  it('resolves fragment and shared-style assets against their immutable revision folders', () => {
    const { reelDir, manifest } = partsFixture();
    const inputs = partsInputs(reelDir, manifest);
    inputs.shots['hook/r1'].html = '<section data-scene="hook"><img data-el="image" src="assets/mark.png"></section>';
    inputs.shots['hook/r1'].css = '[data-scene="hook"]{background-image:url("assets/ground.png")}';
    inputs.shared.r1.css = '@font-face{font-family:Brand;src:url(fonts/brand.woff2)}';
    inputs.shots['hook/r1'].js = 'const asset=new URL("assets/mark.png",import.meta.url);export function seek(local){}';
    const html = assembleParts(manifest, inputs);
    expect(html).toContain('../shots/hook/r1/assets/mark.png');
    expect(html).toContain('../shots/hook/r1/assets/ground.png');
    expect(html).toContain('../shared/r1/fonts/brand.woff2');
    expect(html).toContain('../shots/hook/r1/shot.js');
  });
});
