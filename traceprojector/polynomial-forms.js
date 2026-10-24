/**
 * Polynomial differential forms on R^3 in vector-proxy form, and the
 * polynomial spaces P_r^- Lambda^k of Arnold, Falk and Winther: Lagrange
 * (k = 0), Nedelec of the first kind (k = 1), Raviart-Thomas (k = 2) and
 * discontinuous (k = 3) elements of degree r. A 0- or 3-form is a scalar
 * polynomial and a 1- or 2-form a triple.
 */

import {ValidateError} from './errors.js';

const key = (e) => e.join(',');

/**
 * Monomials x^a y^b z^c are numbered by total degree, then by (b + c), then
 * by c: the number of monomials of degree below d is d (d + 1) (d + 2) / 6.
 */
const offsetOf = (d) => (d * (d + 1) * (d + 2)) / 6;
const indexOf = (a, b, c) => {
  const t = b + c;
  return offsetOf(a + t) + (t * (t + 1)) / 2 + c;
};
const MAX_DEGREE = 32;
const TABLE_SIZE = offsetOf(MAX_DEGREE + 1);
const EXPONENT_A = new Uint8Array(TABLE_SIZE);
const EXPONENT_B = new Uint8Array(TABLE_SIZE);
const EXPONENT_C = new Uint8Array(TABLE_SIZE);
for (let d = 0; d <= MAX_DEGREE; d++) {
  for (let t = 0; t <= d; t++) {
    for (let c = 0; c <= t; c++) {
      const i = offsetOf(d) + (t * (t + 1)) / 2 + c;
      EXPONENT_A[i] = d - t;
      EXPONENT_B[i] = t - c;
      EXPONENT_C[i] = c;
    }
  }
}

const POWER_STRIDE = MAX_DEGREE + 1;
const powers = new Float64Array(3 * POWER_STRIDE);

/**
 * A polynomial in x, y, z stored densely by monomial index up to its degree.
 * Dense arrays make addition, scaling, products and derivatives plain loops
 * over typed arrays, which is what the assembly of local problems spends its
 * time on.
 */
export class Polynomial {
  /**
   * @param {number=} degree Total degree; -1 for the zero polynomial.
   * @param {Float64Array=} coefficients Length offsetOf(degree + 1).
   */
  constructor(degree = -1, coefficients = new Float64Array(0)) {
    this.degree = degree;
    this.coefficients = coefficients;
  }

  /** The monomial x^a y^b z^c. */
  static monomial(exponents, coefficient = 1) {
    const [a, b, c] = exponents;
    const degree = a + b + c;
    const out = new Float64Array(offsetOf(degree + 1));
    out[indexOf(a, b, c)] = coefficient;
    return new Polynomial(degree, out).trimmed();
  }

  static zero() {
    return new Polynomial();
  }

  /** Exponent triple to coefficient, for the nonzero terms. */
  get terms() {
    const out = new Map();
    const c = this.coefficients;
    for (let i = 0; i < c.length; i++) {
      if (c[i] !== 0) {
        out.set(`${EXPONENT_A[i]},${EXPONENT_B[i]},${EXPONENT_C[i]}`, c[i]);
      }
    }
    return out;
  }

  /** @private The same polynomial with leading zero degrees removed. */
  trimmed() {
    const c = this.coefficients;
    let degree = this.degree;
    while (degree >= 0) {
      let any = false;
      for (let i = offsetOf(degree); i < offsetOf(degree + 1); i++) {
        if (c[i] !== 0) {
          any = true;
          break;
        }
      }
      if (any) break;
      degree--;
    }
    if (degree === this.degree) return this;
    return new Polynomial(degree, c.slice(0, offsetOf(degree + 1)));
  }

  add(other) {
    if (other.degree < 0) return this;
    if (this.degree < 0) return other;
    const degree = Math.max(this.degree, other.degree);
    const out = new Float64Array(offsetOf(degree + 1));
    out.set(this.coefficients);
    const c = other.coefficients;
    for (let i = 0; i < c.length; i++) out[i] += c[i];
    return new Polynomial(degree, out).trimmed();
  }

  scale(factor) {
    if (this.degree < 0) return this;
    const c = this.coefficients;
    const out = new Float64Array(c.length);
    for (let i = 0; i < c.length; i++) out[i] = c[i] * factor;
    return new Polynomial(this.degree, out).trimmed();
  }

