import { spawnSync } from 'node:child_process';
import { createReadStream, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';
import { dragTimelineHandle, inspectGraphic, inspectPlacement, revealReelRail } from '../helpers/review-rail.ts';
import { invariants as laneChecks } from '../../web/src/review/_internal/NativeLanes.verify.ts';

/** Taps every connection to the speakers into one analyser, so tests read what the owner would hear. */
async function installMeter(page: Page) {
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    const root = window as unknown as { meter?: AnalyserNode; monitor?: AudioContext };
    AudioNode.prototype.connect = function(this: AudioNode, destination: AudioNode | AudioParam, output?: number, input?: number) {
      if (destination === this.context.destination) {
        if (!root.monitor) {
          root.monitor = new AudioContext();
          root.meter = root.monitor.createAnalyser();
          const silence = root.monitor.createGain(); silence.gain.value = 0;
          Reflect.apply(connect, root.meter, [silence]);
          Reflect.apply(connect, silence, [root.monitor.destination]);
          void root.monitor.resume();
        }
        const tap = (this.context as AudioContext).createMediaStreamDestination();
        Reflect.apply(connect, this, [tap]);
        Reflect.apply(connect, root.monitor.createMediaStreamSource(tap.stream), [root.meter]);
      }
      return Reflect.apply(connect, this, destination instanceof AudioParam ? [destination, output ?? 0] : [destination, output ?? 0, input ?? 0]);
    } as typeof connect;
  });
}

function meterLevel(page: Page) {
  return page.evaluate(() => {
    const meter = (window as unknown as { meter?: AnalyserNode }).meter;
    if (!meter) return 0;
    const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  });
}

it('previews legacy graphics in source time and saves a deliberate repair after native reordering', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-c:a', 'aac', join(dir, 'media/talk.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const plan = { title: 'Legacy ranges', video: '../media/talk.mp4', duration: 12, pieces: [{ in: 8, out: 10 }, { in: 10, out: 12 }], sections: [{ id: 'topic', name: 'Topic', start: 8, end: 12 }], clips: [{ id: '01', title: 'Card', clip: 'card.html', in: 9, out: 11, section: 'topic', kind: 'full' }] };
  writeFileSync(join(dir, 'motion/card.html'), '<div data-slot="world"><div data-el="card">Card</div></div><!--/world--><script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>');
  writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'transcript.json'), JSON.stringify({ words: [{ text: 'hello', start: 9, end: 9.5 }] }));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 4, sections: [{ id: 'topic', name: 'Topic', start: 0, end: 4 }], shots: [{ number: '01', title: 'Card', start: 1, duration: 2, section: 'topic' }] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><section data-scene="card" data-start="1" data-duration="2"><div data-el="card">Card</div></section><script>window.DURATION=4;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
    await page.getByLabel('Playhead', { exact: true }).fill('1.5');
    const frame = page.frameLocator('iframe[title="Authored graphics"]');
    await expect.poll(() => frame.locator('[data-scene="card"]').getAttribute('data-start')).toBe('1');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Pin', exact: true }).click();
    await page.getByRole('button', { name: 'Choose pin position' }).press('Enter');
    await page.getByLabel('Pin comment', { exact: true }).fill('Legacy frame');
    const pinned = page.waitForResponse((response) => response.url().endsWith('/comments') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    expect((await pinned).status()).toBe(201);
    await page.getByRole('button', { name: /^Pin word at 1.00 in legacy:/ }).click();
    await page.getByLabel('Pin comment', { exact: true }).fill('Legacy word');
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    await expect.poll(async () => (await server.project.listComments('founder-talk', 1)).length).toBe(2);
    expect((await server.project.listComments('founder-talk', 1)).map((c) => c.pin.time)).toEqual([1, 1.5]);
    const placements = await inspectPlacement(page, /^talk.mp4, main, 2.00/);
    await placements.getByRole('button', { name: 'Earlier' }).click();
    const graphics = await inspectGraphic(page);
    await graphics.getByText(/Card.*attachment is missing or interrupted/).waitFor();
    await revealReelRail(page);
    expect(await page.getByRole('region', { name: 'Continuous sections' }).getByRole('button').count()).toBe(2);
    await graphics.getByRole('button', { name: 'Trim to source 9.00–10.00s' }).click();
    await expect.poll(() => graphics.getByText(/attachment is missing or interrupted/).count()).toBe(0);
    await page.getByLabel('Playhead', { exact: true }).fill('3.75');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Pin', exact: true }).click();
    await page.getByRole('button', { name: 'Choose pin position' }).press('Enter');
    await page.getByLabel('Pin comment', { exact: true }).fill('Pending legacy frame');
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    await expect.poll(async () => (await server.project.listComments('founder-talk', 1)).length).toBe(3);
    expect((await server.project.listComments('founder-talk', 1)).find((c) => c.text === 'Pending legacy frame')?.pin.time).toBe(1.75);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    expect((await saved).status()).toBe(200);
    expect((await server.project.readVersion('founder-talk', 2)).shots[0]?.line).toEqual({ start: 3, end: 4 });
    expect((await server.project.listComments('founder-talk', 2)).map((c) => [c.text, c.pin.time, c.pin.sourceTime])).toEqual([['Legacy word', 3, 9], ['Legacy frame', 3.5, 9.5], ['Pending legacy frame', 3.75, 9.75]]);
    const frozenPicture = page.locator('video.mv-picture');
    await expect.poll(() => frozenPicture.getAttribute('src')).toContain('/media/founder-talk/2/');
    const original = readFileSync(join(dir, 'media/talk.mp4'));
    writeFileSync(join(dir, 'media/talk.mp4'), 'changed original');
    const frozen = await page.request.get(new URL((await frozenPicture.getAttribute('src'))!, server.url).href);
    expect(frozen.status()).toBe(200);
    expect(await frozen.body()).toEqual(original);
  } finally { await browser.close(); await server.close(); }
});

