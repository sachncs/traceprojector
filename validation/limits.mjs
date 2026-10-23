/**
 * Measures how time and memory grow with the number of cells (criterion A11).
 * Usage: node --expose-gc validation/limits.mjs
 */
import { Mesh, Whitney, Projector } from '../traceprojector/traceprojector.js'
import { generateUnitCubeMesh } from '../traceprojector/generator.js'

const rows = []
for (const n of [2, 4, 6, 8, 10, 12, 16, 20]) {
  globalThis.gc?.()
  const before = process.memoryUsage().heapUsed
  const t0 = performance.now()
  const base = generateUnitCubeMesh(n)
  const mesh = new Mesh(base.getVertices(), base.getTetrahedra())
  const whitney = new Whitney(mesh)
  const projector = new Projector(mesh, whitney, { onWarning: () => {} })
  const t1 = performance.now()
  projector.computeBoundaryWeights()
  const t2 = performance.now()
  projector.buildLocator()
  const tLocator = performance.now()
  let sum = 0
  for (let i = 0; i < 2000; i++) sum += projector.projectAtPoint((x) => x[0] + x[1], [0.1 + 0.8 * ((i * 37) % 101) / 101, 0.1 + 0.8 * ((i * 53) % 103) / 103, 0.1 + 0.8 * ((i * 71) % 107) / 107]).value
  const t3 = performance.now()
  globalThis.gc?.()
  const after = process.memoryUsage().heapUsed
  rows.push({ n, cells: mesh.tetrahedronCount, buildMs: t1 - t0, weightsMs: t2 - t1, locatorMs: tLocator - t2, perProjectionMs: (t3 - tLocator) / 2000, heapMb: (after - before) / 1e6, sum })
}
console.log('cells, build ms, boundary-weights ms, locator build ms, ms per located projection, heap MB')
for (const r of rows) console.log(`${r.cells}, ${r.buildMs.toFixed(0)}, ${r.weightsMs.toFixed(0)}, ${r.locatorMs.toFixed(0)}, ${r.perProjectionMs.toFixed(4)}, ${r.heapMb.toFixed(1)}`)
const slope = (xs, ys) => {
  const lx = xs.map(Math.log); const ly = ys.map(Math.log)
  const mx = lx.reduce((a, b) => a + b) / lx.length; const my = ly.reduce((a, b) => a + b) / ly.length
  return lx.reduce((s, x, i) => s + (x - mx) * (ly[i] - my), 0) / lx.reduce((s, x) => s + (x - mx) ** 2, 0)
}
const tail = rows.slice(2)
console.log('scaling exponents over the last', tail.length, 'sizes (time ~ cells^p):',
  'build', slope(tail.map((r) => r.cells), tail.map((r) => r.buildMs)).toFixed(2),
  'weights', slope(tail.map((r) => r.cells), tail.map((r) => r.weightsMs)).toFixed(2),
  'memory', slope(tail.map((r) => r.cells), tail.map((r) => r.heapMb)).toFixed(2))
