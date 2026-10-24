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

/** The rows of a sparse matrix as column-to-value maps. */
function rowMaps(matrix) {
  return Array.from({length: matrix.rows}, (_, i) => {
    const row = new Map();
    for (let k = matrix.offsets[i]; k < matrix.offsets[i + 1]; k++) {
      row.set(matrix.indices[k], (row.get(matrix.indices[k]) ?? 0) +
        matrix.values[k]);
    }
    return row;
  });
}

const dotProduct = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

/** Passes of conjugate gradients, and restarts from the true residual. */
const MAX_CG = 400;
const MAX_RESTARTS = 4;

/**
 * Minimum-norm solution of C x = r in the metric M (minimizes x^T M x): the
 * solution x = M^-1 C^T lambda of the dual problem S lambda = r with the
 * Schur complement S = C M^-1 C^T, found by preconditioned conjugate
 * gradients on lambda.
 *
 * S is applied with a banded Cholesky factorization of M alone, which is well
 * conditioned, so x = M^-1 C^T lambda satisfies the optimality condition
 * M x = C^T lambda to rounding error at every iterate: the iteration only has
 * to drive the constraint residual down. The preconditioner is the proximal
 * map gamma (I + gamma S)^-1 = gamma (I - gamma C K^-1 C^T) with
 * K = M + gamma C^T C, which is accurate for the eigenvalues of S above
 * 1 / gamma and needs no accuracy of its own. Rank-deficient C is fine: the
 * multipliers stay in the range of C and x is unique. The iteration keeps its
 * best iterate and restarts from the true residual if rounding stalls it.
 *
 * @param {!SparseMatrix} constraints - C, m x n.
 * @param {!SparseMatrix} mass - M, n x n, symmetric positive definite.
 * @param {!Float64Array} r - Length m, in the range of C.
 * @return {{x: !Float64Array, residual: number, scale: number,
 *     iterations: number, stationarity: number, dualityGap: number,
 *     entries: number}} The solution and its certificate: `residual` is
 *     |Cx - r|, `stationarity` the relative size of M x - C' lambda for the
 *     returned multipliers, `dualityGap` the relative gap between the
 *     objective and the dual bound they give, and `entries` the number of
 *     stored factor entries. A feasible x with small stationarity is the
 *     minimizer.
 */