it('creates native frame and word pins on repeated placements and carries them through a split and Save', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=2', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const plan = { title: 'Native pins', duration: 4, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], clips: [], media: { schema: 1, sources: [{ id: 'a', name: 'Take', kind: 'video', path: '../../take.mp4', duration: 2, audio: false, words: [{ text: 'hello', start: 0.5, end: 0.8 }] }], placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 2 }, { id: 'repeat', role: 'main', source: 'a', in: 0, out: 2 }], sequence: ['first', 'repeat'] } };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...plan.media, sources: [{ ...plan.media.sources[0], path: '../../../take.mp4' }] } }));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 4, sections: plan.sections, shots: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><script>window.DURATION=4;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('3.5');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Pin', exact: true }).click();
    const target = page.getByRole('button', { name: 'Choose pin position' });
    const box = await target.boundingBox();
    await target.click({ position: { x: box!.width * 0.25, y: box!.height * 0.4 } });
    await expect.poll(() => page.getByRole('img', { name: 'Draft pin', exact: true }).count()).toBe(1);
    await page.getByLabel('Pin comment', { exact: true }).fill('Later frame');
    await page.screenshot({ path: join(dir, 'pin-draft.png'), fullPage: true });
    await page.route('**/comments', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test storage unavailable' }) }) : route.continue());
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    await page.getByText('Test storage unavailable', { exact: true }).waitFor();
    expect(await page.getByLabel('Pin comment', { exact: true }).inputValue()).toBe('Later frame');
    await page.unroute('**/comments');
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    await page.getByRole('button', { name: 'Pin word at 0.50 in first' }).click();
    await page.getByLabel('Pin comment', { exact: true }).fill('First word');
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    await page.getByRole('button', { name: 'Pin word at 2.50 in repeat' }).click();
    await page.getByLabel('Pin comment', { exact: true }).fill('Repeated word');
    await page.getByRole('button', { name: 'Save pin', exact: true }).click();
    await expect.poll(async () => (await server.project.listComments('founder-talk', 1)).length).toBe(3);
    const before = await server.project.listComments('founder-talk', 1);
    const framePin = before.find((c) => c.text === 'Later frame')?.pin;
    expect(framePin).toMatchObject({ placement: 'repeat', sourceTime: 1.5 });
    if (framePin?.kind !== 'frame') throw new Error('Expected the saved frame pin.');
    expect(framePin.x).toBeCloseTo(0.25, 2);
    expect(framePin.y).toBeCloseTo(0.4, 2);
    expect(before.filter((c) => c.pin.kind === 'word').map((c) => c.pin.placement)).toEqual(['first', 'repeat']);
    await page.getByRole('tab', { name: /^Comments/ }).click();
    await page.locator('li.c').filter({ hasText: 'Later frame' }).hover();
    await page.getByRole('button', { name: 'Delete comment 3', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await server.project.listComments('founder-talk', 1)).length).toBe(3);
    expect((await server.project.listComments('founder-talk', 1)).find((c) => c.text === 'Later frame')?.pin).toMatchObject({ placement: 'repeat', time: 3.5, sourceTime: 1.5 });
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('3');
    const placements = await inspectPlacement(page, /^Take, main, 2.00/);
    await placements.getByRole('button', { name: 'Split at playhead' }).click();
    await inspectPlacement(page, /^Take, main, 3.00/);
    await placements.getByRole('button', { name: 'Earlier' }).click();
    await inspectPlacement(page, /^Take, main, 0.00/);
    await placements.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('2.5');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Pin', exact: true }).click();
    await page.getByRole('button', { name: 'Choose pin position' }).press('Enter');
    await page.getByText('Save this new or changed moment as a version before pinning it.', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await inspectPlacement(page, /^Take, main, 0.00/);
    await placements.getByRole('button', { name: 'Remove', exact: true }).click();
    expect(await page.getByRole('region', { name: 'Graphics, speech and pins' }).getByRole('button', { name: /First word.*Moment removed/ }).isDisabled()).toBe(true);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await page.getByRole('region', { name: 'Graphics, speech and pins' }).getByRole('button', { name: /Later frame/ }).click();
    await expect.poll(() => page.getByLabel('Playhead', { exact: true }).inputValue()).toBe('2.50');
    await expect.poll(() => page.getByRole('img', { name: /^Comment 3$/ }).count()).toBe(1);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    expect((await saved).status()).toBe(200);
    const after = await server.project.listComments('founder-talk', 2);
    expect(after.map((c) => [c.text, c.pin.time, c.state])).toEqual([['First word', 0.5, undefined], ['Later frame', 2.5, undefined], ['Repeated word', 3.5, undefined]]);
    expect(after.map((c) => c.pin.section)).toEqual(['all', 'all', 'all']);
  } finally { await browser.close(); await server.close(); }
});

