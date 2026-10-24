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
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');

/**
 * The deployed site lives under /traceprojector/, so a page that references
 * /_next/... or /favicon.svg at the host root is broken there (this happened
 * once). Every page must be present, standalone, and carry the base path.
 */
function checkOutput(out) {
  const recipes = JSON.parse(readFileSync(
      join(root, 'examples/recipes.json'), 'utf8')).map((r) => r.slug);
  const pages = [
    'index.html',
    'playground/index.html',
    'docs/index.html',
    'recipes/index.html',
    ...recipes.map((slug) => `recipes/${slug}/index.html`),
    ...['getting-started', 'operators', 'errors', 'api', 'performance',
      'limits', 'math', 'architecture', 'validation', 'developer-guide',
      'changelog'].map((slug) => `docs/${slug}/index.html`),
  ];
  for (const page of pages) {
    const path = join(out, page);
    if (!existsSync(path)) throw new Error(`missing page ${page}`);
    const html = readFileSync(path, 'utf8');
    const unprefixed = html.match(/(?:href|src)="\/(?!traceprojector\/)[^"]*"/g);
    if (unprefixed) {
      throw new Error(`${page} has links outside the base path: ${
        unprefixed.slice(0, 3).join(' ')}`);
    }
    if ((page.startsWith('docs/') || page.startsWith('recipes/')) && /github\.com\/[^"]*\/blob\/master\/docs\//.test(html)) {
      throw new Error(`${page} links to a Markdown file on GitHub`);
    }
  }
  console.log(`site output: ${pages.length} pages, all under the base path`);
}
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
  // The documentation pages are rendered from the repository's Markdown, which
  // the site reads from the directory above it.
  cpSync(join(root, 'docs'), join(work, 'docs'), {recursive: true});
  cpSync(join(root, 'examples'), join(work, 'examples'), {recursive: true});
  cpSync(join(root, 'CHANGELOG.md'), join(work, 'CHANGELOG.md'));
  const manifestPath = join(copy, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dependencies.traceprojector = `file:${tarball}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  run('npm', ['install', '--no-audit', '--no-fund'], copy);
  run('npx', ['next', 'build'], copy);
  checkOutput(join(copy, 'out'));

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
