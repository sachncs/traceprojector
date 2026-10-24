/**
 * Minimal multivariate polynomial algebra in (x, y, z) used to build
 * manufactured fields whose derivatives are known exactly.
 */
export class Polynomial {
  /** @param {!Array<!Array<number>>} terms - [ex, ey, ez, coefficient] rows. */
  constructor(terms) {
    this.terms = terms.filter((t) => t[3] !== 0);
  }

  static constant(c) {
    return new Polynomial([[0, 0, 0, c]]);
  }

  static variable(axis) {
    const e = [0, 0, 0, 1];
    e[axis] = 1;
    return new Polynomial([e]);
  }

  evaluate([x, y, z]) {
    let sum = 0;
    for (const [a, b, c, k] of this.terms) sum += k * x ** a * y ** b * z ** c;
    return sum;
  }

  derivative(axis) {
    const out = [];
    for (const t of this.terms) {
      if (t[axis] === 0) continue;
      const row = t.slice();
      row[3] = t[3] * t[axis];
      row[axis] -= 1;
      out.push(row);
    }
    return new Polynomial(out);
  }

  add(other) {
    return new Polynomial(this.terms.concat(other.terms));
  }

  scale(s) {
    return new Polynomial(this.terms.map(([a, b, c, k]) => [a, b, c, k * s]));
  }

  multiply(other) {
    const out = [];
    for (const [a, b, c, k] of this.terms) {
      for (const [d, e, f, m] of other.terms) {
        out.push([a + d, b + e, c + f, k * m]);
      }
    }
    return new Polynomial(out);
  }

  /** Maximum total degree. */
  get degree() {
    return Math.max(0, ...this.terms.map((t) => t[0] + t[1] + t[2]));
  }
}

export const X = Polynomial.variable(0);
export const Y = Polynomial.variable(1);
export const Z = Polynomial.variable(2);

/** @param {!Array<!Polynomial>} field @return {function(!Array<number>):
 *     !Array<number>} */
export function vectorFunction(field) {
  return (p) => field.map((q) => q.evaluate(p));
}

export function gradient(p) {
  return [p.derivative(0), p.derivative(1), p.derivative(2)];
}

export function curl([a, b, c]) {
  return [
    c.derivative(1).add(b.derivative(2).scale(-1)),
    a.derivative(2).add(c.derivative(0).scale(-1)),
    b.derivative(0).add(a.derivative(1).scale(-1)),
  ];
}

export function divergence([a, b, c]) {
  return a.derivative(0).add(b.derivative(1)).add(c.derivative(2));
}

/** Random polynomial of total degree <= degree with coefficients in [-1, 1]. */
export function randomPolynomial(random, degree) {
  const terms = [];
  for (let a = 0; a <= degree; a++) {
    for (let b = 0; a + b <= degree; b++) {
      for (let c = 0; a + b + c <= degree; c++) {
        terms.push([a, b, c, 2 * random() - 1]);
      }
    }
  }
  return new Polynomial(terms);
}

export function randomVectorPolynomial(random, degree) {
  return [
    randomPolynomial(random, degree),
    randomPolynomial(random, degree),
    randomPolynomial(random, degree),
  ];
}