it('previews independent native caption positions, timing and duplicated speech before Save', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=2', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const plan = { title: 'Caption edits', duration: 5, captions: true, sections: [{ id: 'all', name: 'All', start: 0, end: 5 }], clips: [], media: { schema: 1, sources: [{ id: 'a', name: 'Take', kind: 'video', path: '../../take.mp4', duration: 2, audio: false, words: [{ text: 'hello', start: 0.2, end: 0.8 }] }], placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 2 }, { id: 'gap', role: 'gap', duration: 1 }, { id: 'repeat', role: 'main', source: 'a', in: 0, out: 2 }], sequence: ['first', 'gap', 'repeat'] } };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...plan.media, sources: [{ ...plan.media.sources[0], path: '../../../take.mp4' }] } }));
  const built = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [resolve('skill/kinotta/engine/build.py'), '--plan', join(reel, 'v1/plan.json'), join(reel, 'v1/index.html')], { encoding: 'utf8' });
  expect(built.status, built.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('0.3');
    const handle = page.getByRole('button', { name: /^Move captions/ });
    await handle.press('Alt+ArrowRight');
    const frame = page.frameLocator('iframe[title="Authored graphics"]');
    await expect.poll(() => frame.locator('[data-caption][data-placement="first"] .caption').evaluate((el) => (el as HTMLElement).style.translate)).toBe('10px');
    expect(await frame.locator('[data-caption][data-placement="repeat"] .caption').evaluate((el) => (el as HTMLElement).style.translate)).toBe('0px');
    await dragTimelineHandle(page, 'Word start at 0.20 in first', 0.2);
    await expect.poll(() => frame.locator('[data-caption][data-placement="first"]').getAttribute('data-start')).toBe('0.4');
    await expect.poll(() => frame.locator('[data-caption][data-placement="first"] [data-t]').getAttribute('data-t')).toBe('0.4');
    await expect.poll(() => frame.locator('[data-caption][data-placement="first"]').getAttribute('data-source-start')).toBe('0.4');
    await expect.poll(() => frame.locator('[data-caption][data-placement="first"] .caption').evaluate((el) => (el as HTMLElement).style.translate)).toBe('10px');
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(() => frame.locator('[data-caption][data-placement="first"]').getAttribute('data-start')).toBe('0.2');
    const placement = await inspectPlacement(page, /^Take, main, 0.00/);
    await placement.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect.poll(() => frame.locator('[data-caption]').count()).toBe(3);
    expect(Number(await page.locator('[data-word$=":2.2"]').getAttribute('data-source-end'))).toBeCloseTo(0.8);
    await page.getByLabel('Playhead', { exact: true }).fill('2.3');
    await expect.poll(() => frame.locator('[data-caption].active').textContent()).toBe('hello');
    await page.getByLabel('Playhead', { exact: true }).fill('4.5');
    await expect.poll(() => frame.locator('[data-caption].active').count()).toBe(0);
    await page.getByLabel('Playhead', { exact: true }).fill('0.3');
    await page.screenshot({ path: join(dir, 'caption-editor.png'), fullPage: true });
    await page.getByRole('region', { name: 'Graphics, speech and pins' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(dir, 'caption-controls.png'), fullPage: true });
    console.info('Caption editor screenshot:', join(dir, 'caption-editor.png'));
    await page.getByRole('tab', { name: /^Edits/ }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    expect((await saved).status()).toBe(200);
    expect(readFileSync(join(reel, 'v2/index.html'), 'utf8').match(/data-caption /g)).toHaveLength(3);
  } finally { await browser.close(); await server.close(); }
});

