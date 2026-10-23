/**
 * The bubble spaces of Arnold and Guzman (Local L2-bounded commuting
 * projections in FEEC, 2021, Section 5.2) on the reference simplices
 * conv(0, e1, ..., em) of dimension m = 1, 2, 3.
 *
 * For a simplex tau, P_r^- Lambda^k(tau) is the space of pull-backs of
 * P_r^- Lambda^k(R^3); its bubble subspace has zero pull-back to every facet
 * of tau. The bubbles split into the closed forms (d w = 0) and their
 * L2-orthogonal complement; d maps the complement of degree k - 1 onto the
 * closed forms of degree k. With the inner product
 *
 *   <<u, v>> = <P u, P v> + <d u, d v>,   P the L2 projector onto closed forms,
 *
 * this gives an orthonormal basis p_r(tau) of the bubbles (the mean-zero ones
 * when k = m) made of the d-images of the lower-degree complements and of the
 * complements of degree k.
 *
 * Every form is kept as a combination of 3D polynomial forms; its pull-back
 * to tau is evaluated numerically.
 */

import {ValidateError} from './errors.js';
import {differential, formSpace} from './polynomial-forms.js';
import {
  combine,
  components,
  pullback,
  referenceRule,
} from './reference-element.js';
import {
  independentSubset,
  nullspace,
  orthonormalize,
} from './small-linear-algebra.js';

const REFERENCE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
const evaluate = (form, x) => (Array.isArray(form) ?
  form.map((p) => p.evaluate(x)) : form.evaluate(x));
const cache = new Map();

/** All subsets of {0..m} of size m: the facets of the reference simplex. */
function facets(m) {
  return Array.from({length: m + 1}, (_, skip) =>
    Array.from({length: m + 1}, (__, v) => v).filter((v) => v !== skip));
}

export class SimplexForms {
  /** @param {number} r @param {number} k @param {number} m */
  static of(r, k, m) {
    const id = `${r}_${k}_${m}`;
    if (!cache.has(id)) cache.set(id, new SimplexForms(r, k, m));
    return cache.get(id);
  }

  constructor(r, k, m) {
    if (!(m >= 1 && m <= 3 && k >= 0 && k <= m && r >= 1)) {
      throw new ValidateError('SimplexForms needs 1 <= m <= 3, 0 <= k <= m');
    }
    this.r = r;
    this.k = k;
    this.m = m;
    this.space = formSpace(r, k);
    this.corners = REFERENCE.slice(0, m + 1);
    this.pull = pullback(k, this.corners);
    this.pullD = k + 1 <= m ? pullback(k + 1, this.corners) : null;
    this.rule = referenceRule(m, r + 3);
    this.derivatives = k < 3 ?
      this.space.map((form) => differential(form, k)) : null;
    this.build();
  }

  /** Pulled-back components of 3D form number a at the points of the rule. */
  sample(a) {
    return this.rule.map(({s}) =>
      this.pull(s, (x) => evaluate(this.space[a], x)));
  }

  sampleDerivative(a) {
    if (!this.pullD) return this.rule.map(() => []);
    return this.rule.map(({s}) =>
      this.pullD(s, (x) => evaluate(this.derivatives[a], x)));
  }

