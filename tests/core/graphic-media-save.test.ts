import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'node-html-parser';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

it.each(['trim', 'split'] as const)('blocks a broken word-linked graphic until explicitly repaired by %s and publishes every continuous section part', async (repair) => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  mkdirSync(join(reel, 'clips'), { recursive: true });
  writeFileSync(join(reel, 'clips/card.html'), '<div data-slot="world"><div data-el="card">Card</div></div><!--/world--><script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>');
  const plan = { title: 'Attached graphic', duration: 6, sections: [{ id: 'topic', name: 'Topic', placement: 'take', start: 0, end: 4 }], clips: [{ id: '01', in: 1, out: 3, placement: 'take', title: 'Card', kind: 'full', section: 'topic', clip: 'clips/card.html' }], media: {
    schema: 1, sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [] }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 2 }, { id: 'gap', role: 'gap', duration: 2 }, { id: 'later', origin: 'take', role: 'main', source: 'a', in: 2, out: 4 }], sequence: ['take', 'gap', 'later'],
  } };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  const project = openProject(dir);
  await project.addOperation('founder-talk', { kind: 'placement-change', placement: 'take', changes: { gain: 0.5 } });
  await expect(project.saveEdits('founder-talk')).rejects.toThrow('attachment');
  expect((await project.readEditList('founder-talk')).operations).toHaveLength(1);
  if (repair === 'trim') await project.addOperation('founder-talk', { kind: 'clip-trim', clip: '01', in: 1, out: 2 });
  else await project.addOperation('founder-talk', { kind: 'clip-split', clip: '01' });
  await project.saveEdits('founder-talk');
  const saved = await project.readVersion('founder-talk', 2);
  expect(saved.sections.map((s) => [s.start, s.end])).toEqual([[0, 2], [4, 6]]);
  expect(saved.shots.map((s) => s.line)).toEqual(repair === 'trim' ? [{ start: 1, end: 2 }] : [{ start: 1, end: 2 }, { start: 4, end: 5 }]);
  if (repair === 'split') {
    const page = parse(readFileSync(join(reel, 'v2/index.html'), 'utf8'));
    const scenes = page.querySelectorAll('[data-scene]').map((s) => s.getAttribute('data-scene'));
    expect(scenes).toHaveLength(2);
    expect(new Set(scenes).size).toBe(2);
  }
  const savedPlan = JSON.parse(readFileSync(join(reel, 'v2/plan.json'), 'utf8'));
  savedPlan.clips[0].out = 3;
  writeFileSync(join(reel, 'v2/plan.json'), JSON.stringify(savedPlan));
  await expect(project.render({ reel: 'founder-talk', version: 2, preset: 'draft' })).rejects.toThrow('attachment');
});

it('freezes a graphic fragment and its nested local image, and refuses an unfrozen external dependency', async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  mkdirSync(join(reel, 'clips/assets'), { recursive: true });
  const image = Buffer.from('original graphic image');
  writeFileSync(join(reel, 'clips/assets/product.png'), image);
  writeFileSync(join(reel, 'clips/card.css'), '.product{background:url(assets/product.png)}');
  const scene = '<script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>';
  writeFileSync(join(reel, 'clips/01-card.html'), '<link rel="stylesheet" href="card.css"><div data-slot="world"><div data-el="product" class="product"><img src="assets/product.png"></div></div><!--/world-->' + scene);
  const plan = {
    title: 'Graphic', duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }],
    clips: [{ id: '01', in: 0, out: 2, title: 'Product', kind: 'full', section: 'all', clip: 'clips/01-card.html' }],
    media: { schema: 1, sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [] }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['take'] },
  };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  const project = openProject(dir);
  await project.addOperation('founder-talk', { kind: 'placement-change', placement: 'take', changes: { gain: 0.5 } });
  await project.saveEdits('founder-talk');
  const saved = JSON.parse(readFileSync(join(reel, 'v2/plan.json'), 'utf8'));
  const fragment = resolve(reel, 'v2', saved.clips[0].clip);
  expect(fragment.startsWith(join(reel, 'v2'))).toBe(true);
  writeFileSync(join(reel, 'clips/assets/product.png'), 'changed original');
  const assets = readdirSync(join(reel, 'v2/dependencies'));
  const copiedImage = assets.find((file) => file.endsWith('product.png'))!;
  expect(readFileSync(join(reel, 'v2/dependencies', copiedImage))).toEqual(image);
  const css = assets.find((file) => file.endsWith('card.css'))!;
  expect(readFileSync(join(reel, 'v2/dependencies', css), 'utf8')).toContain(copiedImage);
  expect(readFileSync(fragment, 'utf8')).toContain(`dependencies/${copiedImage}`);
  writeFileSync(join(reel, 'clips/01-card.html'), '<script src="https://example.com/mutable.js"></script><div data-el="product"></div>' + scene);
  await project.addOperation('founder-talk', { kind: 'placement-change', placement: 'take', changes: { gain: 0.25 } });
  await expect(project.saveEdits('founder-talk')).rejects.toThrow('cannot be frozen');
  expect((await project.listVersions('founder-talk')).map((version) => version.number)).toEqual([1, 2]);
  expect((await project.readEditList('founder-talk')).operations).toHaveLength(1);
});