it('flags an interrupted graphic in the editor and repairs it with an explicit trim or new footage range', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  mkdirSync(join(reel, 'clips'), { recursive: true });
  const fragment = '<div data-slot="world"><div data-el="card">Card</div></div><!--/world--><script>M.scene({W:1920,H:1080,T:2,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>';
  writeFileSync(join(reel, 'clips/01-card.html'), fragment);
  const plan = { title: 'Graphic repair', duration: 4, sections: [{ id: 'topic', name: 'Topic', placement: 'take', start: 0, end: 4 }], clips: [{ id: '01', title: 'Card', in: 1, out: 3, placement: 'take', section: 'topic', kind: 'full', clip: 'clips/01-card.html' }], media: {
    schema: 1, sources: [{ id: 'a', kind: 'video', path: '../../take.mp4', duration: 4, audio: false }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 4 }], sequence: ['take'],
  } };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...plan.media, sources: [{ ...plan.media.sources[0], path: '../../../take.mp4' }] } }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><section data-scene="01-card" data-start="1" data-duration="2"><div data-el="card">Card</div></section><script>window.DURATION=4;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Split at playhead', exact: true }).click();
    const lanes = page.getByRole('region', { name: 'Media timeline' });
    await expect.poll(() => lanes.locator('[data-role="main"] [data-placement]').count()).toBe(2);
    await page.getByRole('button', { name: 'Insert gap', exact: true }).click();
    const gap = await inspectPlacement(page, /^Gap/);
    await gap.getByRole('button', { name: 'Earlier' }).click();
    const graphics = await inspectGraphic(page);
    await graphics.getByText(/Card.*attachment is missing or interrupted/).waitFor();
    await revealReelRail(page);
    expect(await page.getByRole('region', { name: 'Continuous sections' }).getByRole('button').count()).toBe(2);
    await graphics.getByRole('button', { name: 'Split into surviving parts' }).click();
    await expect.poll(() => page.locator('[data-graphic]').count()).toBe(2);
    await page.getByLabel('Playhead', { exact: true }).fill('3.5');
    await expect.poll(() => page.frameLocator('iframe[title="Authored graphics"]').locator('[data-scene="01-card"]').getAttribute('data-start')).toBe('3');
    await expect.poll(() => page.frameLocator('iframe[title="Authored graphics"]').locator('[data-scene="01-card"]').getAttribute('data-duration')).toBe('1');
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await inspectGraphic(page);
    await graphics.getByText(/attachment is missing or interrupted/).waitFor();
    await graphics.getByRole('button', { name: 'Trim to source 1.00–2.00s' }).click();
    await expect.poll(() => graphics.getByText(/attachment is missing or interrupted/).count()).toBe(0);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await inspectGraphic(page);
    await graphics.getByText(/attachment is missing or interrupted/).waitFor();
    await page.getByLabel('Playhead', { exact: true }).fill('3.5');
    await graphics.getByRole('button', { name: 'Attach at playhead' }).click();
    await expect.poll(() => graphics.getByText(/attachment is missing or interrupted/).count()).toBe(0);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    const response = await saved;
    expect(response.status(), await response.text()).toBe(200);
    const shots = JSON.parse(readFileSync(join(reel, 'v2/shots.json'), 'utf8'));
    expect(shots.sections.map((s: { start: number; end: number }) => [s.start, s.end])).toEqual([[0, 2], [3, 5]]);
    expect(shots.shots[0].line).toEqual({ start: 3.5, end: 5 });
  } finally { await browser.close(); await server.close(); }
});

it('attaches added media to footage, follows reorder and repairs a removed moment explicitly', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [{ id: 'video', kind: 'video', path: `${prefix}take.mp4`, duration: 4, audio: false }], placements: [
    { id: 'first', role: 'main', source: 'video', in: 0, out: 4 }, { id: 'repeat', role: 'main', source: 'video', in: 0, out: 2 },
    { id: 'product', role: 'insert', source: 'video', in: 0, out: 1, at: 1 },
  ], sequence: ['first', 'repeat'] });
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 6, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Attachments', duration: 6, sections: [{ id: 'all', name: 'All', start: 0, end: 6 }], media: media('../../'), clips: [] }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const placements = await inspectPlacement(page, /^take.mp4, insert/);
    const product = page.getByRole('region', { name: 'Media timeline' }).locator('[data-role="insert"] [data-placement="product"]');
    await page.getByLabel('Playhead', { exact: true }).fill('2.5');
    await placements.getByRole('button', { name: 'Follow footage at playhead' }).click();
    await expect.poll(() => product.getAttribute('aria-label')).toMatch(/2\.50 to 3\.50/);
    await inspectPlacement(page, /^take.mp4, main, 4\.00/);
    await placements.getByRole('button', { name: 'Earlier' }).click();
    await expect.poll(() => product.getAttribute('aria-label')).toMatch(/4\.50 to 5\.50/);
    await inspectPlacement(page, /^take.mp4, main, 2\.00/);
    await placements.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect.poll(() => product.getAttribute('data-verify-broken-placement')).toBe('true');
    const lanes = page.getByRole('region', { name: 'Media timeline' });
    const repairChecks = await lanes.evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), laneChecks.map((check) => check.check.toString()));
    expect(repairChecks).toEqual(laneChecks.map(() => true));
    const lostMarker = await lanes.evaluate((root, checks) => { const copy = root.cloneNode(true) as Element; (copy.querySelector('[data-verify-broken-placement="true"]') as HTMLElement).style.width = '0%'; return checks.map((check) => Boolean((0, eval)(`(${check})`)(copy))); }, laneChecks.map((check) => check.check.toString()));
    expect(lostMarker.filter((pass) => !pass)).toHaveLength(1);
    await inspectPlacement(page, /^take.mp4, insert/);
    await placements.getByText(/Footage moment removed/).waitFor();
    await expect(server.project.saveEdits('founder-talk')).rejects.toThrow('attachment');
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await inspectPlacement(page, /^take.mp4, insert/);
    await expect.poll(() => placements.getByText(/Footage moment removed/).count()).toBe(0);
    await placements.getByRole('button', { name: 'Stay at time', exact: true }).click();
    await expect.poll(() => placements.getByText('Stays at reel time', { exact: true }).count()).toBe(1);
    await inspectPlacement(page, /^take.mp4, main, 2\.00/);
    await placements.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect.poll(() => page.locator('[data-role="main"] [data-placement]').count()).toBe(1);
    await product.press('Enter');
    expect(await placements.getByText(/Footage moment removed/).count()).toBe(0);
    await page.getByLabel('Playhead', { exact: true }).fill('1');
    await placements.getByRole('button', { name: 'Follow footage at playhead' }).click();
    await expect.poll(() => product.getAttribute('aria-label')).toMatch(/1\.00 to 2\.00/);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    const response = await saved;
    expect(response.status(), await response.text()).toBe(200);
    const plan = JSON.parse(readFileSync(join(reel, 'v2/plan.json'), 'utf8'));
    expect(plan.media.placements.find((p: { id: string }) => p.id === 'product').attachment).toEqual({ placement: 'repeat', time: 1 });
  } finally { await browser.close(); await server.close(); }
});

