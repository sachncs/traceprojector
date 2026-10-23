/**
 * Dense symmetric linear algebra on row-major Float64Array matrices, sized for
 * the local problems on extended stars (a few hundred unknowns).
 */

import { SingularError } from './errors.js'

/**
 * Solves A x = b for a symmetric positive semidefinite A with a consistent
 * right-hand side, by Cholesky with symmetric pivoting. Directions whose
 * pivot is negligible (the null space) are left at zero, so the result is the
 * component of the solution in the row space; any function of A x that does
 * not depend on the null space is therefore unique.
 *
 * @param {!Float64Array} a - n x n matrix, row-major. Not modified.
 * @param {number} n
 * @param {!Float64Array} b - Length n. Not modified.
 * @param {number=} relativeTolerance - Pivots below this fraction of the
 *   largest diagonal entry are treated as zero.
 * @return {{x: !Float64Array, rank: number, residual: number, condition: number}}
 *   The condition estimate is the ratio of the largest to the smallest accepted pivot.
 */
export function solveSemidefinite (a, n, b, relativeTolerance = 1e-11) {
  const m = Float64Array.from(a)
  const order = Array.from({ length: n }, (_, i) => i)
  let largest = 0
  for (let i = 0; i < n; i++) largest = Math.max(largest, Math.abs(m[i * n + i]))
  const threshold = relativeTolerance * largest
  let rank = 0
  let firstPivot = 0
  let lastPivot = 0
  for (let k = 0; k < n; k++) {
    let best = k
    for (let i = k + 1; i < n; i++) {
      if (m[i * n + i] > m[best * n + best]) best = i
    }
    if (best !== k) swapSymmetric(m, n, k, best, order)
    const pivot = m[k * n + k]
    if (!(pivot > threshold)) break
    rank++
    if (rank === 1) firstPivot = pivot
    lastPivot = pivot
    const root = Math.sqrt(pivot)
    m[k * n + k] = root
    for (let i = k + 1; i < n; i++) m[i * n + k] /= root
    // Keep the trailing block symmetric: the pivoting swaps full rows and columns.
    for (let j = k + 1; j < n; j++) {
      const factor = m[j * n + k]
      if (factor === 0) continue
      for (let i = j; i < n; i++) {
        const updated = m[i * n + j] - m[i * n + k] * factor
        m[i * n + j] = updated
        m[j * n + i] = updated
      }
    }
  }
  // Forward and back substitution on the leading rank x rank block.
  const y = new Float64Array(n)
  for (let i = 0; i < rank; i++) {
    let sum = b[order[i]]
    for (let k = 0; k < i; k++) sum -= m[i * n + k] * y[k]
    y[i] = sum / m[i * n + i]
  }
  const z = new Float64Array(n)
  for (let i = rank - 1; i >= 0; i--) {
    let sum = y[i]
    for (let k = i + 1; k < rank; k++) sum -= m[k * n + i] * z[k]
    z[i] = sum / m[i * n + i]
  }
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[order[i]] = z[i]
  const condition = rank === 0 ? 1 : firstPivot / lastPivot
  return { x, rank, residual: residualNorm(a, n, x, b), condition }
}

/** @private Swaps rows and columns k and p of the lower triangle. */
function swapSymmetric (m, n, k, p, order) {
  for (let i = 0; i < n; i++) {
    const t = m[k * n + i]
    m[k * n + i] = m[p * n + i]
    m[p * n + i] = t
  }
  for (let i = 0; i < n; i++) {
    const t = m[i * n + k]
    m[i * n + k] = m[i * n + p]
    m[i * n + p] = t
  }
  const o = order[k]
  order[k] = order[p]
  order[p] = o
}

/**
 * Cholesky factorization of a symmetric positive definite matrix.
 * @param {!Float64Array} a - n x n, row-major. Not modified.
 * @param {number} n
 * @return {!Float64Array} Lower-triangular factor, row-major.
 * @throws {SingularError} If the matrix is not positive definite.
 */
