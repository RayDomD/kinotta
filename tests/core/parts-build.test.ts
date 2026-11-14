import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assembleParts, openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { partsFixture, partsInputs } from '../helpers/parts.ts';

const cli = promisify(execFile);
const LAUNCHER = resolve('bin/kinotta.mjs');
const CLI_TIMEOUT_MS = 30_000;
function nextRevision(reelDir: string, name: string, css?: string) {
  const folder = join(reelDir, 'shots', name, 'r2');
  mkdirSync(folder);
  for (const file of ['shot.html', 'shot.css', 'shot.js']) {
    const original = readFileSync(join(reelDir, 'shots', name, 'r1', file), 'utf8');
    writeFileSync(join(folder, file), file === 'shot.html' ? original.replace(`>${name}<`, '>A clearer proof<') : file === 'shot.css' && css ? css : original);
  }
}

describe('publishing parts', () => {
  it('preserves an Undo of a frozen owner offset when the agent builds the next parts version', async () => {
    const { dir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'element-offset', clip: 'hook', element: 'label', x: 10, y: 0, scale: 1 });
    await project.freezeEdits('parts');
    await project.undoEdit('parts');
    await project.buildParts('parts', 'Codex');
    expect(await project.workingPartsPage('parts')).not.toContain('translate: 10px');
  });
  it('serves exact Working parts timing and offsets without changing the frozen page', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      await server.project.buildParts('parts');
      const before = readFileSync(join(reelDir, 'v1/index.html'));
      await server.project.addOperation('parts', { kind: 'clip-trim', clip: 'hook', in: 0, out: 0.5 });
      await server.project.addOperation('parts', { kind: 'element-offset', clip: 'proof', element: 'label', x: 10, y: 0, scale: 1 });
      const working = await server.project.readWorkingVersion('parts');
      expect(working.workingParts?.shots.map((shot) => shot.start)).toEqual([0, 0.5, 1.5]);
      const response = await fetch(`${server.url}/reels/parts/working/index.html`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('data-start="0.5"');
      expect(html).toContain('translate: 10px');
      expect(readFileSync(join(reelDir, 'v1/index.html'))).toEqual(before);
    } finally { await server.close(); }
  });
  it('freezes Working timing into a parts manifest with computed starts and no new shot folders', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'clip-trim', clip: 'hook', in: 0, out: 0.5 });
    const saved = await project.freezeEdits('parts');
    const frozen = await project.readVersion('parts', saved.version);
    expect(frozen.issues).toEqual([]);
    expect(frozen.shots.map((shot) => [shot.start, shot.duration])).toEqual([[0, 0.5], [0.5, 1], [1.5, 1]]);
    const file = JSON.parse(readFileSync(join(reelDir, `v${saved.version}/shots.json`), 'utf8'));
    expect(file.shots.every((shot: { start?: number }) => shot.start === undefined)).toBe(true);
    expect(readdirSync(join(reelDir, 'shots/hook'))).toEqual(['r1']);
  });
  it('detects tampering with a published immutable revision and refuses to reuse it in a build', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    writeFileSync(join(reelDir, 'shots/hook/r1/shot.css'), '[data-scene="hook"] { color: red; }');
    expect((await project.readVersion('parts', 1)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'parts-files', message: expect.stringContaining('changed') })]));
    await expect(project.buildParts('parts')).rejects.toThrow('changed');
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
  });
  it('reports a missing immutable revision through check and refuses a Final render', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    rmSync(join(reelDir, 'shots/proof/r1/shot.js'));
    expect((await project.readVersion('parts', 1)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'parts-files', message: expect.stringContaining('shots/proof/r1/shot.js') })]));
    await expect(project.render({ reel: 'parts', version: 1, preset: 'final' })).rejects.toThrow('shots/proof/r1/shot.js');
    const checked = await cli(process.execPath, [LAUNCHER, 'check', 'parts', '--project', dir], { encoding: 'utf8', timeout: CLI_TIMEOUT_MS }).catch((error) => error);
    expect(checked.stdout).toContain('shots/proof/r1/shot.js');
  });

  it('refuses a referenced missing asset before publishing a parts version', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    writeFileSync(join(reelDir, 'shots/hook/r1/shot.html'), '<section data-scene="hook"><img data-el="label" src="assets/missing.svg"></section>');
    await expect(openProject(dir).buildParts('parts')).rejects.toThrow('assets/missing.svg');
    expect(existsSync(join(reelDir, 'v1'))).toBe(false);
  });
  it('changes only shot 04 of twelve, writing one revision and one version without copying the other eleven', async () => {
    const { dir, reelDir, manifest } = partsFixture(12);
    writeFileSync(join(reelDir, 'v1', 'index.html'), assembleParts(manifest, partsInputs(reelDir, manifest)));
    const files = manifest.shots.flatMap((shot) => ['shot.html', 'shot.css', 'shot.js'].map((file) => join(reelDir, 'shots', shot.name, shot.revision, file)));
    files.push(join(reelDir, 'shared/r1/shared.css'), join(reelDir, 'v1/shots.json'), join(reelDir, 'v1/index.html'));
    const before = files.map((file) => readFileSync(file));
    nextRevision(reelDir, 'shot-04');
    manifest.shots[3].revision = 'r2';
    manifest.shots[3].title = 'A clearer proof';
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    const project = openProject(dir);
    expect(await project.buildParts('parts', 'Codex')).toEqual({ version: 2, issues: [] });
    for (const [index, file] of files.entries()) expect(readFileSync(file), file).toEqual(before[index]);
    expect(manifest.shots.flatMap((shot) => readdirSync(join(reelDir, 'shots', shot.name)))).toHaveLength(13);
    expect(readdirSync(join(reelDir, 'v2')).sort()).toEqual(['authored-shots.json', 'index.html', 'shots.json']);
    expect((await project.readVersion('parts', 2)).builtBy).toBe('Codex');
    expect((await project.readVersion('parts', 2)).parts?.shots[3].revision).toBe('r2');
    expect(readFileSync(join(reelDir, 'v2/index.html'), 'utf8')).toContain('A clearer proof');
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
  });

  it('retains frozen element offsets and the one sound mix across a parts rebuild', async () => {
    const { dir, reelDir } = partsFixture();
    const tone = join(reelDir, 'v1/tone.wav');
    const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', tone], { encoding: 'utf8' });
    expect(made.status, made.stderr).toBe(0);
    const sound = readFileSync(tone);
    writeFileSync(join(reelDir, 'v1/kinotta-edits.css'), '[data-scene="hook"] [data-el="label"] { translate: 10px 0px; }');
    writeFileSync(join(reelDir, 'v1/media.json'), JSON.stringify({ media: { schema: 1, sources: [{ id: 'tone', kind: 'audio', path: 'tone.wav', duration: 0.2 }], placements: [{ id: 'tone-use', role: 'audio', source: 'tone', at: 0, in: 0, out: 0.2, gain: 0.35 }], sequence: [] } }));
    const project = openProject(dir);
    await project.buildParts('parts', 'Codex');
    const saved = await project.readVersion('parts', 2);
    expect(saved.code?.offsets.hook.label.x).toBe(10);
    expect(saved.media?.placements[0]).toMatchObject({ id: 'tone-use', gain: 0.35 });
    expect(readFileSync(resolve(reelDir, 'v2', saved.media!.sources[0].path))).toEqual(sound);
    expect(readFileSync(join(reelDir, 'v2/index.html'), 'utf8')).toContain('href="kinotta-edits.css"');
    expect(readFileSync(tone)).toEqual(sound);
  });

  it('publishes the first version from the authored root manifest', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const project = openProject(dir);
    expect(await project.listVersions('parts')).toEqual([]);
    expect(await project.buildParts('parts', 'Codex')).toEqual({ version: 1, issues: [] });
    expect((await project.readVersion('parts', 1)).issues).toEqual([]);
    expect(readdirSync(join(reelDir, 'v1')).sort()).toEqual(['authored-shots.json', 'index.html', 'shots.json']);
  });

  it('refuses an invalid new revision without publishing, changing the previous version or losing Working history', async () => {
    const { dir, reelDir, manifest } = partsFixture();
    const project = openProject(dir);
    const list = await project.addOperation('parts', { kind: 'element-offset', clip: 'hook', element: 'label', x: 10, y: 0, scale: 1 });
    const original = readFileSync(join(reelDir, 'v1/index.html'));
    nextRevision(reelDir, 'hook', 'body{color:red}');
    manifest.shots[0].revision = 'r2';
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await expect(project.buildParts('parts', 'Codex')).rejects.toThrow(/hook.*CSS.*scope/);
    expect(readFileSync(join(reelDir, 'v1/index.html'))).toEqual(original);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    expect(existsSync(join(reelDir, '.save'))).toBe(false);
    expect((await project.readEditList('parts')).operations).toEqual(list.operations);
    expect((await project.readEditList('parts')).canUndo).toBe(true);
  });

  it('kinotta build assembles the manifest and prints the same successful check result', async () => {
    const { dir } = partsFixture(3, false);
    const built = await cli(process.execPath, [LAUNCHER, 'build', 'parts', '--by', 'Codex', '--project', dir], { encoding: 'utf8', timeout: CLI_TIMEOUT_MS });
    expect(built.stderr).toBe('');
    expect(built.stdout).toContain('parts v1: no contract issues');
    expect((await openProject(dir).readVersion('parts', 1)).builtBy).toBe('Codex');
  });

  it('kinotta build uses the running editor and its lock', async () => {
    const { dir } = partsFixture(3, false);
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      const built = await cli(process.execPath, [LAUNCHER, 'build', 'parts', '--by', 'Codex', '--project', dir], { encoding: 'utf8', timeout: CLI_TIMEOUT_MS });
      expect(built.stdout).toContain('parts v1: no contract issues');
      expect((await server.project.readVersion('parts', 1)).issues).toEqual([]);
    } finally { await server.close(); }
  });

  it('serves revision assets from their immutable folders while keeping editor state private', async () => {
    const { dir, reelDir } = partsFixture();
    mkdirSync(join(reelDir, 'shots/hook/r1/assets'));
    writeFileSync(join(reelDir, 'shots/hook/r1/assets/mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      const response = await fetch(`${server.url}/reels/parts/shots/hook/r1/assets/mark.svg`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/svg+xml');
      expect(await response.text()).toContain('<svg');
      expect((await fetch(`${server.url}/reels/parts/shared/r1/shared.css`)).status).toBe(200);
      expect((await fetch(`${server.url}/reels/parts/shots/hook/r1/assets%2F..%2F..%2F..%2F..%2F.kinotta%2Fstate.json`)).status).toBe(404);
      expect((await fetch(`${server.url}/reels/parts/edit-list.json`)).status).toBe(404);
    } finally { await server.close(); }
  });
});
