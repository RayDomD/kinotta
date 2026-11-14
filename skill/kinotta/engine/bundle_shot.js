// node bundle_shot.js shots/<name>/r<n>/shot.src.js shots/<name>/r<n>/shot.js -> one self-contained shot module
// The source may import 'three' and 'three/addons/...' (the vendored r170) and must export async function seek(local).
// Kinotta's build refuses `import` in shot.js, so the library and the shot are bundled into a module-scoped closure
// and shot.js re-exports its seek.
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Usage: node bundle_shot.js <shot.src.js> <shot.js>'); process.exit(2); }
const SKILL = path.resolve(fs.realpathSync(__dirname), '..'), THREE = path.join(SKILL, 'vendor', 'three');
// esbuild from NODE_PATH (the project's motion/node_modules), else from the Kinotta repo this skill lives in
let esbuild;
for (const from of [undefined, path.resolve(SKILL, '..', '..')]) {
  try { esbuild = require(from ? require.resolve('esbuild', { paths: [from] }) : 'esbuild'); break; } catch {}
}
if (!esbuild) { console.error('esbuild not found. Run: npm install --prefix ./motion esbuild, then NODE_PATH=./motion/node_modules'); process.exit(1); }
const result = esbuild.buildSync({
  entryPoints: [path.resolve(src)], bundle: true, minify: true, write: false, format: 'iife', globalName: '__shot', target: 'es2022', legalComments: 'none',
  alias: { three: path.join(THREE, 'build', 'three.module.js'), 'three/addons': path.join(THREE, 'examples', 'jsm') },
});
const js = '// Bundled by bundle_shot.js from shot.src.js; includes three.js r170 (MIT, https://threejs.org/).\n'
  + result.outputFiles[0].text + 'export async function seek(local) { return __shot.seek(local); }\n';
// the same test Kinotta's build applies, so a failure shows here rather than at build time
if (/\bimport\b\s*(?!\.meta\b)/.test(js.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""'))) { console.error('The bundle still contains an import; Kinotta will refuse it.'); process.exit(1); }
fs.writeFileSync(out, js);
console.log('Wrote ' + out + ' (' + Math.round(js.length / 1024) + ' KB)');
