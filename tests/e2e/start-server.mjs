// Playwright webServer entry: launches the real Kinotta server against a temp copy of a sample
// project, with explicit mtimes so the rail order is deterministic.
import { cpSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { register } from 'tsx/esm/api';

const fixtureName = process.env.KINOTTA_E2E_FIXTURE ?? 'showreel-project';
const fixture = resolve(import.meta.dirname, '../fixtures/projects', fixtureName);
const project = mkdtempSync(join(tmpdir(), 'kinotta-e2e-'));
cpSync(fixture, project, { recursive: true });

function setMtime(dir, when) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) setMtime(path, when);
    utimesSync(path, when, when);
  }
  utimesSync(dir, when, when);
}
if (fixtureName === 'showreel-project') {
  setMtime(join(project, 'reels', 'broll-cutdown'), new Date('2026-01-01T10:00:00Z'));
  setMtime(join(project, 'reels', 'product-showreel'), new Date('2026-02-01T10:00:00Z'));
}

// A spec that reads files the server wrote asks for the temp project's path here.
if (process.env.KINOTTA_E2E_PROJECT_FILE) writeFileSync(process.env.KINOTTA_E2E_PROJECT_FILE, project);

register();
// The engine sample's pages are built by the engine at start, so they show what it builds today.
if (fixtureName === 'engine-project') (await import('../helpers/engine.ts')).buildEngineProject(project);
if (fixtureName === 'broll-project') (await import('../helpers/engine.ts')).buildBrollProject(project);
const { main } = await import('../../server/cli.ts');
await main(['--project', project, '--port', process.env.KINOTTA_E2E_PORT ?? '4399', '--no-open']);