export function minimumNormSolveBanded(constraints, mass, r) {
  const n = mass.rows;
  const m = constraints.rows;
  const rNorm = Math.sqrt(dotProduct(r, r));
  const zero = new Float64Array(n);
  if (rNorm === 0) {
    return {x: zero, residual: 0, scale: 0, iterations: 0, stationarity: 0,
      dualityGap: 0, entries: 0};
  }
  const massFactor = new SparseCholesky(rowMaps(mass));
  let massScale = 0;
  for (const d of mass.diagonal()) massScale += d;
  massScale /= n;
  let constraintScale = 0;
  for (const v of constraints.values) constraintScale += v * v;
  constraintScale = Math.max(constraintScale / Math.max(m, 1), 1e-300);
  const gamma = massScale / constraintScale;
  const penaltyFactor = new SparseCholesky(
      penalized(constraints, mass, gamma));

  const lift = (lambda) => massFactor.solve(
      constraints.multiplyTranspose(lambda, new Float64Array(n)));
  const apply = (p) => constraints.multiply(lift(p));
  const precondition = (rho) => {
    const w = penaltyFactor.solve(
        constraints.multiplyTranspose(rho, new Float64Array(n)));
    const cw = constraints.multiply(w);
    return Float64Array.from(rho, (q, i) => gamma * (q - gamma * cw[i]));
  };
  const residualOf = (lambda) => {
    const cy = constraints.multiply(lift(lambda));
    return Float64Array.from(r, (q, i) => q - cy[i]);
  };

  let lambda = new Float64Array(m);
  let best = lambda;
  let residual = Float64Array.from(r);
  let bestNorm = rNorm;
  let iterations = 0;
  for (let restart = 0; restart <= MAX_RESTARTS; restart++) {
    residual = residualOf(best);
    const start = Math.sqrt(dotProduct(residual, residual));
    bestNorm = start;
    if (start <= TARGET_RESIDUAL * rNorm) break;
    lambda = Float64Array.from(best);
    let z = precondition(residual);
    const p = Float64Array.from(z);
    let rz = dotProduct(residual, z);
    let improved = false;
    for (let pass = 0; pass < MAX_CG; pass++) {
      iterations++;
      const sp = apply(p);
      const curvature = dotProduct(p, sp);
      if (!(curvature > 0)) break;
      const alpha = rz / curvature;
      for (let i = 0; i < m; i++) {
        lambda[i] += alpha * p[i];
        residual[i] -= alpha * sp[i];
      }
      const norm = Math.sqrt(dotProduct(residual, residual));
      if (norm < bestNorm) {
        bestNorm = norm;
        best = Float64Array.from(lambda);
        improved = true;
      }
      if (norm <= TARGET_RESIDUAL * rNorm || norm > 1e3 * bestNorm) break;
      z = precondition(residual);
      const next = dotProduct(residual, z);
      const beta = next / rz;
      rz = next;
      for (let i = 0; i < m; i++) p[i] = z[i] + beta * p[i];
    }
    if (!improved) break;
  }

  const x = lift(best);
  const cx = constraints.multiply(x);
  let miss = 0;
  for (let i = 0; i < m; i++) miss += (r[i] - cx[i]) ** 2;
  // Certificate with the multipliers lambda: M x - C' lambda should vanish.
  const mx = mass.multiply(x);
  const ctl = constraints.multiplyTranspose(best, new Float64Array(n));
  let stationary = 0;
  let size = 0;
  let energy = 0;
  let eDotX = 0;
  for (let i = 0; i < n; i++) {
    const e = mx[i] - ctl[i];
    stationary += e * e;
    size += mx[i] * mx[i];
    energy += x[i] * mx[i];
    eDotX += e * x[i];
  }
  let pairing = 0;
  for (let i = 0; i < m; i++) pairing += best[i] * (r[i] - cx[i]);
  return {
    x,
    residual: Math.sqrt(miss),
    scale: rNorm,
    iterations,
    stationarity: Math.sqrt(stationary / Math.max(size, 1e-300)),
    dualityGap: Math.abs(pairing - eDotX) / Math.max(energy, 1e-300),
    entries: massFactor.entries + penaltyFactor.entries,
  };
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
  const factor = new SparseCholesky(rows);
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

/**
 * The columns of the Cholesky factor in a given elimination order: for each
 * vertex, its neighbours at the time of its elimination (old numbers). Built
 * with the elimination tree: the structure of a column is the part of its
 * row of the matrix beyond the diagonal, together with the structures of its
 * children.
 * @param {!Array<(!Set<number>|!Array<number>)>} neighbours
 * @param {!Int32Array} order `order[k]` is the k-th vertex eliminated.
 * @return {!Array<!Array<number>>}
 */
export function factorColumns(neighbours, order) {
  const n = order.length;
  const position = new Int32Array(n);
  order.forEach((v, k) => (position[v] = k));
  const children = Array.from({length: n}, () => []);
  const structure = new Array(n);
  const mark = new Int32Array(n).fill(-1);
  for (let j = 0; j < n; j++) {
    const list = [];
    mark[j] = j;
    for (const u of neighbours[order[j]]) {
      const p = position[u];
      if (p > j && mark[p] !== j) {
        mark[p] = j;
        list.push(p);
      }
    }
    for (const c of children[j]) {
      for (const p of structure[c]) {
        if (p !== j && mark[p] !== j) {
          mark[p] = j;
          list.push(p);
        }
      }
    }
    structure[j] = list;
    if (list.length) {
      let parent = n;
      for (const p of list) if (p < parent) parent = p;
      children[parent].push(j);
    }
  }
  return structure.map((list) => list.map((p) => order[p]));
}

/**
 * The elimination order of the minimum-degree method on a weighted graph, by
 * the quotient-graph method: an eliminated vertex becomes an element standing
 * for the clique of its neighbours, so the clique is never formed edge by
 * edge; degrees are approximate external degrees (Amestoy, Davis and Duff)
 * counted with the weights of the vertices.
 * @private
 */
function weightedMinimumDegree(neighbours, weight) {
  const n = neighbours.length;
  const variables = neighbours.map((s) => Array.from(s));
  const elementsOf = Array.from({length: n}, () => []);
  const members = new Array(n).fill(null);
  const memberWeight = new Float64Array(n);
  const alive = new Uint8Array(n).fill(1);
  const degree = new Float64Array(n);
  const seen = new Int32Array(n);
  const inside = new Int32Array(n);
  const counted = new Int32Array(n);
  const outside = new Float64Array(n);
  let stamp = 0;
  let remaining = 0;
  for (let v = 0; v < n; v++) remaining += weight[v];
  // Binary min-heap of [degree, vertex] with stale entries skipped.
  const heap = [];
  const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  const push = (d, v) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(heap[i], heap[parent])) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        let best = i;
        if (l < heap.length && less(heap[l], heap[best])) best = l;
        if (l + 1 < heap.length && less(heap[l + 1], heap[best])) best = l + 1;
        if (best === i) break;
        [heap[best], heap[i]] = [heap[i], heap[best]];
        i = best;
      }
    }
    return top;
  };
  for (let v = 0; v < n; v++) {
    let d = 0;
    for (const u of variables[v]) d += weight[u];
    degree[v] = d;
    push(d, v);
  }
  const order = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let v;
    for (;;) {
      const [d, candidate] = pop();
      if (alive[candidate] && degree[candidate] === d) {
        v = candidate;
        break;
      }
    }
    // The neighbours of v: its variables and the variables of its elements,
    // which are absorbed into the new element v.
    stamp++;
    seen[v] = stamp;
    const reach = [];
    let reachWeight = 0;
    for (const u of variables[v]) {
      if (alive[u] && seen[u] !== stamp) {
        seen[u] = stamp;
        reach.push(u);
        reachWeight += weight[u];
      }
    }
    for (const e of elementsOf[v]) {
      if (members[e] === null) continue;
      for (const u of members[e]) {
        if (alive[u] && seen[u] !== stamp) {
          seen[u] = stamp;
          reach.push(u);
          reachWeight += weight[u];
        }
      }
      members[e] = null;
    }
    alive[v] = 0;
    remaining -= weight[v];
    order[k] = v;
    members[v] = reach;
    memberWeight[v] = reachWeight;
    variables[v] = null;
    elementsOf[v] = null;
    for (const u of reach) inside[u] = k + 1;
    for (const u of reach) {
      // Edges inside the new clique, and absorbed elements, are redundant.
      variables[u] = variables[u].filter(
          (x) => alive[x] && inside[x] !== k + 1);
      const kept = elementsOf[u].filter((e) => members[e] !== null);
      kept.push(v);
      elementsOf[u] = kept;
    }
    // The weight of every other element that lies outside the new one.
    for (const u of reach) {
      for (const e of elementsOf[u]) {
        if (e === v) continue;
        if (counted[e] !== k + 1) {
          counted[e] = k + 1;
          outside[e] = memberWeight[e];
        }
        outside[e] -= weight[u];
      }
    }
    for (const u of reach) {
      let d = reachWeight - weight[u];
      for (const x of variables[u]) d += weight[x];
      for (const e of elementsOf[u]) if (e !== v) d += outside[e];
      d = Math.min(d, remaining - weight[u]);
      degree[u] = d;
      push(d, u);
    }
  }
  return order;
}