it('changes picture framing independently, previews it and retains it through Undo, reopening and Save', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=90x180,drawbox=x=0:y=0:w=90:h=60:color=red:t=fill,drawbox=x=0:y=120:w=90:h=60:color=blue:t=fill', '-frames:v', '1', join(dir, 'portrait.png')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [{ id: 'photo', name: 'Portrait', kind: 'image', path: `${prefix}portrait.png`, duration: 0 }], placements: ['first', 'second'].map((id) => ({ id, role: 'main', source: 'photo', in: 0, out: 0, duration: 2 })), sequence: ['first', 'second'] });
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Framing', duration: 4, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], media: media('../../'), clips: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><style>html,body{margin:0;background:transparent;width:160px;height:90px}</style><script>window.DURATION=4;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const review = async () => {
      await page.goto(server.url);
      await revealReelRail(page);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
      await page.getByRole('button', { name: 'Review', exact: true }).click();
    };
    await review();
    const picture = page.locator('.mv-picture');
    const style = () => picture.evaluate((el) => ({ fit: getComputedStyle(el).objectFit, position: getComputedStyle(el).objectPosition }));
    await expect.poll(style).toEqual({ fit: 'cover', position: '50% 50%' });
    await inspectPlacement(page, /^Portrait, main, 2.00/);
    await page.getByLabel('Framing for second', { exact: true }).selectOption('fit');
    await page.getByLabel('Playhead', { exact: true }).fill('2.5');
    await expect.poll(style).toEqual({ fit: 'contain', position: '50% 50%' });
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(style).toEqual({ fit: 'cover', position: '50% 50%' });
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(style).toEqual({ fit: 'contain', position: '50% 50%' });
    await inspectPlacement(page, /^Portrait, main, 2.00/);
    await page.getByLabel('Framing for second', { exact: true }).selectOption('crop');
    await expect.poll(style).toEqual({ fit: 'cover', position: '50% 50%' });
    await page.getByLabel('Vertical framing for second', { exact: true }).fill('0');
    await page.getByLabel('Vertical framing for second', { exact: true }).press('Tab');
    await expect.poll(style).toEqual({ fit: 'cover', position: '50% 0%' });
    // Inspect actual painted pixels, including the CSS crop, rather than only the declared style.
    const screenshot = join(dir, 'framing-preview.png');
    await page.locator('.rv-frame').screenshot({ path: screenshot });
    await page.screenshot({ path: join(dir, 'framing-editor.png'), fullPage: true });
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', screenshot, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    expect(decoded.status, decoded.stderr.toString()).toBe(0);
    expect(decoded.stdout[0]).toBeGreaterThan(240);
    expect(decoded.stdout[1]).toBeLessThan(15);
    await review();
    await page.getByLabel('Playhead', { exact: true }).fill('2.5');
    await expect.poll(style).toEqual({ fit: 'cover', position: '50% 0%' });
    await page.getByLabel('Playhead', { exact: true }).fill('0.5');
    await expect.poll(style).toEqual({ fit: 'cover', position: '50% 50%' });
    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    const response = await saved;
    expect(response.status(), await response.text()).toBe(200);
    const plan = JSON.parse(readFileSync(join(reel, 'v2/plan.json'), 'utf8'));
    expect(plan.media.placements[1].framing).toEqual({ mode: 'crop', y: 0 });
    expect(plan.media.placements[0]).not.toHaveProperty('framing');
  } finally { await browser.close(); await server.close(); }
});

it('plays saved track gain and mute through the actual browser speaker mix', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', join(dir, 'tone.wav')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><style>html{background:transparent}</style><script>window.DURATION=4;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await installMeter(page);
    let fullLevel = 0;
    for (const [gain, mute] of [[1, false], [0.5, false], [1, true]] as const) {
      const media = { schema: 1, tracks: [{ id: 'music', name: 'Music', order: 0, gain, mute }], sources: [{ id: 'sound', kind: 'audio', path: '../../../tone.wav', duration: 4 }], placements: [{ id: 'sound-use', role: 'audio', source: 'sound', track: 'music', at: 0, in: 0, out: 4 }], sequence: [] };
      writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, media, clips: [] }));
      writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 4, media: { ...media, sources: [{ ...media.sources[0], path: '../../tone.wav' }] }, clips: [] }));
      await page.goto(server.url);
      await revealReelRail(page);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
      await page.getByRole('button', { name: 'Review', exact: true }).click();
      await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-verify-unit="MediaEditor"]')?.getAttribute('data-verify-playing') === 'true');
      if (mute) await expect.poll(() => meterLevel(page)).toBeLessThan(0.001);
      else if (gain === 1) {
        await expect.poll(() => meterLevel(page)).toBeGreaterThan(0.08);
        fullLevel = await meterLevel(page);
      } else await expect.poll(() => meterLevel(page)).toBeCloseTo(fullLevel * gain, 2);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    }
  } finally { await browser.close(); await server.close(); }
});

