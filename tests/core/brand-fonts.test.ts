import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { fontsFromDesign, readBrandFonts } from '../../server/core/_internal/brand-fonts.ts';

it('reads words and numbers families from a design file\'s typography', () => {
  expect(fontsFromDesign(readFileSync(resolve('DESIGN.md'), 'utf8'))).toEqual({ words: 'Outfit', numbers: 'Doto' });
  expect(fontsFromDesign('# No front matter')).toEqual({});
});

it('follows reels/brand.md to the type source, falls back to DESIGN.md, then to the built-in brand', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-brand-'));
  expect(await readBrandFonts(dir)).toEqual({ words: 'Geist', numbers: 'Geist Mono', source: 'built-in' });
  writeFileSync(join(dir, 'DESIGN.md'), '---\ntypography:\n  body:\n    fontFamily: "Inter, sans-serif"\n---\n');
  expect(await readBrandFonts(dir)).toEqual({ words: 'Inter', numbers: 'Inter', source: 'brand', file: 'DESIGN.md' });
  mkdirSync(join(dir, 'reels')); mkdirSync(join(dir, 'brand'));
  writeFileSync(join(dir, 'brand', 'type.md'), '---\ntypography:\n  headline:\n    fontFamily: Fraunces\n  mono:\n    fontFamily: "JetBrains Mono"\n---\n');
  writeFileSync(join(dir, 'reels', 'brand.md'), '# Brand file\n\nchecked: 2026-10-25\n\n## Sources\n\n- Colour and type: `brand/type.md`\n');
  expect(await readBrandFonts(dir)).toEqual({ words: 'Fraunces', numbers: 'JetBrains Mono', source: 'brand', file: 'brand/type.md' });
  // A source outside the project is never read.
  writeFileSync(join(dir, 'reels', 'brand.md'), '- Colour and type: `../../etc/type.md`\n');
  expect((await readBrandFonts(dir)).file).toBe('DESIGN.md');
});
