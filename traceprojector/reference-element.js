/**
 * Canonical degrees of freedom of P_r^- Lambda^k (Arnold, Falk, Winther) and
 * the dual basis on the reference tetrahedron.
 *
 * For each sub-simplex tau of dimension m with k <= m <= r + k - 1 the degrees
 * of freedom are the moments of the pull-back of the form to tau against every
 * monomial of degree at most r + k - m - 1 (times each component of a k-form
 * on tau). The pull-back uses the vertices of tau in increasing order, so two
 * cells sharing tau compute identical functionals and the global space is
 * conforming.
 */

import {ValidateError} from './errors.js';
import {gaussLegendre, tetrahedronRule} from './simplicial-complex.js';
import {formSpace, Polynomial} from './polynomial-forms.js';

const REFERENCE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];

const sub = (a, b) => a.map((q, i) => q - b[i]);
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Binomial coefficient. */
function choose(n, k) {
  let out = 1;
  for (let i = 1; i <= k; i++) out = out * (n - k + i) / i;
  return Math.round(out);
}

/** Exponent tuples of m variables with total degree at most d. */
function monomials(m, d) {
  if (m === 0) return [[]];
  const out = [];
  const walk = (prefix, left, slots) => {
    if (slots === 1) {
      for (let a = 0; a <= left; a++) out.push([...prefix, a]);
      return;
    }
    for (let a = 0; a <= left; a++) walk([...prefix, a], left - a, slots - 1);
  };
  walk([], d, m);
  return out;
}

/** Quadrature on the reference simplex of dimension m (weights sum 1/m!). */
function referenceRule(m, order) {
  if (m === 0) return [{s: [], weight: 1}];
  if (m === 1) {
    const {nodes, weights} = gaussLegendre(order);
    return nodes.map((x, i) => ({s: [x], weight: weights[i]}));
  }
  if (m === 2) {
    const {nodes, weights} = gaussLegendre(order);
    const out = [];
    for (let i = 0; i < order; i++) {
      for (let j = 0; j < order; j++) {
        const s1 = nodes[i];
        out.push({
          s: [s1, nodes[j] * (1 - s1)],
          weight: weights[i] * weights[j] * (1 - s1),
        });
      }
    }
    return out;
  }
  return tetrahedronRule(REFERENCE, order).map(({x, weight}) => (
    {s: x, weight}));
}

/** Number of components of a k-form on R^m. */
export const components = (m, k) => choose(m, k);

/**
 * The sub-simplices that carry degrees of freedom of P_r^- Lambda^k, with the
 * local vertex numbers (increasing) and the test degree.
 * @param {number} r
 * @param {number} k
 * @return {!Array<{vertices: number[], dimension: number, degree: number}>}
 */
export function carriers(r, k) {
  const out = [];
  for (let mask = 1; mask < 16; mask++) {
    const vertices = [0, 1, 2, 3].filter((v) => mask & (1 << v));
    const m = vertices.length - 1;
    if (m < k || m > r + k - 1) continue;
    out.push({vertices, dimension: m, degree: r + k - m - 1});
  }
  return out.sort((a, b) => a.dimension - b.dimension ||
    a.vertices.join() .localeCompare(b.vertices.join()));
}

/** Number of degrees of freedom attached to one carrier. */
export function countOn(carrier, k) {
  const {dimension: m, degree} = carrier;
  return components(m, k) * monomials(m, degree).length;
}

/**
 * Evaluates the degrees of freedom of one carrier on a field.
 * @param {number} k Form degree.
 * @param {{vertices: number[], dimension: number, degree: number}} carrier
 * @param {number[][]} points The four vertices of the cell, in order.
 * @param {function(number[]): (number|number[])} u The field, with a scalar
 *     value for k = 0, 3 and a triple for k = 1, 2.
 * @param {number} order Gauss points per direction.
 * @return {number[]} The moments, ordered by test component then monomial.
 */
