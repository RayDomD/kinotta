import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyProject } from './project.ts';
import type { PartsManifest } from '../../server/core/index.ts';

/** Three immutable revisions and a manifest. The first reading checks supply a contract-1-compatible page. */
export function partsFixture(count = 3, initialVersion = true) {
  const dir = emptyProject();
  const reelDir = join(dir, 'reels', 'parts');
  const names = count === 3 ? ['hook', 'proof', 'close'] : Array.from({ length: count }, (_, index) => `shot-${String(index + 1).padStart(2, '0')}`);
  const manifest = { contract: 2 as const, duration: count, shared: 'r1', shots: names.map((name) => ({ name, revision: 'r1', duration: 1, title: name, description: `The ${name}.` })) };
  mkdirSync(reelDir, { recursive: true });
  if (initialVersion) mkdirSync(join(reelDir, 'v1'));
  mkdirSync(join(reelDir, 'shared', 'r1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Parts fixture' }));
  writeFileSync(join(reelDir, 'shared', 'r1', 'shared.css'), 'html,body{margin:0;background:#eee}#stage{position:relative;width:1920px;height:1080px}');
  for (const shot of manifest.shots) {
    const revision = join(reelDir, 'shots', shot.name, shot.revision);
    mkdirSync(revision, { recursive: true });
    writeFileSync(join(revision, 'shot.html'), `<section data-scene="${shot.name}"><div data-el="label">${shot.title}</div></section>`);
    writeFileSync(join(revision, 'shot.css'), `[data-scene="${shot.name}"] [data-el="label"]{font-size:180px;position:absolute;left:140px;top:380px}`);
    writeFileSync(join(revision, 'shot.js'), `const root=document.querySelector('[data-scene="${shot.name}"]');export function seek(local){root.dataset.local=String(local);root.querySelector('[data-el="label"]').style.transform='translateX('+String(local*20)+'px)';}`);
  }
  writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
  if (initialVersion) {
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(manifest));
    writeFileSync(join(reelDir, 'v1', 'index.html'), '<!doctype html>' + manifest.shots.map((shot, i) => `<section data-scene="${shot.name}" data-start="${i}" data-duration="1"><div data-el="label">${shot.title}</div></section>`).join('') + `<script>window.DURATION=${count};window.seek=()=>{};</script>`);
  }
  return { dir, reelDir, manifest };
}

/** All file reads happen before the assembler, whose inputs are plain revision text. */
export function partsInputs(reelDir: string, manifest: ReturnType<typeof partsFixture>['manifest']) {
  return {
    shared: { [manifest.shared]: { css: readFileSync(join(reelDir, 'shared', manifest.shared, 'shared.css'), 'utf8') } },
    shots: Object.fromEntries(manifest.shots.map((shot) => {
      const folder = join(reelDir, 'shots', shot.name, shot.revision);
      return [`${shot.name}/${shot.revision}`, { html: readFileSync(join(folder, 'shot.html'), 'utf8'), css: readFileSync(join(folder, 'shot.css'), 'utf8'), js: readFileSync(join(folder, 'shot.js'), 'utf8') }];
    })),
  };
}

/** One shot offers three revisions with different durations and visible answers. */
export function alternatesFixture(initialVersion = false) {
  const fixture = partsFixture(3, initialVersion);
  const alternates = ['r1', 'r2', 'r3'].map((revision, index) => ({ revision, label: String.fromCharCode(65 + index), title: `Proof ${index + 1}`, note: `Approach ${index + 1}`, duration: index + 1 }));
  for (const alternate of alternates.slice(1)) {
    const folder = join(fixture.reelDir, 'shots/proof', alternate.revision);
    cpSync(join(fixture.reelDir, 'shots/proof/r1'), folder, { recursive: true });
    writeFileSync(join(folder, 'shot.html'), `<section data-scene="proof"><div data-el="label">${alternate.title}</div></section>`);
  }
  const manifest: PartsManifest = { ...fixture.manifest, shots: fixture.manifest.shots.map((shot) => shot.name === 'proof' ? { ...shot, alternates } : shot) };
  writeFileSync(join(fixture.reelDir, 'shots.json'), JSON.stringify(manifest));
  if (initialVersion) writeFileSync(join(fixture.reelDir, 'v1/shots.json'), JSON.stringify(manifest));
  return { ...fixture, manifest, alternates };
}