it('auditions an unsaved volume change, restores playback after seeking and stops sound on pause', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', join(dir, 'tone.wav')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = { schema: 1, sources: [{ id: 'sound', kind: 'audio', path: '../../../tone.wav', duration: 4 }], placements: [{ id: 'sound-use', role: 'audio', source: 'sound', at: 0, in: 0, out: 4 }], sequence: [] };
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, media, clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Audition', duration: 4, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], media: { ...media, sources: [{ ...media.sources[0], path: '../../tone.wav' }] }, clips: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><style>html{background:transparent}</style><script>window.DURATION=4;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await installMeter(page);
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const editor = page.locator('[data-verify-unit="MediaEditor"]');
    await editor.waitFor();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-verify-unit="MediaEditor"]')?.getAttribute('data-verify-playing') === 'true');
    const rms = () => meterLevel(page);
    // The full test tone is about 0.088 RMS. Wait for its startup to settle before measuring a relative gain.
    await expect.poll(rms).toBeGreaterThan(0.08);
    const loud = await rms();
    expect(loud).toBeGreaterThan(0.04);
    await inspectPlacement(page, /^tone.wav, audio,/);
    await page.getByLabel('Volume for sound-use').fill('0.5');
    await page.getByLabel('Volume for sound-use').press('Tab');
    await expect.poll(rms).toBeCloseTo(loud / 2, 2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(rms).toBeLessThan(0.001);
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(rms).toBeCloseTo(loud / 2, 2);
    expect((await server.project.readEditList('founder-talk')).operations).toHaveLength(1);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('tab', { name: /^Edits/ }).click();
    const saveResponse = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    const response = await saveResponse;
    expect(response.status(), await response.text()).toBe(200);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v2/ }).waitFor();
    const saved = await server.project.readVersion('founder-talk', 2);
    expect(saved.media!.placements[0]).toMatchObject({ gain: 0.5 });
    await page.screenshot({ path: join(dir, 'media-review-desktop.png') });
  } finally { await browser.close(); await server.close(); }
});

it('imports reusable sound in a legacy reel and saves it using the agent plan folder', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'music.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', file], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Media rail', exact: true }).click();
    await page.getByLabel('Import media', { exact: true }).setInputFiles(file);
    await page.getByLabel('Search media', { exact: true }).fill('music');
    await page.getByRole('region', { name: 'Project media library' }).getByRole('tab', { name: 'Audio', exact: true }).click();
    await page.getByRole('button', { name: /^Add music.wav at playhead$/ }).first().click();
    const response = page.waitForResponse((item) => item.url().endsWith('/save'));
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    const savedResponse = await response;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v2/ }).waitFor();
    const saved = await server.project.readVersion('founder-talk', 2);
    const sound = saved.media!.sources.find((source) => source.kind === 'audio')!;
    expect(readFileSync(resolve(dir, 'reels/founder-talk/v2', sound.path))).toEqual(readFileSync(file));
    expect((await server.project.listMedia()).length).toBe(1);
    expect(saved.media!.placements.some((placement) => placement.role === 'audio' && placement.source === sound.id)).toBe(true);
  } finally { await browser.close(); await server.close(); }
});

it('keeps preview controls truthful through Undo, Solo removal, silent pictures and sound-only stretches', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  for (const [file, args] of [['tone.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4']], ['other.wav', ['-f', 'lavfi', '-i', 'sine=frequency=880:duration=4']], ['still.png', ['-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1']]] as const) {
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, join(dir, file)], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
  }
  const reel = join(dir, 'reels/founder-talk');
  const sources = [
    { id: 'sound', name: 'Tone', kind: 'audio', path: 'tone.wav', duration: 4, words: [{ text: 'hello', start: 0.5, end: 0.9 }] },
    { id: 'other', name: 'Other tone', kind: 'audio', path: 'other.wav', duration: 4 },
    { id: 'still', name: 'Still', kind: 'image', path: 'still.png', duration: 0, audio: false },
  ];
  const placements = [
    { id: 'sound-use', role: 'audio', source: 'sound', track: 'voice', at: 0, in: 0, out: 4, speech: true },
    { id: 'other-use', role: 'audio', source: 'other', track: 'other', at: 0, in: 0, out: 4 },
    { id: 'still-use', role: 'insert', source: 'still', at: 3, in: 0, out: 0, duration: 1 },
  ];
  const media = (prefix: string) => ({ schema: 1, tracks: [{ id: 'voice', name: 'Voice', order: 0, gain: 1, mute: false }, { id: 'other', name: 'Other', order: 1, gain: 1, mute: false }], sources: sources.map((s) => ({ ...s, path: prefix + s.path })), placements, sequence: [] });
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Truthful', duration: 4, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], media: media('../../'), clips: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><style>html{background:transparent}</style><script>window.DURATION=4;window.seek=()=>{};</script>');
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 4, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], shots: [] }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await installMeter(page);
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.locator('[data-verify-unit="MediaEditor"]').waitFor();

    // F3: no authored graphics and no picture at the playhead.
    await expect.poll(() => page.getByText('Sound only. No picture or graphics at this point.').count()).toBe(1);

    // F4: a picture has no sound to adjust.
    const still = await inspectPlacement(page, /^Still, insert,/);
    expect(await still.getByLabel('Volume for still-use').count()).toBe(0);
    expect(await still.getByLabel('Solo still-use').count()).toBe(0);
    expect(await still.getByText('Mute').count()).toBe(0);
    await inspectPlacement(page, /^Tone, audio,/);
    expect(await page.getByLabel('Volume for sound-use').count()).toBe(1);

    // F1: Undo restores the word shown in the input.
    await page.getByRole('button', { name: 'Edit word hello at 0.50 in sound-use' }).click();
    const word = page.getByLabel('Word at 0.50 in sound-use', { exact: true });
    await word.fill('howdy');
    await word.press('Tab');
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length).toBe(1);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length).toBe(0);
    await page.getByRole('button', { name: 'Edit word hello at 0.50 in sound-use' }).click();
    expect(await word.inputValue()).toBe('hello');
    await word.press('Escape');

    // F2: removing an emptied Solo owner does not silence the rest of the reel.
    expect(await page.getByRole('button', { name: 'Remove Other track', exact: true }).isDisabled()).toBe(true);
    await page.getByRole('button', { name: 'Solo Other', exact: true }).click();
    const other = await inspectPlacement(page, /^Other tone, audio,/);
    await other.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect.poll(() => page.locator('[data-placement="other-use"]').count()).toBe(0);
    await page.getByRole('button', { name: 'Remove Other track', exact: true }).click();
    await expect.poll(() => page.locator('[data-track="other"]').count()).toBe(0);
    expect(await page.getByText('Solo is for preview').count()).toBe(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => meterLevel(page)).toBeGreaterThan(0.04);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  } finally { await browser.close(); await server.close(); }
});

