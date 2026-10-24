/**
 * Banded (skyline) Cholesky factorization with a reverse Cuthill-McKee
 * ordering, and the minimum-norm solve built on it. The local problems on an
 * extended star are sparse, so the profile of the reordered matrix is a small
 * fraction of a dense matrix and a factorization costs far less than the
 * O(n^3) dense one.
 */

import {SingularError} from './errors.js';

/**
 * Reverse Cuthill-McKee ordering of a graph.
 * @param {!Array<!Set<number>>} neighbours - Adjacency, without self loops.
 * @return {!Int32Array} order[newIndex] = oldIndex.
 */
export function reverseCuthillMcKee(neighbours) {
  const n = neighbours.length;
  const degree = neighbours.map((s) => s.size);
  const seen = new Uint8Array(n);
  const order = [];
  const byDegree = (a, b) => degree[a] - degree[b] || a - b;
  // A node of small degree in the last level of a breadth-first sweep.
  const peripheral = (start) => {
    const level = new Set([start]);
    let frontier = [start];
    let last = start;
    while (frontier.length) {
      last = frontier.slice().sort(byDegree)[0];
      const next = [];
      for (const v of frontier) {
        for (const w of neighbours[v]) {
          if (!level.has(w) && !seen[w]) {
            level.add(w);
            next.push(w);
          }
        }
      }
      frontier = next;
    }
    return last;
  };
  const roots = Array.from({length: n}, (_, i) => i).sort(byDegree);
  for (const root of roots) {
    if (seen[root]) continue;
    const start = peripheral(root);
    seen[start] = 1;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      order.push(v);
      const next = [...neighbours[v]].filter((w) => !seen[w]).sort(byDegree);
      for (const w of next) {
        seen[w] = 1;
        queue.push(w);
      }
    }
  }
  return Int32Array.from(order.reverse());
}

/**
 * Cholesky factorization K = L L^T of a symmetric positive definite sparse
 * matrix in profile (skyline) storage, after reordering.
 */
export class BandedCholesky {
  /**
   * @param {!Array<!Map<number, number>>} rows - Both triangles of K, one
   *     column-to-value map per row.
   * @param {!Int32Array=} order - order[new] = old; computed when omitted.
   */
  constructor(rows, order) {
    const n = rows.length;
    this.n = n;
    this.order = order ?? reverseCuthillMcKee(
        rows.map((row, i) => new Set([...row.keys()].filter((j) => j !== i))));
    const position = new Int32Array(n);
    this.order.forEach((old, i) => (position[old] = i));
    this.first = new Int32Array(n);
    this.offset = new Int32Array(n + 1);
    const lower = Array.from({length: n}, () => new Map());
    for (let old = 0; old < n; old++) {
      const i = position[old];
      let first = i;
      for (const [oldColumn, value] of rows[old]) {
        const j = position[oldColumn];
        if (j > i) continue;
        lower[i].set(j, (lower[i].get(j) ?? 0) + value);
        if (j < first) first = j;
      }
      this.first[i] = first;
    }
    for (let i = 0; i < n; i++) {
      this.offset[i + 1] = this.offset[i] + (i - this.first[i] + 1);
    }
    this.values = new Float64Array(this.offset[n]);
    for (let i = 0; i < n; i++) {
      for (const [j, value] of lower[i]) {
        this.values[this.offset[i] + j - this.first[i]] = value;
      }
    }
    this.factor();
  }

  /** @private Factors in place. */
  factor() {
    const {n, first, offset, values: l} = this;
    for (let i = 0; i < n; i++) {
      const fi = first[i];
      const oi = offset[i] - fi;
      for (let j = fi; j < i; j++) {
        const fj = first[j];
        const oj = offset[j] - fj;
        let sum = l[oi + j];
        for (let k = fj > fi ? fj : fi; k < j; k++) {
          sum -= l[oi + k] * l[oj + k];
        }
        l[oi + j] = sum / l[oj + j];
      }
      let diagonal = l[oi + i];
      for (let k = fi; k < i; k++) diagonal -= l[oi + k] * l[oi + k];
      if (!(diagonal > 0)) {
        throw new SingularError('matrix is not positive definite');
      }
      l[oi + i] = Math.sqrt(diagonal);
    }
  }

  /**
   * Solves K x = b.
   * @param {!Float64Array} b
   * @return {!Float64Array}
   */
  solve(b) {
    const {n, first, offset, values: l, order} = this;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = b[order[i]];
    for (let i = 0; i < n; i++) {
      const fi = first[i];
      const oi = offset[i] - fi;
      let sum = y[i];
      for (let k = fi; k < i; k++) sum -= l[oi + k] * y[k];
      y[i] = sum / l[oi + i];
    }
    for (let i = n - 1; i >= 0; i--) {
      const fi = first[i];
      const oi = offset[i] - fi;
      y[i] /= l[oi + i];
      const yi = y[i];
      for (let k = fi; k < i; k++) y[k] -= l[oi + k] * yi;
    }
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[order[i]] = y[i];
    return x;
  }
}

const TARGET_RESIDUAL = 1e-14;
const MAX_PASSES = 200;
const MAX_PENALTY_STEPS = 6;

