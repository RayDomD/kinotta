import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';
import { effectsCatalogue, effectPreviewFile } from '../../server/core/index.ts';

const TEMPLATES_DIR = resolve('skill/kinotta/templates/effects');

const EXPECTED_INSTANT_IDS = new Set([
  'film-look',
  'number-cut',
  'section-tag',
  'title-card',
]);

it('effects catalogue: template folders match catalogue entries, instant set matches, and preview route enforces safety', async () => {
  // 1. Every template folder has exactly one catalogue entry and vice versa
  const folders = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  expect(folders).toHaveLength(25);

  const catalogue = await effectsCatalogue();
  expect(catalogue).toHaveLength(25);

  const catalogueIds = catalogue.map((e) => e.id).sort();
  expect(catalogueIds).toEqual(folders);

  // Check unique IDs
  const uniqueIds = new Set(catalogueIds);
  expect(uniqueIds.size).toBe(25);

  // 2. Instant set matches the catalogue
  const instantEntries = catalogue.filter((e) => e.instant);
  const instantIds = new Set(instantEntries.map((e) => e.id));
  expect(instantIds).toEqual(EXPECTED_INSTANT_IDS);

  for (const entry of instantEntries) {
    expect(entry.instantFrom).toBeDefined();
    expect(typeof entry.instantFrom).toBe('string');
    expect(entry.instantFrom!.length).toBeGreaterThan(0);
  }

  for (const entry of catalogue.filter((e) => !e.instant)) {
    expect(entry.instant).toBe(false);
  }

  // 3. HTTP routes: GET /api/effects and GET /api/effects/<id>/preview/<file>
  const dir = emptyProject();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const listRes = await fetch(`${server.url}/api/effects`);
    expect(listRes.status).toBe(200);
    expect(listRes.headers.get('content-type')).toContain('application/json');
    const { effects } = (await listRes.json()) as { effects: typeof catalogue };
    expect(effects).toHaveLength(25);

    // Serves allowed preview files
    const sampleId = 'big-word';
    for (const file of ['shot.html', 'shot.css', 'shot.js', 'shared.css', 'presets.css']) {
      const res = await fetch(`${server.url}/api/effects/${sampleId}/preview/${file}`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.length).toBeGreaterThan(0);
      if (file.endsWith('.html')) {
        expect(res.headers.get('content-type')).toContain('text/html');
      } else if (file.endsWith('.css')) {
        expect(res.headers.get('content-type')).toContain('text/css');
      } else if (file.endsWith('.js')) {
        expect(res.headers.get('content-type')).toContain('javascript');
      }
    }

    // Refuses an unknown id
    const unknownIdRes = await fetch(`${server.url}/api/effects/unknown-template-id/preview/shot.html`);
    expect(unknownIdRes.status).toBe(404);

    // Refuses a .. path
    const dotDotRes1 = await fetch(`${server.url}/api/effects/${sampleId}/preview/..%2fREADME.md`);
    expect(dotDotRes1.status).toBe(404);

    const dotDotRes2 = await fetch(`${server.url}/api/effects/${sampleId}/preview/..%2f..%2fpackage.json`);
    expect(dotDotRes2.status).toBe(404);

    // Refuses a disallowed file
    const disallowedRes = await fetch(`${server.url}/api/effects/${sampleId}/preview/README.md`);
    expect(disallowedRes.status).toBe(404);

    // Direct core function checks
    await expect(effectPreviewFile('unknown-template-id', 'shot.html')).rejects.toThrow();
    await expect(effectPreviewFile(sampleId, '../README.md')).rejects.toThrow();
    await expect(effectPreviewFile(sampleId, 'unauthorized.txt')).rejects.toThrow();
    const resolvedHtml = await effectPreviewFile(sampleId, 'shot.html');
    expect(resolvedHtml).toContain('big-word');
  } finally {
    await server.close();
  }
});