it('transcribes speech when a source is first used, shows a failure with retry, then shows its words', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const tone = join(dir, 'tone.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', tone], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  let calls = 0;
  let release = (): void => undefined;
  const transcriber = async () => {
    calls += 1;
    if (calls === 1) throw new Error('The speech model is not installed.');
    await new Promise<void>((done) => { release = done; });
    return [{ text: 'hello', start: 0.2, end: 0.5 }];
  };
  const server = await startServer({ projectDir: dir, port: 0, transcriber });
  const entry = await server.project.importMedia('Tone.wav', createReadStream(tone));
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [{ id: entry.id, name: 'Tone', kind: 'audio', path: prefix + entry.path, duration: 2, contentHash: entry.contentHash }], placements: [{ id: 'first', role: 'audio', source: entry.id, at: 0, in: 0, out: 2, speech: true }], sequence: [] });
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 2, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Speech', duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], media: media('../../'), clips: [] }));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const retry = page.getByRole('button', { name: 'Retry speech for first', exact: true });
    await retry.waitFor();
    expect(await retry.getAttribute('title')).toBe('The speech model is not installed.');
    await page.getByText('Speech in this span could not be transcribed. Retry speech on the clip.', { exact: true }).waitFor();
    await retry.click();
    await page.getByText('Transcribing speech…', { exact: false }).waitFor();
    expect(await page.getByRole('button', { name: 'Edit word hello at 0.20 in first', exact: true }).count()).toBe(0);
    release();
    await expect.poll(() => page.getByRole('button', { name: 'Edit word hello at 0.20 in first', exact: true }).count(), { timeout: 10_000 }).toBe(1);
    expect(await page.getByText('Transcribing speech…', { exact: false }).count()).toBe(0);
    expect(await page.locator('.editor-frame-error').count()).toBe(0);
    expect(calls).toBe(2);
  } finally { await browser.close(); await server.close(); }
});

