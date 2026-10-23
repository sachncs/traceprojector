import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
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
