/**
 * Exact polynomial forms in physical coordinates: the Piola image of a
 * reference polynomial form on one cell, and the arithmetic needed to take
 * derivatives of products of such forms.
 */

import {Polynomial, curl, differential, divergence} from './polynomial-forms.js';

const coordinate = [0, 1, 2].map((i) => Polynomial.monomial(
    [0, 1, 2].map((j) => (j === i ? 1 : 0))));
const one = Polynomial.monomial([0, 0, 0]);

/** An affine polynomial c + g . x. */
export function affine(constant, gradient) {
  let out = one.scale(constant);
  gradient.forEach((g, i) => {
    out = out.add(coordinate[i].scale(g));
  });
  return out;
}

/** The reference polynomial with its variables replaced by affine maps. */
function substitute(poly, maps) {
  const powers = maps.map((m) => [one, m]);
  const power = (i, n) => {
    while (powers[i].length <= n) {
      powers[i].push(powers[i][powers[i].length - 1].multiply(maps[i]));
    }
    return powers[i][n];
  };
  let out = Polynomial.zero();
  for (const [key, coefficient] of poly.terms) {
    const [a, b, c] = key.split(',').map(Number);
    out = out.add(power(0, a).multiply(power(1, b)).multiply(power(2, c))
        .scale(coefficient));
  }
  return out;
}

/**
 * The Piola image of a reference form of degree l on a cell.
 * @param {(Polynomial|Polynomial[])} form Reference form (scalar for l = 0,
 *     3, triple for l = 1, 2).
 * @param {number} l Form degree.
 * @param {{points: number[][], columns: number[][], det: number,
 *     inverse: number[][]}} frame The cell's map x = p0 + J s.
 * @return {(Polynomial|Polynomial[])}
 */
export function physicalForm(form, l, frame) {
  const {points, columns, det, inverse} = frame;
  // s_i = sum_j Jinv[i][j] (x_j - p0_j)
  const maps = inverse.map((row) => affine(
      -row.reduce((s, q, j) => s + q * points[0][j], 0), row));
  const pulled = Array.isArray(form) ?
    form.map((p) => substitute(p, maps)) : substitute(form, maps);
  if (l === 0) return pulled;
  if (l === 3) return pulled.scale(1 / det);
  if (l === 1) {
    // J^{-T} psi: component a is sum_j Jinv[j][a] psi_j.
    return [0, 1, 2].map((a) => pulled.reduce(
        (acc, p, j) => acc.add(p.scale(inverse[j][a])), Polynomial.zero()));
  }
  // l = 2: J psi / det.
  return [0, 1, 2].map((a) => pulled.reduce(
      (acc, p, j) => acc.add(p.scale(columns[j][a] / det)),
      Polynomial.zero()));
}

/** The value of a scalar or triple polynomial form at x. */
export const evaluateForm = (form, x) => (Array.isArray(form) ?
  form.map((p) => p.evaluate(x)) : form.evaluate(x));

/** The sum of two forms of the same kind. */
export const addForms = (a, b) => (Array.isArray(a) ?
  a.map((p, i) => p.add(b[i])) : a.add(b));

/** A form scaled by a number. */
export const scaleForm = (a, s) => (Array.isArray(a) ?
  a.map((p) => p.scale(s)) : a.scale(s));

/** A form multiplied by a scalar polynomial. */
export const timesPolynomial = (a, q) => (Array.isArray(a) ?
  a.map((p) => p.multiply(q)) : a.multiply(q));

export const zeroLike = (a) => (Array.isArray(a) ?
  a.map(() => Polynomial.zero()) : Polynomial.zero());

export {coordinate, curl, differential, divergence, one};