  multiply(other) {
    if (this.degree < 0 || other.degree < 0) return Polynomial.zero();
    const degree = this.degree + other.degree;
    const out = new Float64Array(offsetOf(degree + 1));
    const p = this.coefficients;
    const q = other.coefficients;
    for (let i = 0; i < p.length; i++) {
      const pi = p[i];
      if (pi === 0) continue;
      const a = EXPONENT_A[i];
      const b = EXPONENT_B[i];
      const c = EXPONENT_C[i];
      for (let j = 0; j < q.length; j++) {
        const qj = q[j];
        if (qj !== 0) {
          out[indexOf(a + EXPONENT_A[j], b + EXPONENT_B[j],
              c + EXPONENT_C[j])] += pi * qj;
        }
      }
    }
    return new Polynomial(degree, out).trimmed();
  }

  /** Partial derivative with respect to variable i. */
  derivative(i) {
    if (this.degree <= 0) return Polynomial.zero();
    const degree = this.degree - 1;
    const out = new Float64Array(offsetOf(degree + 1));
    const c = this.coefficients;
    const table = [EXPONENT_A, EXPONENT_B, EXPONENT_C][i];
    for (let k = 0; k < c.length; k++) {
      const e = table[k];
      if (e === 0 || c[k] === 0) continue;
      const a = EXPONENT_A[k] - (i === 0 ? 1 : 0);
      const b = EXPONENT_B[k] - (i === 1 ? 1 : 0);
      const d = EXPONENT_C[k] - (i === 2 ? 1 : 0);
      out[indexOf(a, b, d)] += c[k] * e;
    }
    return new Polynomial(degree, out).trimmed();
  }

  /**
   * The value at a point whose monomials are tabulated by `monomialValues`
   * (to at least this polynomial's degree).
   */
  dot(row) {
    const c = this.coefficients;
    let sum = 0;
    for (let i = 0; i < c.length; i++) sum += c[i] * row[i];
    return sum;
  }

  evaluate(x) {
    const c = this.coefficients;
    const top = this.degree;
    if (top < 0) return 0;
    // Powers of each coordinate once, instead of three exponentiations per
    // term.
    powers[0] = powers[POWER_STRIDE] = powers[2 * POWER_STRIDE] = 1;
    for (let k = 1; k <= top; k++) {
      powers[k] = powers[k - 1] * x[0];
      powers[POWER_STRIDE + k] = powers[POWER_STRIDE + k - 1] * x[1];
      powers[2 * POWER_STRIDE + k] = powers[2 * POWER_STRIDE + k - 1] * x[2];
    }
    let sum = 0;
    for (let i = 0; i < c.length; i++) {
      const value = c[i];
      if (value !== 0) {
        sum += value * powers[EXPONENT_A[i]] *
          powers[POWER_STRIDE + EXPONENT_B[i]] *
          powers[2 * POWER_STRIDE + EXPONENT_C[i]];
      }
    }
    return sum;
  }
}

/**
 * The values of all monomials of degree up to `degree` at a point, in the
 * order of the dense coefficient vectors. A polynomial is then evaluated by a
 * dot product (`Polynomial.dot`), which is how many polynomials are
 * evaluated at one point.
 * @param {!Array<number>} x
 * @param {number} degree
 * @return {!Float64Array}
 */
export function monomialValues(x, degree) {
  const out = new Float64Array(offsetOf(degree + 1));
  powers[0] = powers[POWER_STRIDE] = powers[2 * POWER_STRIDE] = 1;
  for (let k = 1; k <= degree; k++) {
    powers[k] = powers[k - 1] * x[0];
    powers[POWER_STRIDE + k] = powers[POWER_STRIDE + k - 1] * x[1];
    powers[2 * POWER_STRIDE + k] = powers[2 * POWER_STRIDE + k - 1] * x[2];
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = powers[EXPONENT_A[i]] * powers[POWER_STRIDE + EXPONENT_B[i]] *
      powers[2 * POWER_STRIDE + EXPONENT_C[i]];
  }
  return out;
}

/** All exponent triples of total degree exactly d, in a fixed order. */
function homogeneous(d) {
  const out = [];
  for (let a = d; a >= 0; a--) {
    for (let b = d - a; b >= 0; b--) out.push([a, b, d - a - b]);
  }
  return out;
}

/** All exponent triples of total degree at most d. */
function upTo(d) {
  return Array.from({length: d + 1}, (_, i) => homogeneous(i)).flat();
}

const coordinate = [0, 1, 2].map((i) => Polynomial.monomial(
    [0, 1, 2].map((j) => (j === i ? 1 : 0))));