/**
 * Minimum-degree ordering of a graph. Vertices with identical closed
 * neighbourhoods (the degrees of freedom of one mesh entity, typically) are
 * merged and eliminated together, which shrinks the graph the ordering has to
 * work on several times over; the columns of the factor come from the final
 * order.
 * @param {!Array<!Set<number>>} neighbours - Adjacency, without self loops.
 * @return {{order: !Int32Array, columns: !Array<!Array<number>>}} `order[k]`
 *     is the k-th vertex eliminated; `columns[k]` its neighbours then (old
 *     numbers).
 */
export function minimumDegreeOrder(neighbours) {
  const n = neighbours.length;
  const groupOf = new Int32Array(n);
  const byKey = new Map();
  const groups = [];
  for (let v = 0; v < n; v++) {
    const key = [...neighbours[v], v].sort((p, q) => p - q).join(',');
    let g = byKey.get(key);
    if (g === undefined) {
      g = groups.length;
      byKey.set(key, g);
      groups.push([]);
    }
    groups[g].push(v);
    groupOf[v] = g;
  }
  const compressed = groups.map((members, g) => {
    const set = new Set();
    for (const u of neighbours[members[0]]) {
      if (groupOf[u] !== g) set.add(groupOf[u]);
    }
    return set;
  });
  const weight = Float64Array.from(groups, (members) => members.length);
  const groupOrder = weightedMinimumDegree(compressed, weight);
  const order = Int32Array.from(
      Array.from(groupOrder).flatMap((g) => groups[g]));
  return {order, columns: factorColumns(neighbours, order)};
}