it('imports by drop, retries a failed import, previews, adds a project file in place and relinks it after it moves', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  // Imports come from outside the project, so they are not also listed as project files.
  const outside = emptyProject();
  mkdirSync(join(dir, 'sounds'), { recursive: true });
  for (const [file, frequency] of [[join(outside, 'tone.wav'), 440], [join(dir, 'sounds/bell.wav'), 880]] as const) {
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=1`, file], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
  }
  const broken = join(outside, 'broken.wav');
  writeFileSync(broken, 'this is not sound');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  const openEditor = async (page: Page) => {
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Media rail', exact: true }).click();
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await openEditor(page);
    const library = page.getByRole('region', { name: 'Project media library' });

    let attempts = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().includes('/api/media?name=broken.wav')) attempts += 1; });
    await page.getByLabel('Import media', { exact: true }).setInputFiles(broken);
    await library.getByRole('alert').filter({ hasText: 'broken.wav:' }).waitFor();
    await library.getByRole('button', { name: 'Retry import', exact: true }).click();
    await expect.poll(() => attempts).toBe(2);
    await library.getByRole('alert').filter({ hasText: 'broken.wav:' }).waitFor();
    expect((await server.project.listMedia()).some((entry) => entry.name === 'broken.wav')).toBe(false);

    const bytes = readFileSync(join(outside, 'tone.wav')).toString('base64');
    const transfer = await page.evaluateHandle((data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' }));
      return transfer;
    }, bytes);
    await library.dispatchEvent('dragover', { dataTransfer: transfer });
    await library.dispatchEvent('drop', { dataTransfer: transfer });
    await library.getByRole('button', { name: /^Preview .*tone\.wav$/ }).waitFor();
    expect(await library.getByRole('alert').count()).toBe(0);

    await library.getByRole('button', { name: /^Preview .*tone\.wav$/ }).click();
    const preview = page.getByLabel('Preview of tone.wav');
    await preview.waitFor();
    await expect.poll(() => preview.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);

    const bell = library.locator('[data-media-path="sounds/bell.wav"]');
    await bell.getByRole('button', { name: 'Preview sounds/bell.wav', exact: true }).click();
    await page.getByLabel('Preview of bell.wav').waitFor();
    expect(await bell.count()).toBe(1);
    expect((await server.project.listMedia()).find((entry) => entry.name === 'bell.wav')!.path).toBe('sounds/bell.wav');

    mkdirSync(join(dir, 'sounds/moved'));
    // Release the file held by the media element before moving it on Windows.
    await page.goto('about:blank');
    renameSync(join(dir, 'sounds/bell.wav'), join(dir, 'sounds/moved/bell.wav'));
    await openEditor(page);
    await bell.getByText('File missing', { exact: true }).waitFor();
    await bell.getByLabel('Relink sounds/bell.wav').selectOption('sounds/moved/bell.wav');
    await bell.getByRole('button', { name: 'Relink', exact: true }).click();
    await library.getByRole('button', { name: 'Preview sounds/moved/bell.wav', exact: true }).waitFor();
    await expect.poll(() => library.getByText('File missing', { exact: true }).count()).toBe(0);
    expect((await server.project.listMedia()).find((entry) => entry.name === 'bell.wav')!.path).toBe('sounds/moved/bell.wav');
  } finally { await browser.close(); await server.close(); }
});

it('splits, moves with optional snapping, trims, reorders, duplicates and replaces placements from the keyboard and controls', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const outside = emptyProject();
  for (const [file, frequency] of [[join(dir, 'tone.wav'), 440], [join(outside, 'alt.wav'), 660]] as const) {
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=4`, file], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
  }
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [{ id: 'tone', name: 'Tone', kind: 'audio', path: `${prefix}tone.wav`, duration: 4 }], placements: [{ id: 'bed', role: 'audio', source: 'tone', at: 0, in: 0, out: 4 }, { id: 'one', role: 'gap', duration: 1 }, { id: 'two', role: 'gap', duration: 2 }], sequence: ['one', 'two'] });
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 3, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Keys', duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], media: media('../../'), clips: [] }));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], shots: [] }));
  const server = await startServer({ projectDir: dir, port: 0 });
  await server.project.importMedia('alt.wav', createReadStream(join(outside, 'alt.wav')));
  const browser = await chromium.launch();
  const last = async () => (await server.project.readEditList('founder-talk')).operations.at(-1)!;
  const count = async () => (await server.project.readEditList('founder-talk')).operations.length;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const placements = page.getByRole('region', { name: 'Media timeline' });
    const bed = placements.getByRole('button', { name: /^Tone, audio, 0\.00 to/ });
    const seek = async (to: string) => { await page.getByLabel('Playhead', { exact: true }).fill(to); };

    await seek('1.5');
    await bed.focus();
    await page.keyboard.press('Control+k');
    await expect.poll(async () => (await last()).kind).toBe('placement-split');
    expect(await last()).toMatchObject({ placement: 'bed', at: 1.5 });
    await expect.poll(() => placements.getByRole('button', { name: /^Tone, audio/ }).count()).toBe(2);
    await bed.press('Control+z');
    await expect.poll(count).toBe(0);

    await seek('0.25');
    await bed.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await last()).kind === 'placement-change' && (await last() as { changes: { at?: number } }).changes.at).toBe(0.1);
    await placements.getByRole('button', { name: /^Tone, audio, 0\.10 to/ }).focus();
    await page.keyboard.press('ArrowRight');
    // 0.2 lands within reach of the playhead at 0.25, so it stops there.
    await expect.poll(async () => (await last() as { changes: { at?: number } }).changes.at).toBe(0.25);
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Snap', exact: true }).click();
    await placements.getByRole('button', { name: /^Tone, audio, 0\.25 to/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await last() as { changes: { at?: number } }).changes.at).toBe(0.35);

    await seek('2');
    await placements.getByRole('button', { name: /^Tone, audio, 0\.35 to/ }).focus();
    await page.keyboard.press(']');
    await expect.poll(async () => (await last() as { changes: unknown }).changes).toEqual({ out: 1.65, duration: 1.65 });

    await placements.getByRole('button', { name: /^Gap, gap, 1\.00 to 3\.00/ }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await last()).kind).toBe('placement-move');
    expect(await last()).toMatchObject({ placement: 'two', index: 0 });

    const clip = await inspectPlacement(page, /^Tone, audio/);
    await clip.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect.poll(async () => (await last()).kind).toBe('placement-add');
    expect(await last()).toMatchObject({ placement: { role: 'audio', source: 'tone', at: 2 } });

    await inspectPlacement(page, /^Tone, audio/);
    await clip.getByLabel('Replace Tone').selectOption({ label: 'alt.wav' });
    await clip.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => (await last()).kind).toBe('placement-replace');
    expect(await last()).toMatchObject({ target: 'bed', placement: { role: 'audio', in: 0, at: 0.35 } });
    await placements.getByRole('button', { name: /^alt\.wav, audio/ }).waitFor();
  } finally { await browser.close(); await server.close(); }
});
