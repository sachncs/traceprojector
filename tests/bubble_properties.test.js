/* eslint-disable max-len -- long test titles and expressions */
import {expect} from 'chai';
import {Mesh} from '../traceprojector/mesh.js';
import {Whitney} from '../traceprojector/whitney.js';
import {Bubble} from '../traceprojector/bubble.js';
import {tetrahedronQuadrature} from '../traceprojector/quadrature.js';

const vertices = [
  [0, 0, 0],
  [2, 0, 0],
  [0, 3, 0],
  [0, 0, 1],
];
const mesh = new Mesh(vertices, [[0, 1, 2, 3]]);
const volume = mesh.getVolume(0);
const warnings = [];
const bubble = new Bubble(mesh, new Whitney(mesh), 3, (w) => warnings.push(w));
const binomial = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
const point = (bary) =>
  [0, 1, 2].map((k) => vertices.reduce((s, v, i) => s + bary[i] * v[k], 0));

describe('bubble exponents and basis', () => {
  it('the bubble space is empty below degree 4', () => {
    for (const p of [0, 1, 2, 3]) {
      expect(bubble.getBubbleExponents(p)).to.deep.equal([]);
      expect(bubble.evaluateBubbleBasis([0.4, 0.3, 0.2, 0.1], p)).to.deep.equal([]);
    }
  });

  it('degree 4 has the single bubble lambda0 lambda1 lambda2 lambda3', () => {
    expect(bubble.getBubbleExponents(4)).to.deep.equal([[1, 1, 1, 1]]);
    const [value] = bubble.evaluateBubbleBasis([0.4, 0.3, 0.2, 0.1], 4);
    expect(value).to.be.closeTo(0.4 * 0.3 * 0.2 * 0.1, 1e-15);
  });

  it('degree 5 has four bubbles, one with each barycentric squared', () => {
    const exponents = bubble.getBubbleExponents(5);
    expect(exponents).to.have.length(4);
    for (const e of exponents) {
      expect(e.reduce((a, b) => a + b)).to.equal(5);
      expect(Math.min(...e)).to.equal(1);
    }
    const bary = [0.4, 0.3, 0.2, 0.1];
    const values = bubble.evaluateBubbleBasis(bary, 5);
    exponents.forEach((e, i) => {
      const product = e.reduce((s, a, k) => s * bary[k] ** a, 1);
      expect(values[i]).to.be.closeTo(product, 1e-15);
    });
  });

  it('degree p has C(p-1, 3) bubbles', () => {
    for (const p of [4, 5, 6, 7]) {
      expect(bubble.getBubbleExponents(p)).to.have.length(binomial(p - 1, 3));
    }
  });

  it('the exponent list is cached', () => {
    expect(bubble.getBubbleExponents(6)).to.equal(bubble.getBubbleExponents(6));
  });

  it('a bubble vanishes on every face of the tetrahedron', () => {
    for (let face = 0; face < 4; face++) {
      const bary = [0.3, 0.3, 0.3, 0.1];
      bary[face] = 0;
      for (const value of bubble.evaluateBubbleBasis(bary, 5)) {
        expect(value).to.equal(0);
      }
    }
  });
});

describe('Bernstein basis', () => {
  it('has C(p + 3, 3) members whose exponents sum to p', () => {
    for (const p of [0, 1, 2, 3, 4]) {
      const exponents = bubble.getBernsteinExponents(p);
      expect(exponents).to.have.length(binomial(p + 3, 3));
      for (const e of exponents) expect(e.reduce((a, b) => a + b)).to.equal(p);
    }
  });

  it('is a nonnegative partition of unity', () => {
    for (const p of [1, 2, 3]) {
      for (const bary of [[0.25, 0.25, 0.25, 0.25], [0.7, 0.1, 0.1, 0.1], [0, 0.5, 0.3, 0.2]]) {
        const values = bubble.evaluateBernsteinBasis(bary, p);
        expect(values.reduce((a, b) => a + b)).to.be.closeTo(1, 1e-14);
        for (const v of values) expect(v).to.be.at.least(0);
      }
    }
  });

  it('equals one for the exponent p at its vertex and zero for the others', () => {
    const p = 3;
    const exponents = bubble.getBernsteinExponents(p);
    for (let vertex = 0; vertex < 4; vertex++) {
      const bary = [0, 0, 0, 0];
      bary[vertex] = 1;
      const values = bubble.evaluateBernsteinBasis(bary, p);
      exponents.forEach((e, i) => {
        expect(values[i]).to.equal(e[vertex] === p ? 1 : 0);
      });
    }
  });

  it('the analytic mass matrix is symmetric and sums to the volume', () => {
    for (const p of [1, 2, 3]) {
      const exponents = bubble.getBernsteinExponents(p);
      const M = bubble.assembleBernsteinMass(p, volume, exponents);
      let total = 0;
      for (let i = 0; i < M.length; i++) {
        for (let j = 0; j < M.length; j++) {
          expect(M[i][j]).to.be.closeTo(M[j][i], 1e-14);
          total += M[i][j];
        }
      }
      expect(total).to.be.closeTo(volume, 1e-12);
    }
  });

  it('for p = 1 the mass matrix is volume/10 on the diagonal, volume/20 off it', () => {
    const exponents = bubble.getBernsteinExponents(1);
    const M = bubble.assembleBernsteinMass(1, volume, exponents);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(M[i][j]).to.be.closeTo(i === j ? volume / 10 : volume / 20, 1e-13);
      }
    }
  });
});