/** K = M + gamma C^T C as column-to-value maps. */
function penalized(constraints, mass, gamma) {
  const n = mass.rows;
  const rows = Array.from({length: n}, () => new Map());
  for (let i = 0; i < n; i++) {
    for (let k = mass.offsets[i]; k < mass.offsets[i + 1]; k++) {
      const j = mass.indices[k];
      rows[i].set(j, (rows[i].get(j) ?? 0) + mass.values[k]);
    }
  }
  for (let r = 0; r < constraints.rows; r++) {
    const from = constraints.offsets[r];
    const to = constraints.offsets[r + 1];
    for (let a = from; a < to; a++) {
      const i = constraints.indices[a];
      for (let b = from; b < to; b++) {
        const j = constraints.indices[b];
        rows[i].set(j, (rows[i].get(j) ?? 0) +
          gamma * constraints.values[a] * constraints.values[b]);
      }
    }
  }
  return rows;
}

/**
 * Minimum-norm solution of C x = r in the metric M (minimizes x^T M x) by the
 * method of multipliers: each pass solves the banded system
 * (M + gamma C^T C) x = C^T (gamma r - lambda) and updates the multipliers
 * with the true constraint residual. The penalty gamma grows until the
 * residual falls steadily; the answer is the exact minimizer, not a penalty
 * approximation, because the multipliers absorb the penalty error.
 *
 * @param {!SparseMatrix} constraints - C, m x n.
 * @param {!SparseMatrix} mass - M, n x n, symmetric positive definite.
 * @param {!Float64Array} r - Length m, in the range of C.
 * @return {{x: !Float64Array, residual: number, scale: number,
 *     iterations: number}}
 */
export function minimumNormSolveBanded(constraints, mass, r) {
  const n = mass.rows;
  const m = constraints.rows;
  let rNorm = 0;
  for (let i = 0; i < m; i++) rNorm += r[i] * r[i];
  rNorm = Math.sqrt(rNorm);
  const x = new Float64Array(n);
  if (rNorm === 0) return {x, residual: 0, scale: 0, iterations: 0};

  let massScale = 0;
  for (const d of mass.diagonal()) massScale += d;
  massScale /= n;
  let constraintScale = 0;
  for (const v of constraints.values) constraintScale += v * v;
  constraintScale = Math.max(constraintScale / Math.max(m, 1), 1e-300);

  let gamma = massScale / constraintScale;
  let order;
  let best = x;
  let bestResidual = rNorm;
  let iterations = 0;
  const work = new Float64Array(n);
  for (let step = 0; step < MAX_PENALTY_STEPS; step++) {
    const factor = new BandedCholesky(penalized(constraints, mass, gamma),
        order);
    order = factor.order;
    const lambda = new Float64Array(m);
    const rhs = new Float64Array(m);
    let previous = Infinity;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      iterations++;
      for (let i = 0; i < m; i++) rhs[i] = gamma * r[i] - lambda[i];
      constraints.multiplyTranspose(rhs, work);
      const y = factor.solve(work);
      const cy = constraints.multiply(y);
      let norm = 0;
      for (let i = 0; i < m; i++) {
        const miss = r[i] - cy[i];
        norm += miss * miss;
        lambda[i] -= gamma * miss;
      }
      norm = Math.sqrt(norm);
      if (norm < bestResidual) {
        bestResidual = norm;
        best = y;
      }
      if (norm <= TARGET_RESIDUAL * rNorm) {
        return {x: best, residual: bestResidual, scale: rNorm, iterations};
      }
      // Too slow a fall: a larger penalty converges faster per pass.
      if (pass >= 3 && norm > 0.5 * previous) break;
      previous = norm;
    }
    gamma *= 100;
  }
  return {x: best, residual: bestResidual, scale: rNorm, iterations};
}

/**
 * Solves K x = b for a symmetric positive semidefinite sparse K and a
 * right-hand side in its range, to near machine precision: K + shift I is
 * factored by
 * banded Cholesky and the solution is refined on the true residual. The
 * iterates stay in the range of K, so the null space is never entered, and the
 * answer is the minimum-norm solution.
 *
 * @param {!SparseMatrix} matrix - K, n x n.
 * @param {!Float64Array} b - Length n, in the range of K.
 * @return {{x: !Float64Array, residual: number, scale: number,
 *     iterations: number}}
 */
export function solveSemidefiniteBanded(matrix, b) {
  const n = matrix.rows;
  let bNorm = 0;
  for (let i = 0; i < n; i++) bNorm += b[i] * b[i];
  bNorm = Math.sqrt(bNorm);
  const x = new Float64Array(n);
  if (bNorm === 0) return {x, residual: 0, scale: 0, iterations: 0};
  let scale = 0;
  for (const d of matrix.diagonal()) scale = Math.max(scale, Math.abs(d));
  const shift = 1e-9 * (scale || 1);
  const rows = Array.from({length: n}, () => new Map());
  for (let i = 0; i < n; i++) {
    for (let k = matrix.offsets[i]; k < matrix.offsets[i + 1]; k++) {
      const j = matrix.indices[k];
      rows[i].set(j, (rows[i].get(j) ?? 0) + matrix.values[k]);
    }
    rows[i].set(i, (rows[i].get(i) ?? 0) + shift);
  }
  const factor = new BandedCholesky(rows);
  const residual = Float64Array.from(b);
  let best = bNorm;
  let iterations = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    iterations++;
    const step = factor.solve(residual);
    for (let i = 0; i < n; i++) x[i] += step[i];
    const kx = matrix.multiply(x);
    let norm = 0;
    for (let i = 0; i < n; i++) {
      residual[i] = b[i] - kx[i];
      norm += residual[i] * residual[i];
    }
    norm = Math.sqrt(norm);
    if (norm <= TARGET_RESIDUAL * bNorm) {
      best = norm;
      break;
    }
    if (pass >= 3 && norm > 0.5 * best) {
      best = Math.min(best, norm);
      break;
    }
    best = Math.min(best, norm);
  }
  return {x, residual: best, scale: bNorm, iterations};
}
