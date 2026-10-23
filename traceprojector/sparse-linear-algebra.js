/**
 * Sparse symmetric linear algebra for the local problems on large extended
 * stars: compressed sparse rows and conjugate gradients, matrix-free.
 */

/**
 * Compressed sparse row matrix.
 */
export class SparseMatrix {
  /**
   * @param {number} rows
   * @param {number} columns
   * @param {!Array<!Map<number, number>>} entries - One column-to-value map per row.
   */
  constructor (rows, columns, entries) {
    this.rows = rows
    this.columns = columns
    this.offsets = new Int32Array(rows + 1)
    let count = 0
    for (let i = 0; i < rows; i++) {
      count += entries[i].size
      this.offsets[i + 1] = count
    }
    this.indices = new Int32Array(count)
    this.values = new Float64Array(count)
    let k = 0
    for (let i = 0; i < rows; i++) {
      for (const [j, v] of entries[i]) {
        this.indices[k] = j
        this.values[k] = v
        k++
      }
    }
  }

  /** y = A x */
  multiply (x, y = new Float64Array(this.rows)) {
    for (let i = 0; i < this.rows; i++) {
      let sum = 0
      for (let k = this.offsets[i]; k < this.offsets[i + 1]; k++) {
        sum += this.values[k] * x[this.indices[k]]
      }
      y[i] = sum
    }
    return y
  }

  /** y = A^T x */
  multiplyTranspose (x, y = new Float64Array(this.columns)) {
    y.fill(0)
    for (let i = 0; i < this.rows; i++) {
      const xi = x[i]
      if (xi === 0) continue
      for (let k = this.offsets[i]; k < this.offsets[i + 1]; k++) {
        y[this.indices[k]] += this.values[k] * xi
      }
    }
    return y
  }

  /** Diagonal of a square matrix. */
  diagonal () {
    const d = new Float64Array(this.rows)
    for (let i = 0; i < this.rows; i++) {
      for (let k = this.offsets[i]; k < this.offsets[i + 1]; k++) {
        if (this.indices[k] === i) d[i] += this.values[k]
      }
    }
    return d
  }
}

/** Curvature below this fraction of the initial curvature per unit norm is breakdown. */
const BREAKDOWN_RATIO = 1e-20

function dotProduct (a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Preconditioned conjugate gradients for a symmetric positive semidefinite
 * operator with a consistent right-hand side. Started from zero, the
 * iterates stay in the range of the operator.
 *
 * @param {function(!Float64Array, !Float64Array): void} apply - Writes A x into the second argument.
 * @param {!Float64Array} b
 * @param {{tolerance: number, maxIterations: number, inverseDiagonal: (!Float64Array|undefined)}} options
 * @return {{x: !Float64Array, iterations: number, relativeResidual: number}}
 */
export function conjugateGradient (apply, b, options) {
  const n = b.length
  const x = new Float64Array(n)
  const r = Float64Array.from(b)
  const bNorm = Math.sqrt(dotProduct(b, b))
  if (bNorm === 0) return { x, iterations: 0, relativeResidual: 0 }
  const precondition = (v, out) => {
    if (options.inverseDiagonal) for (let i = 0; i < n; i++) out[i] = v[i] * options.inverseDiagonal[i]
    else out.set(v)
  }
  const z = new Float64Array(n)
  precondition(r, z)
  const p = Float64Array.from(z)
  const ap = new Float64Array(n)
  let rz = dotProduct(r, z)
  let iterations = 0
  let relativeResidual = 1
  let firstCurvaturePerNorm = 0
  // Past convergence, rounding noise can make the recurrence residual grow
  // again, so the best iterate seen is the one returned.
  let best = Float64Array.from(x)
  let bestResidual = 1
  let sinceImprovement = 0
  while (iterations < options.maxIterations) {
    apply(p, ap)
    const curvature = dotProduct(p, ap)
    // A search direction in (or numerically indistinguishable from) the null
    // space has no curvature; stepping along it would amplify rounding noise.
    if (iterations === 0) firstCurvaturePerNorm = curvature / dotProduct(p, p)
    if (!(curvature > BREAKDOWN_RATIO * firstCurvaturePerNorm * dotProduct(p, p))) break
    const alpha = rz / curvature
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i]
      r[i] -= alpha * ap[i]
    }
    iterations++
    relativeResidual = Math.sqrt(dotProduct(r, r)) / bNorm
    if (relativeResidual < bestResidual) {
      bestResidual = relativeResidual
      best.set(x)
      sinceImprovement = 0
    } else if (++sinceImprovement > STALL_ITERATIONS) {
      break
    }
    if (relativeResidual <= options.tolerance) break
    precondition(r, z)
    const rzNext = dotProduct(r, z)
    const beta = rzNext / rz
    rz = rzNext
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i]
  }
  return { x: best, iterations, relativeResidual: bestResidual }
}

/** Iterations without a new best residual before conjugate gradients gives up. */
const STALL_ITERATIONS = 100

