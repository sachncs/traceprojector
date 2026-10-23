/**
 * Installs the packed tarball into an empty directory and exercises it the way
 * a consumer would: every `exports` subpath from ESM, `require()` of the ESM
 * entry, the UMD bundle in a clean context, and a TypeScript consumer
 * type-checked against the shipped declarations.
 *
 * Run after `npm run build`.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const work = mkdtempSync(join(tmpdir(), 'traceprojector-consumer-'))
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], root))[0]
  const tarball = join(work, packed.filename)
  const consumer = join(work, 'consumer')
  run('mkdir', ['-p', consumer], work)
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))
  run('npm', ['install', '--no-audit', '--no-fund', tarball], consumer)

  // 1. Every exports subpath imports from ESM and exposes something.
  const subpaths = Object.keys(pkg.exports).map((s) => (s === '.' ? pkg.name : `${pkg.name}/${s.slice(2)}`))
  const imports = subpaths.map((s, i) => `const m${i} = await import('${s}'); if (Object.keys(m${i}).length === 0) throw new Error('${s} exports nothing')`)
  // 2. require() of the ESM entry (Node >= 22.12), and a real projection.
  const script = `
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
${imports.join('\n')}
const { Mesh, Whitney, Projector, StableProjector, ProjectError } = await import('${pkg.name}')
const require = createRequire(import.meta.url)
const viaRequire = require('${pkg.name}')
if (typeof viaRequire.Projector !== 'function') throw new Error('require() of the ESM entry failed')
const mesh = new Mesh([[0,0,0],[1,0,0],[0,1,0],[0,0,1]], [[0,1,2,3]])
const projector = new Projector(mesh, new Whitney(mesh), { onWarning: () => {} })
const value = projector.projectH1((x) => x[0] + 2 * x[1], [0.2, 0.2, 0.2], 0)
if (Math.abs(value - 0.6) > 1e-12) throw new Error('projection of an affine field is not exact: ' + value)
try { projector.projectH1(() => Infinity, [0.2, 0.2, 0.2], 0); throw new Error('non-finite input was accepted') } catch (e) { if (!(e instanceof ProjectError)) throw e }
if (typeof StableProjector !== 'function') throw new Error('StableProjector missing')
// 3. UMD bundle in a clean context.
const sandbox = {}
vm.runInNewContext(readFileSync(new URL('./node_modules/${pkg.name}/${pkg.unpkg}', import.meta.url), 'utf8'), sandbox)
if (typeof sandbox.TraceProjector?.Projector !== 'function') throw new Error('UMD bundle has no Projector')
console.log('consumer checks passed for', ${JSON.stringify(subpaths)}.length, 'subpaths')
`
  writeFileSync(join(consumer, 'check.mjs'), script)
  console.log(run('node', ['check.mjs'], consumer).trim())

  // 4. TypeScript consumer against the shipped declarations.
  const tsc = ['node_modules/.bin/tsc', 'site/node_modules/.bin/tsc'].map((p) => join(root, p)).find(existsSync)
  if (tsc) {
    writeFileSync(join(consumer, 'use.ts'), `
import { Mesh, Whitney, Projector, StableProjector } from '${pkg.name}'
import { generateUnitCubeMesh } from '${pkg.name}/generator'
const mesh: Mesh = generateUnitCubeMesh(2)
const projector = new Projector(mesh, new Whitney(mesh))
const value: number = projector.projectH1((x) => x[0], [0.1, 0.1, 0.1], 0)
const stable = new StableProjector(mesh.getVertices(), mesh.getTetrahedra())
const stableValue: number | number[] = stable.project((x) => x[0], [0.1, 0.1, 0.1], 0, 0)
export { value, stableValue }
`)
    writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022', strict: true, noEmit: true, skipLibCheck: false, types: [] },
      files: ['use.ts']
    }))
    run(tsc, ['-p', 'tsconfig.json'], consumer)
    console.log('TypeScript consumer type-checks against the shipped declarations')
  } else {
    console.log('TypeScript not installed; skipped the type-check of the consumer')
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
