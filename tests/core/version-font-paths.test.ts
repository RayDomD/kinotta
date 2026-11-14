import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { stageVersion } from '../../server/core/_internal/version-build.ts';
import { copyFixture } from '../helpers/project.ts';

it.each([false, true])('builds a version with a relative brand font (freeze=%s)', { timeout: 30000 }, async (freezeSources) => {
  const dir = copyFixture('footage-project');
  const font = join(dir, 'brand.woff2');
  cpSync(resolve('skill/kinotta/engine/fonts/Geist-Variable.woff2'), font);
  const bytes = readFileSync(font);
  const plan = JSON.parse(readFileSync(join(dir, 'motion/plan.json'), 'utf8'));
  plan.captions = false;
  plan.brand = { fonts: [{ family: 'Test Brand', weight: 500, file: '../brand.woff2' }], tokens: { 'fx-font': 'Test Brand' } };
  const before = JSON.stringify(plan);
  const stage = await stageVersion(join(dir, 'reels/founder-talk'), { planDir: join(dir, 'motion'), plan, words: [], builtBy: 'you', freezeSources });
  const saved = JSON.parse(readFileSync(join(stage.dir, 'plan.json'), 'utf8'));
  expect(saved.brand.fonts[0]).toMatchObject({ family: 'Test Brand', weight: 500 });
  expect(readFileSync(resolve(stage.dir, saved.brand.fonts[0].file))).toEqual(bytes);
  expect(readFileSync(join(stage.dir, 'index.html'), 'utf8')).toContain(bytes.toString('base64'));
  expect(JSON.stringify(plan)).toBe(before);
  if (freezeSources) {
    writeFileSync(font, 'changed source');
    expect(readFileSync(resolve(stage.dir, saved.brand.fonts[0].file))).toEqual(bytes);
  }
});