/** x cross q for a triple q of polynomials. */
function crossWithPosition(q) {
  const [x, y, z] = coordinate;
  return [
    y.multiply(q[2]).add(z.multiply(q[1]).scale(-1)),
    z.multiply(q[0]).add(x.multiply(q[2]).scale(-1)),
    x.multiply(q[1]).add(y.multiply(q[0]).scale(-1)),
  ];
}

/**
 * Flat coefficient vector of a form over monomials up to degree `top`, used to
 * compare and rank forms.
 */
function flatten(form, top = 12) {
  const members = upTo(top);
  const components = Array.isArray(form) ? form : [form];
  return components.flatMap(
      (p) => members.map((e) => p.terms.get(key(e)) ?? 0));
}

/**
 * Rank of a set of forms (as coefficient vectors), by Gaussian elimination
 * with partial pivoting.
 * @param {!Array<(Polynomial|Polynomial[])>} forms
 * @return {number}
 */
export function rank(forms) {
  const rows = forms.map((f) => flatten(f));
  return eliminate(rows).length;
}

/** Row echelon pivots of the rows; returns the indices of independent rows. */
function eliminate(rows) {
  const work = rows.map((r) => r.slice());
  const independent = [];
  const pivots = [];
  work.forEach((row, index) => {
    for (const [p, basis] of pivots) {
      const factor = row[p];
      if (factor !== 0) {
        for (let j = 0; j < row.length; j++) row[j] -= factor * basis[j];
      }
    }
    let at = -1;
    let size = 1e-9;
    row.forEach((q, j) => {
      if (Math.abs(q) > size) {
        size = Math.abs(q);
        at = j;
      }
    });
    if (at < 0) return;
    const scaled = row.map((q) => q / row[at]);
    pivots.push([at, scaled]);
    independent.push(index);
  });
  return independent;
}

/**
 * A basis of P_r^- Lambda^k on R^3 (as polynomials, not tied to a cell).
 * @param {number} r Polynomial degree, at least 1.
 * @param {number} k Form degree, 0 to 3.
 * @return {!Array<(Polynomial|Polynomial[])>}
 */
export function formSpace(r, k) {
  if (!Number.isInteger(r) || r < 1 || ![0, 1, 2, 3].includes(k)) {
    throw new ValidateError('formSpace needs r >= 1 and k in 0..3');
  }
  const scalar = (e) => Polynomial.monomial(e);
  const unitVector = (e, i) => [0, 1, 2].map(
      (j) => (j === i ? scalar(e) : Polynomial.zero()));
  let spanning;
  if (k === 0) {
    spanning = upTo(r).map(scalar);
  } else if (k === 3) {
    spanning = upTo(r - 1).map(scalar);
  } else {
    // P_{r-1} of vectors, plus x cross q (k = 1) or x q (k = 2) for q
    // homogeneous of degree r - 1.
    spanning = upTo(r - 1).flatMap((e) => [0, 1, 2].map(
        (i) => unitVector(e, i)));
    if (k === 1) {
      spanning.push(...homogeneous(r - 1).flatMap((e) => [0, 1, 2].map(
          (i) => crossWithPosition(unitVector(e, i)))));
    } else {
      spanning.push(...homogeneous(r - 1).map((e) => coordinate.map(
          (x) => x.multiply(scalar(e)))));
    }
  }
  const keep = eliminate(spanning.map((f) => flatten(f)));
  return keep.map((i) => spanning[i]);
}

/**
 * The exterior derivative of a k-form in vector-proxy form: the gradient of a
 * 0-form, the curl of a 1-form and the divergence of a 2-form.
 * @param {(Polynomial|Polynomial[])} form
 * @param {number} k Form degree, 0 to 2.
 * @return {(Polynomial|Polynomial[])}
 */
export function differential(form, k) {
  if (k === 0) return [0, 1, 2].map((i) => form.derivative(i));
  if (k === 1) return curl(form);
  if (k === 2) return divergence(form);
  throw new ValidateError('differential needs k in 0..2');
}

export function curl(f) {
  return [
    f[2].derivative(1).add(f[1].derivative(2).scale(-1)),
    f[0].derivative(2).add(f[2].derivative(0).scale(-1)),
    f[1].derivative(0).add(f[0].derivative(1).scale(-1)),
  ];
}

export function divergence(f) {
  return f[0].derivative(0).add(f[1].derivative(1)).add(f[2].derivative(2));
}
