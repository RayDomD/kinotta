import { readFileSync, writeFileSync, renameSync, symlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const mode = process.argv[2];
let prompt = '';
process.stdin.setEncoding('utf8').on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  writeFileSync('received-prompt.txt', prompt);
  if (mode === 'exit1') process.exit(1);
  if (mode === 'provider-error') { console.log(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true })); return; }
  if (mode === 'codex-error') { console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'fake quota error' } })); return; }
  if (mode === 'bad') { console.log(JSON.stringify({ type: 'result', subtype: 'success' })); return; }
  if (mode === 'hang') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
    writeFileSync('descendant.pid', String(child.pid));
    setInterval(() => {}, 1000);
    return;
  }
  const plan = JSON.parse(readFileSync('output/plan.json', 'utf8'));
  plan.clips = [{ id: '01', kind: 'full', template: 'title-card', title: 'Hello', section: plan.sections[0].id, in: 0, out: 3, fill: { title: ['Hello', 'world'] } }];
  writeFileSync('output/plan.json', JSON.stringify(plan));
  for (const args of [
    ['skill/engine/build.py', '--plan', 'output/plan.json', 'output/index.html'],
    ['skill/scripts/shots.py', 'output/plan.json', 'output/shots.json', '--built-by', 'Fake agent'],
  ]) {
    const run = spawnSync(process.platform === 'win32' ? 'python' : 'python3', args, { encoding: 'utf8', windowsHide: true });
    if (run.status !== 0) { writeFileSync('fake-error.txt', run.stderr); console.error(run.stderr); process.exit(1); }
  }
  const inspect = spawnSync(process.execPath, ['skill/engine/render.js', 'output/index.html', '--info'], { encoding: 'utf8', windowsHide: true });
  if (inspect.status !== 0) { writeFileSync('fake-error.txt', inspect.stderr); process.exit(1); }
  writeFileSync('node-inspection.json', inspect.stdout);
  if (mode === 'cuts') {
    writeFileSync('output/cuts.json', JSON.stringify({
      cuts: [{ from: 1.5, to: 2.5, reason: 'Long pause before the answer' }],
    }));
  }
  if (mode === 'change-captions') {
    plan.captions = false;
    writeFileSync('output/plan.json', JSON.stringify(plan));
  }
  if (mode === 'escape') {
    const html = readFileSync('output/index.html', 'utf8').replace('</head>', '<script src="../outside.js"></script></head>');
    writeFileSync('output/index.html', html);
  }
  if (mode === 'symlink') { renameSync('output', 'escaped-output'); symlinkSync(resolve('escaped-output'), 'output', process.platform === 'win32' ? 'junction' : 'dir'); }
  if (mode === 'noseek') writeFileSync('output/index.html', readFileSync('output/index.html', 'utf8').replace(/M.page\(/g, 'M.missingPage('));
  console.log(JSON.stringify(mode === 'codex-success' ? { type: 'turn.completed' } : { type: 'result', subtype: 'success' }));
});