/**
 * Solves A x = b for a symmetric positive semidefinite A and a consistent
 * right-hand side to near machine precision: conjugate gradients restarted on
 * the true residual (iterative refinement), because a single run stagnates
 * on ill-conditioned systems.
 *
 * @param {function(!Float64Array, !Float64Array): void} apply - Writes A x into the second argument.
 * @param {!Float64Array} b
 * @param {{maxIterations: number, inverseDiagonal: (!Float64Array|undefined)}} options
 * @return {{x: !Float64Array, relativeResidual: number, iterations: number}}
 */
export function solveConsistent (apply, b, options) {
  const n = b.length
  const bNorm = Math.sqrt(dotProduct(b, b))
  const x = new Float64Array(n)
  if (bNorm === 0) return { x, relativeResidual: 0, iterations: 0 }
  const residual = Float64Array.from(b)
  const ax = new Float64Array(n)
  let iterations = 0
  let relativeResidual = 1
  for (let pass = 0; pass < MAX_REFINEMENT_PASSES && relativeResidual > TARGET_RESIDUAL; pass++) {
    const step = conjugateGradient(apply, residual, {
      tolerance: TARGET_RESIDUAL, maxIterations: options.maxIterations, inverseDiagonal: options.inverseDiagonal
    })
    iterations += step.iterations
    const candidate = Float64Array.from(x)
    for (let i = 0; i < n; i++) candidate[i] += step.x[i]
    apply(candidate, ax)
    let norm = 0
    const next = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      next[i] = b[i] - ax[i]
      norm += next[i] * next[i]
    }
    const candidateResidual = Math.sqrt(norm) / bNorm
    if (!(candidateResidual < 0.9 * relativeResidual)) break // stagnated: keep the best iterate
    x.set(candidate)
    residual.set(next)
    relativeResidual = candidateResidual
  }
  return { x, relativeResidual, iterations }
}

const MAX_REFINEMENT_PASSES = 8
const TARGET_RESIDUAL = 1e-14

/**
 * Minimum-norm solution of C x = r in the metric M (minimizes x^T M x), for a
 * sparse C and sparse symmetric positive definite M: x = M^-1 C^T lambda with
 * (C M^-1 C^T) lambda = r, solved by nested conjugate gradients.
 *
 * @param {!SparseMatrix} constraints - C, m x n.
 * @param {!SparseMatrix} mass - M, n x n.
 * @param {!Float64Array} r - Length m, in the range of C.
 * @return {{x: !Float64Array, residual: number, scale: number, iterations: number}}
 */
export function minimumNormSolveSparse (constraints, mass, r) {
  const n = mass.rows
  const m = constraints.rows
  const massDiagonal = mass.diagonal()
  const inner = (rhs) => solveConsistent(
    (v, out) => mass.multiply(v, out), rhs,
    { maxIterations: 20 * n + 100, inverseDiagonal: massDiagonal.map((d) => 1 / d) }).x
  const workN = new Float64Array(n)
  const apply = (v, out) => {
    constraints.multiplyTranspose(v, workN)
    constraints.multiply(inner(workN), out)
  }
  // Row scaling: the diagonal of C M^-1 C^T, approximated with the diagonal of M.
  const scaling = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    let sum = 0
    for (let k = constraints.offsets[i]; k < constraints.offsets[i + 1]; k++) {
      sum += constraints.values[k] ** 2 / massDiagonal[constraints.indices[k]]
    }
    scaling[i] = sum > 0 ? 1 / sum : 1
  }

  // Refinement on the true constraint residual r - C x, computed with the
  // exact C. The conditioning of C M^-1 C^T limits how accurately each
  // correction is found, but not how small the residual of x finally gets.
  let rNorm = 0
  for (let i = 0; i < m; i++) rNorm += r[i] * r[i]
  rNorm = Math.sqrt(rNorm)
  const x = new Float64Array(n)
  let residual = Float64Array.from(r)
  let residualNorm = rNorm
  let iterations = 0
  for (let pass = 0; pass < MAX_REFINEMENT_PASSES && residualNorm > TARGET_RESIDUAL * rNorm; pass++) {
    const step = conjugateGradient(apply, residual,
      { tolerance: 1e-12, maxIterations: 20 * m + 100, inverseDiagonal: scaling })
    iterations += step.iterations
    const correction = inner(constraints.multiplyTranspose(step.x, new Float64Array(n)))
    const candidate = Float64Array.from(x)
    for (let i = 0; i < n; i++) candidate[i] += correction[i]
    const cx = constraints.multiply(candidate)
    let norm = 0
    const next = new Float64Array(m)
    for (let i = 0; i < m; i++) {
      next[i] = r[i] - cx[i]
      norm += next[i] * next[i]
    }
    norm = Math.sqrt(norm)
    if (!(norm < 0.9 * residualNorm)) break // stagnated: keep the best iterate
    x.set(candidate)
    residual = next
    residualNorm = norm
  }
  return { x, residual: residualNorm, scale: rNorm, iterations }
}
