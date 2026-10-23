/**
 * Builds the demo site against the packed tarball instead of the workspace
 * link, then runs the site's own bridge code on the installed package to
 * project a manufactured field and check the residual. This is the check that
 * the published package, not the source tree, serves the site.
 *
 * Run after `npm run build`.
 */
import {execFileSync} from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'traceprojector-site-'));
const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

try {
  const packed = JSON.parse(
      run('npm', ['pack', '--json', '--pack-destination', work], root),
  )[0];
  const tarball = join(work, packed.filename);
  const copy = join(work, 'site');
  cpSync(join(root, 'site'), copy, {
    recursive: true,
    filter: (source) => !/[\\/](node_modules|\.next|out)([\\/]|$)/.test(source),
  });
  const manifestPath = join(copy, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dependencies.traceprojector = `file:${tarball}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  run('npm', ['install', '--no-audit', '--no-fund'], copy);
  run('npx', ['next', 'build'], copy);

  const check = `
import {buildProjector, projectAtPoint} from './lib/trace-bridge.ts';
const {projector} = buildProjector(3, 3);
const u = (x) => 0.5 * x[0] - x[1] + 2 * x[2] + 1;
let worst = 0;
for (const x of [[0.31, 0.42, 0.27], [0.7, 0.2, 0.55], [0.12, 0.6, 0.9]]) {
  worst = Math.max(worst, Math.abs(projectAtPoint(projector, u, x, 0).value - u(x)));
}
if (!(worst <= 1e-10)) throw new Error('residual ' + worst);
console.log('site bridge on the packed tarball: residual', worst);
`;
  console.log(run('node', ['--input-type=module', '-e', check], copy));
} finally {
  rmSync(work, {recursive: true, force: true});
}
