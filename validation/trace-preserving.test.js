import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {tetrahedronRule} from '../traceprojector/simplicial-complex.js';
import {tolerances} from './support/tolerances.js';
import {fitSlope} from './support/statistics.js';
import {
  TracePreservingProjector,
} from '../traceprojector/trace-preserving-projector.js';

const cube = generateUnitCubeMesh(4);
const projector = new TracePreservingProjector(
    cube.getVertices(), cube.getTetrahedra(), {quadratureOrder: 5});
const complex = projector.complex;
const NO = null;

// Fields in the lowest-order spaces, which must be reproduced exactly.
const affine = (x) => 0.7 * x[0] - 0.3 * x[1] + x[2] + 0.2;
const gradAffine = () => [0.7, -0.3, 1];
// a + b x x with b = (0.5, -0.4, 0.3), so the curl is 2b.
const nedelec = (x) => [
  0.3 + -0.4 * x[2] - 0.3 * x[1],
  -0.2 + 0.3 * x[0] - 0.5 * x[2],
  0.1 + 0.5 * x[1] + 0.4 * x[0],
];
const raviart = (x) => [
  0.3 + 0.6 * x[0], -0.2 + 0.6 * x[1], 0.1 + 0.6 * x[2]];

describe('trace-preserving projection at lowest order', function() {
  this.timeout(600000);

  it('reproduces a P1 function: Pi u = u', () => {
    const values = complex.vertices.map(affine);
    projector.coefficients(affine, gradAffine, 0).forEach((c, v) =>
      expect(c).to.be.closeTo(values[v], 1e-8));
  });

  it('reproduces a Nedelec field: coefficients are the circulations', () => {
    const c = projector.coefficients(nedelec, () => [1, -0.8, 0.6], 1);
    complex.edges.forEach((_, e) => {
      expect(c[e]).to.be.closeTo(complex.degreeOfFreedom(1, e, nedelec), 1e-8);
    });
  });

  it('reproduces a Raviart-Thomas field: coefficients are the fluxes', () => {
    const c = projector.coefficients(raviart, () => 1.8, 2);
    complex.faces.forEach((_, f) => {
      expect(c[f]).to.be.closeTo(complex.degreeOfFreedom(2, f, raviart), 1e-8);
    });
  });

  it('reproduces a constant 3-form: coefficients are the integrals', () => {
    const c = projector.coefficients(() => 2, NO, 3);
    complex.cells.forEach((_, k) => {
      expect(c[k]).to.be.closeTo(2 * complex.geometry(k).volume, 1e-10);
    });
  });
});

describe('commuting of the trace-preserving projection', function() {
  this.timeout(1800000);

  // Fields whose trace is a lowest-order trace (V_tr,0): a lowest-order field
  // plus a field of zero trace. The projection commutes with d on these.
  const bubble = (x) => 64 * x[0] * (1 - x[0]) * x[1] * (1 - x[1]) *
    x[2] * (1 - x[2]);
  const gradBubble = (x) => [
    64 * (1 - 2 * x[0]) * x[1] * (1 - x[1]) * x[2] * (1 - x[2]),
    64 * x[0] * (1 - x[0]) * (1 - 2 * x[1]) * x[2] * (1 - x[2]),
    64 * x[0] * (1 - x[0]) * x[1] * (1 - x[1]) * (1 - 2 * x[2]),
  ];
  const scalar = (x) => affine(x) + bubble(x);
  const gradScalar = (x) => gradBubble(x).map((q, i) => q + gradAffine()[i]);
  const w = [1, -2, 3];
  const crossW = (g) => [
    g[1] * w[2] - g[2] * w[1], g[2] * w[0] - g[0] * w[2],
    g[0] * w[1] - g[1] * w[0]];
  const vector = (x) => nedelec(x).map((q) => q + bubble(x) * 0).map(
      (q, i) => q + bubble(x) * w[i]);
  const curlVector = (x) => [1, -0.8, 0.6].map(
      (q, i) => q + crossW(gradBubble(x))[i]);
  const sum = (l, entity, coefficients) => complex.boundary(l, entity)
      .reduce((s, {entity: e, sign}) => s + sign * coefficients[e], 0);

  it('d Pi u = Pi d u for a 0-form with lowest-order trace', () => {
    const vertexCoefficients = projector.coefficients(scalar, gradScalar, 0);
    const edgeCoefficients = projector.coefficients(
        gradScalar, () => [0, 0, 0], 1);
    let worst = 0;
    complex.edges.forEach((_, e) => {
      worst = Math.max(worst, Math.abs(
          sum(1, e, vertexCoefficients) - edgeCoefficients[e]));
    });
    console.log(`      0-form commuting residual: ${worst.toExponential(2)}`);
    expect(worst).to.be.below(1e-9);
  });

  it('d Pi u = Pi d u for a 1-form with lowest-order trace', () => {
    const edgeCoefficients = projector.coefficients(vector, curlVector, 1);
    const faceCoefficients = projector.coefficients(curlVector, () => 0, 2);
    let worst = 0;
    complex.faces.forEach((_, f) => {
      worst = Math.max(worst, Math.abs(
          sum(2, f, edgeCoefficients) - faceCoefficients[f]));
    });
    console.log(`      1-form commuting residual: ${worst.toExponential(2)}`);
    expect(worst).to.be.below(1e-9);
  });
});

