import {expect} from 'chai';
import {Mesh} from '../traceprojector/mesh.js';
import {Weight} from '../traceprojector/weight.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

const cube = generateUnitCubeMesh(2);
const tets = cube.getTetrahedra();

/** Proper rotation from a unit quaternion. */
function rotation(w, x, y, z) {
  const n = Math.hypot(w, x, y, z);
  [w, x, y, z] = [w / n, x / n, y / n, z / n];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
const apply = (R, v) =>
  R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const applyT = (R, v) =>
  [0, 1, 2].map((j) => R[0][j] * v[0] + R[1][j] * v[1] + R[2][j] * v[2]);

const R = rotation(0.8, 0.3, -0.4, 0.2);
const scale = 3.5;
const shift = [0.7, -1.1, 2.3];
const move = (x) => apply(R, x).map((c, k) => scale * c + shift[k]);
const unmove = (y) => applyT(R, y.map((c, k) => (c - shift[k]) / scale));

const original = new Mesh(cube.getVertices(), tets);
const moved = new Mesh(cube.getVertices().map(move), tets);
const weights = new Weight(original, () => {}).compute();
const movedWeights = new Weight(moved, () => {}).compute();

// Smooth, non-polynomial fields: the functionals are geometric, so the
// symmetry must hold for every field, not only for the discrete ones.
const scalar = (x) => Math.sin(1.3 * x[0]) + x[1] * x[2] - 0.4 * x[2];
const vector = (x) => [
  Math.cos(x[1] + 0.3) + x[2],
  x[0] * x[2] - 0.2,
  Math.sin(x[0] - x[1]) + 0.5,
];

describe('boundary weights transform as forms under similarities', () => {
  it('vertex functionals are invariant (0-forms)', () => {
    expect(weights.vertexBoundaryWeights.size).to.equal(
        movedWeights.vertexBoundaryWeights.size);
    for (const [v, w] of weights.vertexBoundaryWeights) {
      const uMoved = (y) => scalar(unmove(y));
      expect(movedWeights.vertexBoundaryWeights.get(v).pair(uMoved))
          .to.be.closeTo(w.pair(scalar), 1e-9);
    }
  });

  it('edge functionals scale like 1-forms', () => {
    expect(weights.edgeBoundaryWeights.size).to.be.above(0);
    for (const [e, w] of weights.edgeBoundaryWeights) {
      // The 1-form pullback: (1 / scale) R u.
      const uMoved = (y) => apply(R, vector(unmove(y))).map((c) => c / scale);
      expect(movedWeights.edgeBoundaryWeights.get(e).pair(uMoved))
          .to.be.closeTo(w.pair(vector), 1e-9);
    }
  });

  it('face functionals scale like 2-forms', () => {
    expect(weights.faceBoundaryWeights.size).to.be.above(0);
    for (const [f, w] of weights.faceBoundaryWeights) {
      // The 2-form pullback: (1 / scale^2) R u.
      const uMoved = (y) =>
        apply(R, vector(unmove(y))).map((c) => c / scale ** 2);
      expect(movedWeights.faceBoundaryWeights.get(f).pair(uMoved))
          .to.be.closeTo(w.pair(vector), 1e-9);
    }
  });

  it('every functional is linear in the field', () => {
    const a = 1.7;
    const b = -0.6;
    const other = (x) => [x[2], x[0], x[1]];
    const combine = (x) =>
      vector(x).map((c, k) => a * c + b * other(x)[k]);
    const families = [weights.edgeBoundaryWeights, weights.faceBoundaryWeights];
    for (const family of families) {
      for (const [, w] of family) {
        expect(w.pair(combine)).to.be.closeTo(
            a * w.pair(vector) + b * w.pair(other), 1e-9);
      }
    }
  });

  it('each vertex weight integrates to one and has a potential per star vertex', () => {
    for (const [, w] of weights.vertexBoundaryWeights) {
      expect(w.integral).to.equal(1);
      expect(w.psi.every(Number.isFinite)).to.equal(true);
    }
  });
});