describe('graphic dependencies beyond plain attributes (AM33)', () => {
  const scene = '<script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>';
  function reelWithFragment(fragment: string) {
    const dir = copyFixture('footage-project');
    const reel = join(dir, 'reels/founder-talk');
    mkdirSync(join(reel, 'clips/assets'), { recursive: true });
    for (const name of ['small.png', 'large.png', 'points.json', 'logo.svg']) writeFileSync(join(reel, 'clips/assets', name), `original ${name}`);
    writeFileSync(join(reel, 'clips/01-card.html'), fragment + scene);
    writeFileSync(join(reel, 'plan.json'), JSON.stringify({
      title: 'Graphic', duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }],
      clips: [{ id: '01', in: 0, out: 2, title: 'Product', kind: 'full', section: 'all', clip: 'clips/01-card.html' }],
      media: { schema: 1, sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [] }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['take'] },
    }));
    return { reel, project: openProject(dir) };
  }
  const save = async (project: ReturnType<typeof openProject>) => {
    await project.addOperation('founder-talk', { kind: 'placement-change', placement: 'take', changes: { gain: 0.5 } });
    return project.saveEdits('founder-talk');
  };

  it('freezes every srcset candidate and literal paths in inline scripts, and rewrites them to the frozen copies', async () => {
    const { reel, project } = reelWithFragment('<div data-el="product"><img srcset="assets/small.png 1x, assets/large.png 2x"></div><script>fetch("assets/points.json"); const logo = new Image(); logo.src = \'assets/logo.svg\';</script>');
    await save(project);
    const saved = JSON.parse(readFileSync(join(reel, 'v2/plan.json'), 'utf8'));
    const fragment = readFileSync(resolve(reel, 'v2', saved.clips[0].clip), 'utf8');
    const frozen = readdirSync(join(reel, 'v2/dependencies'));
    for (const name of ['small.png', 'large.png', 'points.json', 'logo.svg']) {
      const copy = frozen.find((file) => file.endsWith(name));
      expect(copy, name).toBeDefined();
      expect(readFileSync(join(reel, 'v2/dependencies', copy!), 'utf8')).toBe(`original ${name}`);
      expect(fragment).toContain(`dependencies/${copy}`);
    }
    expect(fragment).toMatch(/srcset="dependencies\/\S+small\.png 1x, dependencies\/\S+large\.png 2x"/);
  });

  it('refuses to save a graphic that builds a file path at runtime, since that file cannot be frozen', async () => {
    for (const script of ['fetch("assets/" + name + ".json")', 'import(`./${name}.js`)', 'img.src = base + "logo.svg"']) {
      const { project } = reelWithFragment(`<div data-el="product"></div><script>const name = "points", base = "assets/"; const img = new Image(); ${script};</script>`);
      await expect(save(project), script).rejects.toThrow('cannot be frozen');
      expect((await project.listVersions('founder-talk')).map((version) => version.number), script).toEqual([1]);
    }
  });
});