describe('stability of the trace-preserving projection at the boundary', function() {
  this.timeout(1800000);

  const bumpNormSquared = (delta) => {
    // Half a bump lies inside the cube: 2 pi delta^3 * int (1 - s^2)^4 s^2.
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) / N;
      sum += (1 - s * s) ** 4 * s * s / N;
    }
    return 2 * Math.PI * sum * delta ** 3;
  };
  const fieldW = [1, -2, 0.5];

  /** Largest L2 ratio over two bump widths, for a bump at the face centre. */
  function worstRatio(n, l) {
    const base = generateUnitCubeMesh(n);
    const p = new TracePreservingProjector(
        base.getVertices(), base.getTetrahedra(), {quadratureOrder: 4});
    const c = p.complex;
    const centre = c.vertices.reduce((best, v, i) => {
      const d = Math.hypot(v[0] - 0.5, v[1] - 0.5, v[2]);
      return d < best.d ? {i, d} : best;
    }, {i: -1, d: Infinity});
    const x0 = c.vertices[centre.i];
    let touching = new Set([centre.i]);
    const cells = new Set();
    for (let ring = 0; ring < 3; ring++) {
      c.cells.forEach((t, k) => {
        if (t.some((v) => touching.has(v))) cells.add(k);
      });
      touching = new Set([...cells].flatMap((k) => c.cells[k]));
    }
    let worst = 0;
    for (const delta of [1 / n, 1 / (2 * n)]) {
      const radial = (x) => x.map((q, i) => q - x0[i]);
      const s = (x) => Math.hypot(...radial(x)) / delta;
      const bump = (x) => (s(x) < 1 ? (1 - s(x) ** 2) ** 2 : 0);
      const gradient = (x) => (s(x) >= 1 ? [0, 0, 0] : radial(x).map(
          (q) => -4 * (1 - s(x) ** 2) / delta ** 2 * q));
      const u = l === 0 ? bump : (x) => fieldW.map((q) => q * bump(x));
      const du = l === 0 ? gradient : (x) => {
        const g = gradient(x);
        return [g[1] * fieldW[2] - g[2] * fieldW[1],
          g[2] * fieldW[0] - g[0] * fieldW[2],
          g[0] * fieldW[1] - g[1] * fieldW[0]];
      };
      let sum = 0;
      for (const k of cells) {
        const coefficients = c.cellEntities(k, l).map(
            (e) => p.coefficient(u, du, l, e));
        for (const {x, weight} of tetrahedronRule(c.geometry(k).points, 4)) {
          const basis = c.whitney(k, l, x);
          const value = l === 0 ?
            basis.reduce((a, q, i) => a + q * coefficients[i], 0) :
            Math.hypot(...[0, 1, 2].map((d) => basis.reduce(
                (a, q, i) => a + q[d] * coefficients[i], 0)));
          sum += weight * value * value;
        }
      }
      const norm = l === 0 ? bumpNormSquared(delta) :
        bumpNormSquared(delta) * (fieldW[0] ** 2 + fieldW[1] ** 2 +
          fieldW[2] ** 2);
      worst = Math.max(worst, Math.sqrt(sum / norm));
    }
    return worst;
  }

  for (const l of [0, 1]) {
    it(`degree ${l}: the constant does not grow as h shrinks`, () => {
      const sizes = [4, 5, 6, 8];
      const logH = [];
      const logC = [];
      for (const n of sizes) {
        const ratio = worstRatio(n, l);
        console.log(`      n = ${n}: largest ratio at the boundary ${ratio.toFixed(3)}`);
        logH.push(Math.log(1 / n));
        logC.push(Math.log(ratio));
        expect(ratio).to.be.below(50);
      }
      const growth = 2 ** -fitSlope(logH, logC).slope;
      console.log(`      growth per halving of h = ${growth.toFixed(3)}`);
      expect(growth).to.be.at.most(
          tolerances.stableOperator.stability.maxGrowthPerHalvingOfH);
    });
  }
});
