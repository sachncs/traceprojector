/* eslint-disable max-len -- long test titles and expressions */
import {expect} from 'chai';
import {
  tetrahedronQuadrature,
  compositeTetrahedronQuadrature,
  triangleQuadrature,
} from '../traceprojector/quadrature.js';

const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

/**
 * Mean over the reference simplex of the monomial lambda^alpha, in dimension d:
 * d! alpha! / (|alpha| + d)!.
 */
const exactMean = (alpha, d) =>
  (factorial(d) * alpha.reduce((s, a) => s * factorial(a), 1)) /
  factorial(alpha.reduce((s, a) => s + a, 0) + d);

/** Largest error of the rule on monomials of total degree `degree`. */
function worstError(rule, degree, d) {
  let worst = 0;
  const alphas = [];
  const build = (prefix, left, slots) => {
    if (slots === 1) alphas.push([...prefix, left]);
    else for (let a = 0; a <= left; a++) build([...prefix, a], left - a, slots - 1);
  };
  build([], degree, d + 1);
  for (const alpha of alphas) {
    let q = 0;
    rule.bary.forEach((lam, i) => {
      q += rule.weights[i] * alpha.reduce((s, a, k) => s * lam[k] ** a, 1);
    });
    worst = Math.max(worst, Math.abs(q - exactMean(alpha, d)));
  }
  return worst;
}

describe('quadrature rules integrate polynomials up to their stated order', () => {
  for (const order of [1, 2, 3]) {
    it(`tetrahedron rule of order ${order} is exact to degree ${order}`, () => {
      const rule = tetrahedronQuadrature(order);
      for (let degree = 0; degree <= order; degree++) {
        expect(worstError(rule, degree, 3)).to.be.below(1e-14);
      }
    });

    it(`composite tetrahedron rule of order ${order} is exact to degree ${order}`,
        () => {
          const rule = compositeTetrahedronQuadrature(order);
          for (let degree = 0; degree <= order; degree++) {
            expect(worstError(rule, degree, 3)).to.be.below(1e-14);
          }
        });

    it(`triangle rule of order ${order} is exact to degree ${order}`, () => {
      const rule = triangleQuadrature(order);
      for (let degree = 0; degree <= order; degree++) {
        expect(worstError(rule, degree, 2)).to.be.below(1e-14);
      }
    });
  }

  it('weights sum to one and every point has barycentric coordinates summing to one', () => {
    for (const rule of [tetrahedronQuadrature(3), compositeTetrahedronQuadrature(3)]) {
      expect(rule.weights.reduce((a, b) => a + b)).to.be.closeTo(1, 1e-14);
      for (const lam of rule.bary) {
        expect(lam.reduce((a, b) => a + b)).to.be.closeTo(1, 1e-14);
      }
    }
  });
});
