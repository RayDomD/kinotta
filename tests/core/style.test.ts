import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { createHandler } from '../../server/http/_internal/handler.ts';
import {
  validateStyle, saveStyle, readStyle, listStyles, copyStyleToReel, readReelStyle,
  resolveDefaultStyle, saveDefaultStyle, migrateStyles, migrateStyleProfile, type Style,
} from '../../server/core/_internal/style.ts';
import { makeOptions } from '../../server/core/_internal/make-options.ts';
import { migrateSimpleOptionsProfile, readSimpleOptions, STORAGE_KEY, MIGRATED_STORAGE_KEY } from '../../web/src/simple-options.ts';

let dir: string;
let home: string;
const projects: Project[] = [];
const servers: Server[] = [];
const sample = (id = 'custom', scope: 'user' | 'project' = 'user'): Style => ({
  id, name: 'My custom style', scope, basedOn: 'clean', form: 'talking', look: 'clean',
  settings: { videoType: 'interview', broll: 'light', captions: 'phrases', pace: 'calm' },
  yours: ['pace'], fonts: { words: 'Outfit', numbers: 'Doto' },
  music: { file: 'music/song.wav', fit: 'under', duck: true }, effects: ['title-card'], shots: 'Show the desk', rules: ['Leave pauses'],
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kinotta-style-'));
  home = join(dir, 'home');
  vi.stubEnv('KINOTTA_HOME', home);
  await mkdir(join(dir, 'reels', 'demo'), { recursive: true });
  await mkdir(home, { recursive: true });
});
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const project of projects.splice(0)) await project.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('style validation and storage', () => {
  it('round-trips the complete shape without retaining input references', () => {
    const input = sample();
    const parsed = validateStyle(input);
    expect(parsed).toEqual(input);
    input.settings.pace = 'fast';
    input.rules.push('Another rule');
    expect(parsed.settings.pace).toBe('calm');
    expect(parsed.rules).toEqual(['Leave pauses']);
  });
  it.each([
    null, [], {}, { id: '../escape' }, { id: 'a/b' }, { id: 'migrations' }, { scope: 'reel' }, { name: '' },
    { settings: { pace: 'rapid' } }, { settings: { videoType: 'talking' } },
    { settings: { broll: 'lots' } }, { settings: { captions: 'word by word' } },
    { settings: { notes: 'not a setting' } }, { yours: ['notes'] }, { yours: 'pace' },
    { effects: [4] }, { rules: [null] }, { fonts: { words: false } },
    { music: { duck: 'yes' } }, { music: { fit: 'loud' } }, { music: [] },
    { basedOn: '../clean' }, { shots: 3 }, { form: [] }, { look: false },
  ])('rejects invalid values: %j', (changes) => {
    const input = changes === null || Array.isArray(changes) || Object.keys(changes).length === 0 ? changes : { ...sample(), ...changes };
    expect(() => validateStyle(input)).toThrow(expect.objectContaining({ code: 'invalid' }));
  });
  it('lists all six valid built-ins, and saves and reads each writable scope', async () => {
    await saveStyle(dir, 'user', sample());
    await saveStyle(dir, 'project', sample('project-custom', 'project'));
    expect(await readStyle(dir, 'custom', 'user')).toEqual(sample());
    expect(await readStyle(dir, 'project-custom', 'project')).toEqual(sample('project-custom', 'project'));
    const listing = await listStyles(dir);
    expect(listing.defaultId).toBe('clean');
    const builtins = listing.styles.filter((style) => style.scope === 'builtin');
    expect(builtins.map((style) => style.id).sort()).toEqual(['clean', 'creator', 'editorial', 'filmed-3d', 'flat-2d', 'layered-2d']);
    for (const style of builtins) expect(makeOptions(style.settings)).toEqual(style.settings);
    expect(listing.styles).toHaveLength(8);
    expect(JSON.parse(await readFile(join(home, 'styles', 'custom.json'), 'utf8'))).toEqual(sample());
    expect(JSON.parse(await readFile(join(dir, 'reels', 'styles', 'project-custom.json'), 'utf8'))).toEqual(sample('project-custom', 'project'));
  });
  it('rejects overwriting built-ins and invalid scope/id combinations', async () => {
    const builtin = await readStyle(dir, 'clean');
    await expect(saveStyle(dir, 'builtin', builtin)).rejects.toMatchObject({ code: 'invalid' });
    await expect(saveStyle(dir, 'user', { ...builtin, scope: 'user' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(saveStyle(dir, 'user', sample('custom', 'project'))).rejects.toMatchObject({ code: 'invalid' });
    expect(await readStyle(dir, 'clean')).toEqual(builtin);
  });
  it('writes independent full copies onto reels with basedOn, outside versions and Working', async () => {
    await saveStyle(dir, 'user', sample());
    expect(await readReelStyle(dir, 'demo')).toBeNull();
    const copy = await copyStyleToReel(dir, 'demo', { id: 'custom' });
    expect(copy).toEqual({ ...sample(), scope: 'project', basedOn: 'custom' });
    await saveStyle(dir, 'user', { ...sample(), rules: ['Changed source'], settings: { pace: 'fast' } });
    expect(await readReelStyle(dir, 'demo')).toEqual(copy);
    expect(JSON.parse(await readFile(join(dir, 'reels', '.kinotta', 'demo', 'style.json'), 'utf8'))).toEqual(copy);
    await expect(copyStyleToReel(dir, '../escape', { id: 'clean' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(copyStyleToReel(dir, 'demo', { id: '../escape' })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('resolves saved defaults, code-built presets and the clean footage fallback', async () => {
    expect((await resolveDefaultStyle(dir)).id).toBe('clean');
    expect((await resolveDefaultStyle(dir, 'tutorial')).id).toBe('clean');
    expect((await resolveDefaultStyle(dir, 'filmed-3d')).id).toBe('filmed-3d');
    await saveStyle(dir, 'user', sample());
    await saveDefaultStyle(dir, { id: 'custom' });
    expect((await resolveDefaultStyle(dir, 'filmed-3d')).id).toBe('custom');
    expect((await listStyles(dir)).defaultId).toBe('custom');
    expect(JSON.parse(await readFile(join(home, 'style-default.json'), 'utf8'))).toEqual({ id: 'custom' });
    await expect(saveDefaultStyle(dir, { id: 'missing' })).rejects.toMatchObject({ code: 'not-found' });
    await writeFile(join(home, 'style-default.json'), '{"id":"deleted"}');
    expect((await resolveDefaultStyle(dir)).id).toBe('clean');
  });
});

const profile = { version: 1, videoType: 'short', broll: 'heavy', captions: 'word by word', pace: 'fast', overridden: { pace: true, broll: false, captions: true } };
describe('one-time migrations', () => {
  it.each(['user', 'project'] as const)('copies %s taste list items once and preserves the source bytes', async (scope) => {
    const source = join(scope === 'user' ? home : join(dir, 'reels'), 'taste.md');
    const original = Buffer.from('# Taste\r\n\r\n- Keep the silence\r\n* Show the product\r\n1. Use real sound\r\n-   \r\nParagraph, not a rule.\r\n');
    await writeFile(source, original);
    await Promise.all([migrateStyles(dir), migrateStyles(dir)]);
    await migrateStyles(dir);
    expect(await readFile(source)).toEqual(original);
    const listing = await listStyles(dir);
    const migrated = listing.styles.filter((style) => style.scope === scope);
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({ name: scope === 'user' ? 'My style' : 'Project style', rules: ['Keep the silence', 'Show the product', 'Use real sound'] });
    const marker = scope === 'user' ? join(home, 'migrations.json') : join(dir, 'reels', 'styles', 'migrations.json');
    expect(JSON.parse(await readFile(marker, 'utf8')).taste).toBe(migrated[0]!.id);
    expect(listing.defaultId).toBe(scope === 'user' ? 'my-style' : 'clean');
    await writeFile(source, '- A later note\n');
    await migrateStyles(dir);
    expect((await readStyle(dir, migrated[0]!.id, scope)).rules).toEqual(migrated[0]!.rules);
  });
  it('merges taste and browser profile into one My style, idempotently, preserving a chosen default', async () => {
    await saveStyle(dir, 'user', sample());
    await saveDefaultStyle(dir, { id: 'custom' });
    const original = '- Keep the original\n';
    await writeFile(join(home, 'taste.md'), original);
    const first = await migrateStyleProfile(dir, profile);
    expect(first).toMatchObject({ name: 'My style', rules: ['Keep the original'], settings: { videoType: 'short', broll: 'heavy', captions: 'word-by-word', pace: 'fast' }, yours: ['captions', 'pace'] });
    expect(await migrateStyleProfile(dir, JSON.stringify({ ...profile, pace: 'calm' }))).toEqual(first);
    expect((await listStyles(dir)).styles.filter((style) => style.name === 'My style')).toHaveLength(1);
    expect((await resolveDefaultStyle(dir)).id).toBe('custom');
    expect(await readFile(join(home, 'taste.md'), 'utf8')).toBe(original);
    expect(JSON.parse(await readFile(join(home, 'migrations.json'), 'utf8'))).toEqual({ taste: 'my-style', profile: 'my-style' });
  });
  it('also merges taste arriving after a profile and defaults the migrated style', async () => {
    await migrateStyleProfile(dir, { ...profile, videoType: 'decide' });
    await writeFile(join(home, 'taste.md'), '- Keep this\n');
    await migrateStyles(dir);
    const listing = await listStyles(dir);
    expect(listing.defaultId).toBe('my-style');
    expect(listing.styles.filter((style) => style.scope === 'user')).toHaveLength(1);
    expect(await readStyle(dir, 'my-style')).toMatchObject({ settings: { pace: 'fast' }, rules: ['Keep this'] });
    expect((await readStyle(dir, 'my-style')).settings.videoType).toBeUndefined();
    await expect(migrateStyleProfile(dir, { pace: 'wild' })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('calls the browser migration once, marks only success and preserves profile reads', async () => {
    const values = new Map<string, string>([[STORAGE_KEY, JSON.stringify(profile)]]);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    const migrate = vi.fn((raw: unknown) => migrateStyleProfile(dir, raw));
    await Promise.all([migrateSimpleOptionsProfile(migrate), migrateSimpleOptionsProfile(migrate)]);
    await migrateSimpleOptionsProfile(migrate);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(values.get(MIGRATED_STORAGE_KEY)).toBe('true');
    expect(values.get(STORAGE_KEY)).toBe(JSON.stringify(profile));
    expect(readSimpleOptions()).toMatchObject({ videoType: 'short', captions: 'word by word' });
    values.delete(MIGRATED_STORAGE_KEY);
    await migrateSimpleOptionsProfile(async () => { throw new Error('offline'); });
    expect(values.has(MIGRATED_STORAGE_KEY)).toBe(false);
    await migrateSimpleOptionsProfile(migrate);
    expect(values.get(MIGRATED_STORAGE_KEY)).toBe('true');
  });
});

it('exposes storage, default, reel copy and migration through the HTTP API', async () => {
  const project = openProject(dir);
  projects.push(project);
  const server = createServer(createHandler(project, dir));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected server port');
  const url = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(url + path, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  expect((await call('/api/styles')).body).toMatchObject({ defaultId: 'clean' });
  expect(await call('/api/styles', 'PUT', { scope: 'user', style: sample() })).toEqual({ status: 200, body: sample() });
  expect((await call('/api/styles/default', 'PUT', { id: 'custom' })).status).toBe(200);
  expect((await call('/api/styles')).body.defaultId).toBe('custom');
  expect(await call('/api/reels/demo/style')).toEqual({ status: 200, body: null });
  const copied = await call('/api/reels/demo/style', 'PUT', { id: 'custom' });
  expect(copied.status).toBe(200);
  expect(copied.body.basedOn).toBe('custom');
  expect(await call('/api/reels/demo/style')).toEqual(copied);
  expect((await call('/api/styles/migrate-profile', 'POST', profile)).body.settings.captions).toBe('word-by-word');
  expect((await call('/api/styles', 'PUT', { scope: 'builtin', style: sample() })).status).toBe(422);
  expect((await call('/api/styles/default', 'PUT', null)).status).toBe(422);
  expect((await call('/api/reels/missing/style')).status).toBe(404);
});
