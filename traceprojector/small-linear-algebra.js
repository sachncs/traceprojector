/**
 * Dense helpers for the small, well-scaled matrices of the reference-element
 * constructions: null spaces, independent subsets and Gram-Schmidt in a given
 * inner product.
 */

const TOLERANCE = 1e-9;

/**
 * A basis of {x : rows x = 0}, by Gauss-Jordan elimination with full
 * pivoting.
 * @param {!Array<!Array<number>>} rows Constraints, each of length n.
 * @param {number} n Number of unknowns.
 * @param {number=} tolerance Entries below this are treated as zero.
 * @return {!Array<!Array<number>>} Basis vectors of length n.
 */
export function nullspace(rows, n, tolerance = TOLERANCE) {
  const a = rows.map((r) => Array.from(r));
  const pivotColumns = [];
  let row = 0;
  for (let step = 0; step < n && row < a.length; step++) {
    let best = tolerance;
    let at = -1;
    let column = -1;
    for (let i = row; i < a.length; i++) {
      for (let j = 0; j < n; j++) {
        if (pivotColumns.includes(j)) continue;
        if (Math.abs(a[i][j]) > best) {
          best = Math.abs(a[i][j]);
          at = i;
          column = j;
        }
      }
    }
    if (at < 0) break;
    [a[row], a[at]] = [a[at], a[row]];
    const scale = a[row][column];
    a[row] = a[row].map((q) => q / scale);
    for (let i = 0; i < a.length; i++) {
      if (i === row) continue;
      const factor = a[i][column];
      if (factor === 0) continue;
      a[i] = a[i].map((q, j) => q - factor * a[row][j]);
    }
    pivotColumns.push(column);
    row++;
  }
  const free = Array.from({length: n}, (_, j) => j)
      .filter((j) => !pivotColumns.includes(j));
  return free.map((f) => {
    const x = new Array(n).fill(0);
    x[f] = 1;
    pivotColumns.forEach((column, i) => {
      x[column] = -a[i][f];
    });
    return x;
  });
}

/**
 * Indices of a maximal linearly independent subset of the vectors, taken in
 * order.
 */
export function independentSubset(vectors, tolerance = TOLERANCE) {
  const basis = [];
  const keep = [];
  vectors.forEach((v, index) => {
    const w = Array.from(v);
    for (const b of basis) {
      const factor = w.reduce((s, q, j) => s + q * b[j], 0);
      for (let j = 0; j < w.length; j++) w[j] -= factor * b[j];
    }
    const norm = Math.hypot(...w);
    if (norm > tolerance * Math.max(1, Math.hypot(...v))) {
      basis.push(w.map((q) => q / norm));
      keep.push(index);
    }
  });
  return keep;
}

/**
 * Orthonormalizes vectors in the inner product given by the symmetric
 * matrix `gram` (modified Gram-Schmidt); vectors that are dependent in this
 * inner product are dropped.
 */
export function orthonormalize(vectors, gram, tolerance = TOLERANCE) {
  const inner = (x, y) => x.reduce(
      (s, xi, i) => s + xi * gram[i].reduce((t, g, j) => t + g * y[j], 0), 0);
  const out = [];
  for (const v of vectors) {
    let w = Array.from(v);
    for (const b of out) {
      const factor = inner(w, b);
      w = w.map((q, j) => q - factor * b[j]);
    }
    const norm = Math.sqrt(inner(w, w));
    if (norm > tolerance * Math.max(1, Math.sqrt(inner(v, v)))) {
      out.push(w.map((q) => q / norm));
    }
  }
  return out;
}
