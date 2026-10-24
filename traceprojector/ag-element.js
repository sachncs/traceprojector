/**
 * The degrees of freedom of Arnold and Guzman (2021, eq. 5.8) on the reference
 * tetrahedron, and their dual basis.
 *
 * On each sub-simplex tau of dimension m with k <= m < r + k the degrees of
 * freedom are  <<tr_tau w, g>>_tau  for g in the orthonormal basis p_r^k(tau)
 * of the bubbles (plus the volume form when k = m), with
 * <<u, v>> = <P u, P v> + <d u, d v>. For a closed bubble g this is
 * <tr w, g>_tau; for g in the complement it is <tr dw, dg>_tau.
 * The dual basis function of (tau, g) is the extension E_tau g.
 */

import {ValidateError} from './errors.js';
import {differential} from './polynomial-forms.js';
import {
  combine,
  invert,
  pullback,
  referenceRule,
} from './reference-element.js';
import {SimplexForms} from './bubble-forms.js';

const REFERENCE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
const evaluate = (form, x) => (Array.isArray(form) ?
  form.map((p) => p.evaluate(x)) : form.evaluate(x));
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const familyCache = new Map();
const basisCache = new Map();

/**
 * The orthonormal bubbles p_r^k(tau) for every form degree on the reference
 * simplex of dimension m: for each k, the list of
 * `{kind, value(s), derivative(s)}` with the pulled-back components of the
 * bubble and of its derivative.
 * @param {number} r
 * @param {number} m
 * @return {!Array<!Array<{kind: string, value: function, derivative:
 *     function}>>}
 */
export function bubbleFamily(r, m) {
  const id = `${r}_${m}`;
  if (familyCache.has(id)) return familyCache.get(id);
  const family = [];
  for (let k = 0; k <= m; k++) {
    const forms = SimplexForms.of(r, k, m);
    const items = [];
    if (k === m) {
      items.push({
        kind: 'volume',
        value: () => [1],
        derivative: () => [],
      });
    }
    if (k > 0) {
      // The closed bubbles of degree k are d of the complements of degree
      // k - 1; they are L2-orthonormal because the complements are
      // orthonormal in the energy product.
      const lower = SimplexForms.of(r, k - 1, m);
      for (const coefficients of lower.coclosedBasis) {
        items.push({
          kind: 'closed',
          value: (s) => lower.derivativeAt(coefficients, s),
          derivative: () => [],
        });
      }
    }
    for (const coefficients of forms.coclosedBasis) {
      items.push({
        kind: 'coclosed',
        value: (s) => forms.valueAt(coefficients, s),
        derivative: (s) => forms.derivativeAt(coefficients, s),
      });
    }
    family.push(items);
  }
  familyCache.set(id, family);
  return family;
}

const sampleCache = new Map();

/**
 * The values and derivatives of one bubble at the points of the reference
 * rule, tabulated once: they depend on the element and the rule alone, not on
 * the cell.
 * @param {number} r
 * @param {number} k Form degree.
 * @param {number} m Dimension of the simplex.
 * @param {number} index Index in the bubble family.
 * @param {!Array<{s: !Array<number>}>} rule The reference rule.
 * @return {{values: !Array<!Array<number>>, derivatives:
 *     !Array<!Array<number>>}} Per point.
 */
export function bubbleSamples(r, k, m, index, rule) {
  const id = `${r}_${k}_${m}_${index}_${rule.length}`;
  let out = sampleCache.get(id);
  if (!out) {
    const item = bubbleFamily(r, m)[k][index];
    out = {
      values: item.kind === 'coclosed' ? null :
        rule.map(({s}) => item.value(s)),
      derivatives: item.kind === 'coclosed' ?
        rule.map(({s}) => item.derivative(s)) : null,
    };
    sampleCache.set(id, out);
  }
  return out;
}

/** Sub-simplices of the reference tetrahedron that carry dofs of degree k. */
export function agCarriers(r, k) {
  const out = [];
  for (let mask = 1; mask < 16; mask++) {
    const vertices = [0, 1, 2, 3].filter((v) => mask & (1 << v));
    const m = vertices.length - 1;
    if (m < k || m > r + k - 1 || m === 0) {
      if (m === 0 && k === 0) out.push({vertices, dimension: 0});
      continue;
    }
    out.push({vertices, dimension: m});
  }
  return out.sort((a, b) => a.dimension - b.dimension ||
    a.vertices.join().localeCompare(b.vertices.join()));
}

/**
 * The dual basis of the degrees of freedom on the reference tetrahedron.
 * @param {number} r
 * @param {number} k
 * @return {{basis: !Array, entries: !Array<{carrier: number, kind: string,
 *     index: number}>, carriers: !Array, offsets: number[]}} The dual basis
 *     (3D polynomial forms), each dof's carrier, kind and index in the
 *     bubble family, and the first dof number of each carrier.
 */
export function agBasis(r, k) {
  const id = `${r}_${k}`;
  if (basisCache.has(id)) return basisCache.get(id);
  const carriers = agCarriers(r, k);
  const space = SimplexForms.of(r, k, 3).space;
  const derivatives = k < 3 ? space.map((f) => differential(f, k)) : null;
  const entries = [];
  const offsets = [0];
  const functionals = [];
  carriers.forEach((carrier, ci) => {
    const m = carrier.dimension;
    const corners = carrier.vertices.map((v) => REFERENCE[v]);
    if (m === 0) {
      entries.push({carrier: ci, kind: 'point', index: 0});
      functionals.push((w) => evaluate(w, corners[0]));
    } else {
      const items = bubbleFamily(r, m)[k];
      const rule = referenceRule(m, r + 3);
      const pull = pullback(k, corners);
      const pullD = k + 1 <= m ? pullback(k + 1, corners) : null;
      items.forEach((item, index) => {
        entries.push({carrier: ci, kind: item.kind, index});
        if (item.kind === 'coclosed') {
          functionals.push((w, dw) => rule.reduce((sum, {s, weight}) =>
            sum + weight * dot(pullD(s, (x) => evaluate(dw, x)),
                item.derivative(s)), 0));
        } else {
          functionals.push((w) => rule.reduce((sum, {s, weight}) =>
            sum + weight * dot(pull(s, (x) => evaluate(w, x)),
                item.value(s)), 0));
        }
      });
    }
    offsets.push(entries.length);
  });
  const n = space.length;
  if (entries.length !== n) {
    throw new ValidateError(`dof count ${entries.length} != ${n}`);
  }
  const matrix = functionals.map((functional) => Float64Array.from(
      space, (w, b) => functional(w, derivatives ? derivatives[b] : null)));
  // psi_a = sum_b C[a][b] space_b with C D^T = I.
  const transpose = Array.from({length: n}, (_, b) => Float64Array.from(
      matrix, (row) => row[b]));
  const inverse = invert(transpose);
  const basis = inverse.map((row) => combine(space, row, k));
  const result = {
    basis,
    entries,
    carriers,
    offsets,
    functionals,
    derivatives,
  };
  basisCache.set(id, result);
  return result;
}