/**
 * Sparse Cholesky factorization K = P' L L' P with a minimum-degree
 * permutation P: compressed-column storage of L, the elimination tree, and an
 * up-looking numeric phase (Davis, Direct Methods for Sparse Linear Systems,
 * Alg. 4.2). The factor has the fill of the ordering and nothing else, which
 * for the local problems is a small fraction of a skyline's profile.
 */
export class SparseCholesky {
  /**
   * @param {!Array<!Map<number, number>>} rows - Both triangles of K.
   */
  constructor(rows) {
    const n = rows.length;
    this.n = n;
    const adjacency = rows.map((row, i) => new Set(
        [...row.keys()].filter((j) => j !== i)));
    const {order, columns} = minimumDegreeOrder(adjacency);
    this.order = order;
    const position = new Int32Array(n);
    order.forEach((old, k) => (position[old] = k));
    // Column structure of L from the elimination, in new numbers.
    const parent = new Int32Array(n).fill(-1);
    this.pointers = new Int32Array(n + 1);
    for (let k = 0; k < n; k++) {
      let first = n;
      for (const old of columns[k]) first = Math.min(first, position[old]);
      parent[k] = first === n ? -1 : first;
      this.pointers[k + 1] = this.pointers[k] + 1 + columns[k].length;
    }
    this.parent = parent;
    this.rowIndex = new Int32Array(this.pointers[n]);
    this.values = new Float64Array(this.pointers[n]);
    // The upper triangle of the permuted matrix, by column.
    const upper = Array.from({length: n}, () => []);
    const diagonal = new Float64Array(n);
    rows.forEach((row, old) => {
      const i = position[old];
      for (const [oldColumn, value] of row) {
        const j = position[oldColumn];
        if (j === i) diagonal[i] += value;
        else if (i < j) upper[j].push([i, value]);
      }
    });
    this.factor(upper, diagonal);
  }

  /** @private Up-looking numeric factorization. */
  factor(upper, diagonal) {
    const {n, parent, pointers: lp, rowIndex: li, values: lx} = this;
    const filled = new Int32Array(n);
    for (let k = 0; k < n; k++) filled[k] = lp[k];
    const x = new Float64Array(n);
    const mark = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    const path = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      // Pattern of row k of L, in topological order, and the scattered
      // column k of K.
      let top = n;
      mark[k] = k;
      x[k] = diagonal[k];
      for (const [i0, value] of upper[k]) {
        x[i0] += value;
        let length = 0;
        let i = i0;
        while (mark[i] !== k) {
          path[length++] = i;
          mark[i] = k;
          i = parent[i];
        }
        while (length > 0) stack[--top] = path[--length];
      }
      let d = x[k];
      x[k] = 0;
      for (; top < n; top++) {
        const i = stack[top];
        const lki = x[i] / lx[lp[i]];
        x[i] = 0;
        for (let p = lp[i] + 1; p < filled[i]; p++) {
          x[li[p]] -= lx[p] * lki;
        }
        d -= lki * lki;
        const p = filled[i]++;
        li[p] = k;
        lx[p] = lki;
      }
      if (!(d > 0)) throw new SingularError('matrix is not positive definite');
      const p = filled[k]++;
      li[p] = k;
      lx[p] = Math.sqrt(d);
    }
  }

  /** The number of stored entries of L. */
  get entries() {
    return this.values.length;
  }

  /**
   * Solves K x = b.
   * @param {!Float64Array} b
   * @return {!Float64Array}
   */
  solve(b) {
    const {n, order, pointers: lp, rowIndex: li, values: lx} = this;
    const y = new Float64Array(n);
    for (let k = 0; k < n; k++) y[k] = b[order[k]];
    for (let j = 0; j < n; j++) {
      y[j] /= lx[lp[j]];
      const yj = y[j];
      for (let p = lp[j] + 1; p < lp[j + 1]; p++) y[li[p]] -= lx[p] * yj;
    }
    for (let j = n - 1; j >= 0; j--) {
      let sum = y[j];
      for (let p = lp[j] + 1; p < lp[j + 1]; p++) sum -= lx[p] * y[li[p]];
      y[j] = sum / lx[lp[j]];
    }
    const x = new Float64Array(n);
    for (let k = 0; k < n; k++) x[order[k]] = y[k];
    return x;
  }
}