export function cholesky (a, n) {
  const l = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    let diagonal = a[j * n + j]
    for (let k = 0; k < j; k++) diagonal -= l[j * n + k] * l[j * n + k]
    if (!(diagonal > 0)) throw new SingularError('matrix is not positive definite')
    const root = Math.sqrt(diagonal)
    l[j * n + j] = root
    for (let i = j + 1; i < n; i++) {
      let sum = a[i * n + j]
      for (let k = 0; k < j; k++) sum -= l[i * n + k] * l[j * n + k]
      l[i * n + j] = sum / root
    }
  }
  return l
}

/**
 * Solves L L^T x = b in place for a Cholesky factor.
 * @param {!Float64Array} l
 * @param {number} n
 * @param {!Float64Array} b - Overwritten with the solution.
 */
export function choleskySolveInPlace (l, n, b) {
  for (let i = 0; i < n; i++) {
    let sum = b[i]
    for (let k = 0; k < i; k++) sum -= l[i * n + k] * b[k]
    b[i] = sum / l[i * n + i]
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]
    for (let k = i + 1; k < n; k++) sum -= l[k * n + i] * b[k]
    b[i] = sum / l[i * n + i]
  }
}

/** Euclidean norm of A x - b. */
export function residualNorm (a, n, x, b) {
  let total = 0
  for (let i = 0; i < n; i++) {
    let sum = -b[i]
    for (let j = 0; j < n; j++) sum += a[i * n + j] * x[j]
    total += sum * sum
  }
  return Math.sqrt(total)
}

/**
 * Minimum-norm solution of C x = r in the metric M: minimizes x^T M x.
 * Computes x = M^-1 C^T lambda with (C M^-1 C^T) lambda = r.
 *
 * @param {!Array<!Float64Array>} rows - The m rows of C, each of length n.
 * @param {!Float64Array} mass - n x n symmetric positive definite M.
 * @param {number} n
 * @param {!Float64Array} r - Length m; must lie in the range of C.
 * @return {{x: !Float64Array, residual: number, scale: number, condition: number}}
 *   Residual is |C x - r|; scale is |r| + |C| |x|, for a relative check;
 *   condition estimates that of C M^-1 C^T.
 * @throws {SingularError} If M is not positive definite.
 */
export function minimumNormSolve (rows, mass, n, r) {
  const m = rows.length
  const factor = cholesky(mass, n)
  // Columns of M^-1 C^T, one per constraint.
  const lifted = rows.map((row) => {
    const column = Float64Array.from(row)
    choleskySolveInPlace(factor, n, column)
    return column
  })
  const gram = new Float64Array(m * m)
  for (let i = 0; i < m; i++) {
    for (let j = i; j < m; j++) {
      let sum = 0
      const ri = rows[i]
      const lj = lifted[j]
      for (let k = 0; k < n; k++) sum += ri[k] * lj[k]
      gram[i * m + j] = sum
      gram[j * m + i] = sum
    }
  }
  const { x: lambda, condition } = solveSemidefinite(gram, m, r)
  const x = new Float64Array(n)
  for (let j = 0; j < m; j++) {
    if (lambda[j] === 0) continue
    const column = lifted[j]
    for (let k = 0; k < n; k++) x[k] += lambda[j] * column[k]
  }
  let total = 0
  let scaleSquared = 0
  for (let i = 0; i < m; i++) {
    let sum = 0
    let magnitude = Math.abs(r[i])
    for (let k = 0; k < n; k++) {
      sum += rows[i][k] * x[k]
      magnitude += Math.abs(rows[i][k] * x[k])
    }
    total += (sum - r[i]) ** 2
    scaleSquared += magnitude * magnitude
  }
  return { x, residual: Math.sqrt(total), scale: Math.sqrt(scaleSquared), condition }
}
