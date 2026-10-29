// NODE_PATH=motion/node_modules node beats.js dist/clip.html out/sheet.png t1 t2 ... -> contact sheet of stills at those times
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

(async () => {
  const [html, out, ...ts] = process.argv.slice(2);
  const browser = await chromium.launch();
  let dir;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(html)).href + '?render');
    await page.evaluate(() => document.fonts.ready);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt'));
    await page.evaluate(() => {
      if (document.documentElement.classList.contains('alpha')) {
        document.documentElement.style.background = '#000';
        document.body.style.background = '#000';
      }
    });
    for (let i = 0; i < ts.length; i++) {
      await page.evaluate((t) => seek(t), +ts[i]);
      await page.screenshot({ path: path.join(dir, `${String(i).padStart(3, '0')}.png`) });
    }
    const cols = Math.min(4, ts.length), rows = Math.ceil(ts.length / cols);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, '%03d.png'), '-vf', `scale=640:-1,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', out]);
    if (errors.length) console.log('ERR', errors);
  } finally {
    try { await browser.close(); }
    finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