export function moments(k, carrier, points, u, order) {
  const {dimension: m, degree} = carrier;
  const corners = carrier.vertices.map((v) => points[v]);
  const tangents = corners.slice(1).map((c) => sub(c, corners[0]));
  const tests = monomials(m, degree);
  const count = components(m, k);
  const out = new Array(count * tests.length).fill(0);
  let detJ = 1;
  let inverse = null;
  if (m === 3 && k >= 2) {
    detJ = dot(tangents[0], cross(tangents[1], tangents[2]));
    // Rows of J^{-1}: cross products of the other two tangents over det.
    inverse = [
      cross(tangents[1], tangents[2]),
      cross(tangents[2], tangents[0]),
      cross(tangents[0], tangents[1]),
    ].map((row) => row.map((q) => q / detJ));
  }
  for (const {s, weight} of referenceRule(m, order)) {
    const x = corners[0].map((q, i) => q +
      tangents.reduce((acc, t, j) => acc + s[j] * t[i], 0));
    const value = u(x);
    let pulled;
    if (k === 0) {
      pulled = [value];
    } else if (k === 1) {
      pulled = tangents.map((t) => dot(value, t));
    } else if (k === 2 && m === 2) {
      pulled = [dot(value, cross(tangents[0], tangents[1]))];
    } else if (k === 2) {
      pulled = inverse.map((row) => detJ * dot(row, value));
    } else {
      pulled = [detJ * value];
    }
    tests.forEach((a, t) => {
      const monomial = a.reduce((acc, e, i) => acc * s[i] ** e, 1);
      pulled.forEach((q, c) => {
        out[c * tests.length + t] += weight * q * monomial;
      });
    });
  }
  return out;
}

/** Evaluates a polynomial form (scalar or triple) at x. */
const evaluate = (form, x) => (Array.isArray(form) ?
  form.map((p) => p.evaluate(x)) : form.evaluate(x));

const cache = new Map();

/**
 * The dual basis of P_r^- Lambda^k on the reference tetrahedron: polynomial
 * forms psi_i with dof_j(psi_i) = delta_ij, with the dofs ordered by carrier
 * (see `carriers`) then by `moments`.
 * @param {number} r Degree, at least 1.
 * @param {number} k Form degree.
 * @return {{basis: !Array, carriers: !Array, offsets: number[]}}
 */
export function referenceBasis(r, k) {
  const id = `${r}_${k}`;
  if (cache.has(id)) return cache.get(id);
  const space = formSpace(r, k);
  const list = carriers(r, k);
  const order = r + 3;
  const offsets = [0];
  list.forEach((c) => offsets.push(offsets[offsets.length - 1] +
    countOn(c, k)));
  const n = space.length;
  if (offsets[offsets.length - 1] !== n) {
    throw new ValidateError(
        `degree of freedom count ${offsets[offsets.length - 1]} != ${n}`);
  }
  // D[a][b] = dof_a(space_b).
  const matrix = Array.from({length: n}, () => new Float64Array(n));
  space.forEach((form, b) => {
    list.forEach((c, ci) => {
      moments(k, c, REFERENCE, (x) => evaluate(form, x), order)
          .forEach((value, t) => (matrix[offsets[ci] + t][b] = value));
    });
  });
  // psi_i = sum_b C[i][b] space_b with C D^T = I, so C = D^-T.
  const inverseOfTranspose = invert(matrix.map(
      (_, a) => Float64Array.from(matrix, (row) => row[a])));
  const basis = Array.from({length: n}, (_, i) => combine(
      space, inverseOfTranspose[i], k));
  const result = {basis, carriers: list, offsets};
  cache.set(id, result);
  return result;
}

/** Gauss-Jordan inverse of a dense square matrix with partial pivoting. */
function invert(a) {
  const n = a.length;
  const work = a.map((row, i) => {
    const r = new Float64Array(2 * n);
    r.set(row);
    r[n + i] = 1;
    return r;
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(work[row][col]) > Math.abs(work[pivot][col])) pivot = row;
    }
    if (Math.abs(work[pivot][col]) < 1e-13) {
      throw new ValidateError('the degrees of freedom are not unisolvent');
    }
    [work[col], work[pivot]] = [work[pivot], work[col]];
    const scale = work[col][col];
    for (let j = 0; j < 2 * n; j++) work[col][j] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = work[row][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) work[row][j] -= factor * work[col][j];
    }
  }
  return work.map((row) => row.slice(n));
}

/** Linear combination of polynomial forms. */
function combine(space, weights, k) {
  const zero = () => Polynomial.zero();
  const vector = k === 1 || k === 2;
  let out = vector ? [zero(), zero(), zero()] : zero();
  space.forEach((form, b) => {
    const w = weights[b];
    if (Math.abs(w) < 1e-15) return;
    out = vector ?
      out.map((p, i) => p.add(form[i].scale(w))) :
      out.add(form.scale(w));
  });
  return out;
}