  /** @private */
  build() {
    const {k, m, r, space} = this;
    const samples = space.map((_, a) => this.sample(a));
    const flat = samples.map((rows) => rows.flat());
    this.independent = independentSubset(flat);
    const n = this.independent.length;
    const weights = this.rule.map(({weight}) => weight);
    const inner = (xs, ys) => xs.reduce((sum, row, j) => sum +
      weights[j] * row.reduce((s, q, c) => s + q * ys[j][c], 0), 0);
    const sampled = this.independent.map((a) => samples[a]);
    const derived = this.independent.map((a) => this.sampleDerivative(a));
    const gram = sampled.map((x) => sampled.map((y) => inner(x, y)));
    const energy = derived.map((x) => derived.map((y) => inner(x, y)));

    // Bubbles: zero pull-back to every facet of dimension >= k.
    const rows = [];
    if (m - 1 >= k) {
      for (const facet of facets(m)) {
        const corners = facet.map((v) => REFERENCE[v]);
        const pullFacet = pullback(k, corners);
        const facetRule = referenceRule(m - 1, r + 3);
        const values = this.independent.map((a) => facetRule.map(({s}) =>
          pullFacet(s, (x) => evaluate(space[a], x))));
        facetRule.forEach((_, j) => {
          for (let c = 0; c < values[0][j].length; c++) {
            rows.push(values.map((v) => v[j][c]));
          }
        });
      }
    }
    const bubbles = rows.length ? nullspace(rows, n) :
      Array.from({length: n}, (_, i) => Array.from(
          {length: n}, (__, j) => (i === j ? 1 : 0)));
    this.bubbleDimension = bubbles.length;

    // Closed bubbles (d w = 0 on tau); every bubble is closed when k = m.
    let closed;
    if (k === m) {
      closed = bubbles;
    } else {
      const flatDerived = derived.map((rowsOfPoints) => rowsOfPoints.flat());
      const constraints = flatDerived[0].map((_, i) => bubbles.map(
          (b) => b.reduce((s, bj, j) => s + bj * flatDerived[j][i], 0)));
      closed = nullspace(constraints, bubbles.length).map(
          (c) => bubbles[0].map((_, j) => c.reduce(
              (s, ci, i) => s + ci * bubbles[i][j], 0)));
    }
    this.closed = closed;
    // The complement of the closed bubbles in the L2 inner product.
    const gramOf = (x, y) => x.reduce((s, xi, i) => s + xi * gram[i].reduce(
        (t, g, j) => t + g * y[j], 0), 0);
    const complementRows = closed.map((z) => bubbles.map((b) => gramOf(z, b)));
    const complementCoefficients = closed.length ?
      nullspace(complementRows, bubbles.length) :
      bubbles.map((_, i) => bubbles.map((__, j) => (i === j ? 1 : 0)));
    this.coclosed = complementCoefficients.map((c) => bubbles[0].map(
        (_, j) => c.reduce((s, ci, i) => s + ci * bubbles[i][j], 0)));

    // Orthonormal bases: closed in L2, complement in the energy product.
    this.closedBasis = orthonormalize(this.closed, gram);
    this.coclosedBasis = orthonormalize(this.coclosed, energy);
    this.gram = gram;
    this.energy = energy;
  }

  /** The 3D polynomial form of a coefficient vector over `independent`. */
  form(coefficients) {
    const full = new Array(this.space.length).fill(0);
    this.independent.forEach((a, i) => (full[a] = coefficients[i]));
    return combine(this.space, full, this.k);
  }

  /** Pulled-back components of a coefficient vector at the parameters s. */
  valueAt(coefficients, s) {
    const form = this.form(coefficients);
    return this.pull(s, (x) => evaluate(form, x));
  }

  /** Pulled-back components of the derivative of a coefficient vector. */
  derivativeAt(coefficients, s) {
    if (!this.pullD) return [];
    const full = new Array(this.space.length).fill(0);
    this.independent.forEach((a, i) => (full[a] = coefficients[i]));
    const derivative = combine(
        this.derivatives.map((d) => d), full, this.k + 1);
    return this.pullD(s, (x) => evaluate(derivative, x));
  }
}

const choose = (n, j) => {
  let out = 1;
  for (let i = 1; i <= j; i++) out = out * (n - j + i) / i;
  return Math.round(out);
};

/** dim P_r^- Lambda^k on a simplex of dimension m. */
export function dimensionOf(r, k, m) {
  return choose(r + m, m - k) * choose(r + k - 1, k);
}

/** dim of the bubble space (Arnold, Falk, Winther, eq. 4.13). */
export function bubbleDimensionOf(r, k, m) {
  return choose(r + k - 1, m) * choose(m, k);
}

export {components};
