/**
 * Polynomial differential forms on R^3 in vector-proxy form, and the
 * polynomial spaces P_r^- Lambda^k of Arnold, Falk and Winther: Lagrange
 * (k = 0), Nedelec of the first kind (k = 1), Raviart-Thomas (k = 2) and
 * discontinuous (k = 3) elements of degree r. A 0- or 3-form is a scalar
 * polynomial and a 1- or 2-form a triple.
 */

import {ValidateError} from './errors.js';

const key = (e) => e.join(',');

/** Exponent triples of keys already seen. */
const parsed = new Map();
const parse = (k) => {
  let out = parsed.get(k);
  if (!out) {
    out = k.split(',').map(Number);
    parsed.set(k, out);
  }
  return out;
};

export class Polynomial {
  /** @param {Map<string, number>=} terms Exponent triple to coefficient. */
  constructor(terms = new Map()) {
    this.terms = terms;
  }

  /** The monomial x^a y^b z^c. */
  static monomial(exponents, coefficient = 1) {
    return new Polynomial(new Map([[key(exponents), coefficient]]));
  }

  static zero() {
    return new Polynomial();
  }

  add(other) {
    const terms = new Map(this.terms);
    for (const [e, c] of other.terms) terms.set(e, (terms.get(e) ?? 0) + c);
    return new Polynomial(terms).clean();
  }

  scale(factor) {
    const terms = new Map();
    for (const [e, c] of this.terms) terms.set(e, c * factor);
    return new Polynomial(terms);
  }

  multiply(other) {
    const terms = new Map();
    for (const [a, c] of this.terms) {
      const [a0, a1, a2] = parse(a);
      for (const [b, d] of other.terms) {
        const [b0, b1, b2] = parse(b);
        const e = `${a0 + b0},${a1 + b1},${a2 + b2}`;
        terms.set(e, (terms.get(e) ?? 0) + c * d);
      }
    }
    return new Polynomial(terms).clean();
  }

  /** Partial derivative with respect to variable i. */
  derivative(i) {
    const terms = new Map();
    for (const [e, c] of this.terms) {
      const exponents = parse(e).slice();
      if (exponents[i] === 0) continue;
      const factor = exponents[i];
      exponents[i] -= 1;
      const k = key(exponents);
      terms.set(k, (terms.get(k) ?? 0) + c * factor);
    }
    return new Polynomial(terms).clean();
  }

  evaluate(x) {
    if (!this.compiled) {
      const flat = [];
      for (const [e, c] of this.terms) flat.push(...parse(e), c);
      this.compiled = Float64Array.from(flat);
    }
    const t = this.compiled;
    let sum = 0;
    for (let i = 0; i < t.length; i += 4) {
      sum += t[i + 3] * x[0] ** t[i] * x[1] ** t[i + 1] * x[2] ** t[i + 2];
    }
    return sum;
  }

  /** @private Drops zero coefficients. */
  clean() {
    for (const [e, c] of this.terms) {
      if (Math.abs(c) < 1e-14) this.terms.delete(e);
    }
    this.compiled = undefined;
    return this;
  }
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
