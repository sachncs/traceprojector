import { expect } from 'chai'
import {
  SparseMatrix, conjugateGradient, minimumNormSolveSparse
} from '../traceprojector/sparse-linear-algebra.js'
import { minimumNormSolve } from '../traceprojector/dense-linear-algebra.js'

function seeded (seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random sparse constraint matrix, SPD tridiagonal-plus mass matrix, consistent right-hand side. */
function problem (n, m, seed, redundant = false) {
  const random = seeded(seed)
  const rowEntries = []
  for (let i = 0; i < m; i++) {
    const entries = new Map()
    if (redundant && i === m - 1) {
      for (const [j, v] of rowEntries[0]) entries.set(j, 2 * v)
    } else {
      for (let k = 0; k < 3; k++) entries.set(Math.floor(random() * n), Math.round(4 * random() - 2) || 1)
    }
    rowEntries.push(entries)
  }
  const massEntries = Array.from({ length: n }, () => new Map())
  for (let i = 0; i < n; i++) {
    massEntries[i].set(i, 4 + random())
    if (i + 1 < n) {
      const off = 0.5 * (random() - 0.5)
      massEntries[i].set(i + 1, off)
      massEntries[i + 1].set(i, off)
    }
  }
  const x0 = Float64Array.from({ length: n }, () => random() - 0.5)
  const constraints = new SparseMatrix(m, n, rowEntries)
  const r = constraints.multiply(x0)
  const denseRows = rowEntries.map((e) => {
    const row = new Float64Array(n)
    for (const [j, v] of e) row[j] += v
    return row
  })
  const denseMass = new Float64Array(n * n)
  massEntries.forEach((e, i) => { for (const [j, v] of e) denseMass[i * n + j] = v })
  return { constraints, mass: new SparseMatrix(n, n, massEntries), r, denseRows, denseMass }
}

describe('sparse linear algebra', () => {
  it('SparseMatrix multiplies and transposes', () => {
    const a = new SparseMatrix(2, 3, [new Map([[0, 1], [2, 2]]), new Map([[1, 3]])])
    expect(Array.from(a.multiply(Float64Array.from([1, 1, 1])))).to.deep.equal([3, 3])
    expect(Array.from(a.multiplyTranspose(Float64Array.from([1, 1])))).to.deep.equal([1, 3, 2])
    expect(Array.from(a.diagonal())).to.deep.equal([1, 3])
  })

  it('conjugateGradient solves a positive definite system', () => {
    const a = new SparseMatrix(2, 2, [new Map([[0, 4], [1, 1]]), new Map([[0, 1], [1, 3]])])
    const { x, relativeResidual } = conjugateGradient(
      (v, out) => a.multiply(v, out), Float64Array.from([1, 2]), { tolerance: 1e-14, maxIterations: 50 })
    expect(x[0]).to.be.closeTo(1 / 11, 1e-12)
    expect(x[1]).to.be.closeTo(7 / 11, 1e-12)
    expect(relativeResidual).to.be.below(1e-13)
  })

  for (const [n, m, seed, redundant] of [[30, 12, 1, false], [60, 25, 2, false], [40, 15, 3, true]]) {
    it(`minimumNormSolveSparse matches the dense solver (n=${n}, m=${m}${redundant ? ', redundant row' : ''})`, () => {
      const { constraints, mass, r, denseRows, denseMass } = problem(n, m, seed, redundant)
      const sparse = minimumNormSolveSparse(constraints, mass, r)
      const dense = minimumNormSolve(denseRows, denseMass, n, r)
      let worst = 0
      for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(sparse.x[i] - dense.x[i]))
      expect(worst).to.be.below(1e-9)
      expect(sparse.residual).to.be.below(1e-10 * (1 + sparse.scale))
    })
  }
})