describe('bubble projection', () => {
  const {bary, weights} = tetrahedronQuadrature(3);

  it('the bubble mass matrix is the volume-weighted Gram matrix on the quadrature', () => {
    const M = bubble.assembleBubbleMass(0, 5);
    expect(M).to.have.length(4);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let expected = 0;
        bary.forEach((lam, q) => {
          const b = bubble.evaluateBubbleBasis(lam, 5);
          expected += weights[q] * b[i] * b[j];
        });
        expect(M[i][j]).to.be.closeTo(expected * volume, 1e-14);
        expect(M[i][j]).to.be.closeTo(M[j][i], 1e-15);
      }
    }
    expect(bubble.assembleBubbleMass(0, 3)).to.deep.equal([]);
  });

  it('the right-hand side is the volume-weighted moment of the residual', () => {
    const f = bubble.assembleBubbleRhs(0, 4, () => 2);
    let expected = 0;
    bary.forEach((lam, q) => {
      expected += weights[q] * 2 * bubble.evaluateBubbleBasis(lam, 4)[0];
    });
    expect(f).to.have.length(1);
    expect(f[0]).to.be.closeTo(expected * volume, 1e-15);
    expect(bubble.assembleBubbleRhs(0, 2, () => 1)).to.deep.equal([]);
  });

  it('a residual in the bubble space is recovered exactly', () => {
    const c = [0.5, -1.25, 2, 0.75];
    const residual = (x) => {
      // Convert back to barycentric coordinates of the reference tetrahedron.
      const lam1 = x[0] / 2;
      const lam2 = x[1] / 3;
      const lam3 = x[2];
      const lam = [1 - lam1 - lam2 - lam3, lam1, lam2, lam3];
      return bubble.evaluateBubbleBasis(lam, 5)
          .reduce((s, b, i) => s + c[i] * b, 0);
    };
    const solved = bubble.solveBubbleProjection(0, 5, residual);
    solved.forEach((v, i) => expect(v).to.be.closeTo(c[i], 1e-10));
  });

  it('is null below degree 4 and warns when the local system is singular', () => {
    expect(bubble.solveBubbleProjection(0, 3, () => 1)).to.equal(null);
    warnings.length = 0;
    // Degree 6 has 10 bubbles but the quadrature has only 5 points.
    expect(bubble.solveBubbleProjection(0, 6, () => 1)).to.equal(null);
    expect(warnings).to.have.length(1);
    expect(warnings[0].code).to.equal('HOP_BUBBLE_SOLVE_FAILED');
    expect(warnings[0].message).to.match(/tet 0, p=6/);
  });

  it('evaluates the bubble correction at a physical point', () => {
    const lam = [0.4, 0.3, 0.2, 0.1];
    const x = point(lam);
    expect(bubble.evaluateBubble(0, 4, [3], x)).to.be.closeTo(3 * 0.4 * 0.3 * 0.2 * 0.1, 1e-12);
    expect(bubble.evaluateBubble(0, 4, [], x)).to.equal(0);
    expect(bubble.evaluateBubble(0, 4, null, x)).to.equal(0);
  });
});

describe('Bernstein L2 projection', () => {
  const lam = [0.4, 0.3, 0.2, 0.1];

  it('reproduces a linear function with p = 1 and p = 2', () => {
    const u = (x) => 1 + 0.5 * x[0] - x[1] + 2 * x[2];
    for (const p of [1, 2]) {
      const coeffs = bubble.solveL2Projection(0, p, u);
      expect(coeffs).to.have.length(binomial(p + 3, 3));
      expect(bubble.evaluateL2Projection(coeffs, lam, p))
          .to.be.closeTo(u(point(lam)), 1e-10);
    }
  });

  it('with p = 0 returns the cell mean', () => {
    const u = (x) => 3 + x[0];
    const [mean] = bubble.solveL2Projection(0, 0, u);
    expect(mean).to.be.closeTo(u(point([0.25, 0.25, 0.25, 0.25])), 1e-10);
  });

  it('the cell mean of a linear function is its value at the barycenter', () => {
    const u = (x) => 3 + x[0] - 2 * x[2];
    expect(bubble.cellMean(0, u))
        .to.be.closeTo(u(point([0.25, 0.25, 0.25, 0.25])), 1e-12);
    expect(bubble.cellMean(0, () => 5)).to.be.closeTo(5, 1e-12);
  });

  it('an empty coefficient list evaluates to zero', () => {
    expect(bubble.evaluateL2Projection([], lam, 2)).to.equal(0);
    expect(bubble.evaluateL2Projection(null, lam, 2)).to.equal(0);
  });
});
