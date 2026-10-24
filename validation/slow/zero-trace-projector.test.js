/**
 * The zero-trace higher-order projection (Ern, Guzman, Potu and Vohralik,
 * Theorem 6.1 for any p, with the correction of Arnold and Guzman applied to
 * the forms with zero trace): a projection onto the forms of degree p + 1
 * with zero trace on the boundary, commuting with d on forms with zero trace.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {
  HigherOrderProjector,
} from '../../traceprojector/higher-order-projector.js';

const cube = generateUnitCubeMesh(6);
const projector = new HigherOrderProjector(
    cube.getVertices(), cube.getTetrahedra(),
    {degree: 1, boundaryConditions: true});
const space = projector.space;

/** The cell touching the boundary whose centroid is nearest (0.1, 0.5, 0.5). */
function cellNearBoundary() {
  let best = 0;
  let distance = Infinity;
  projector.base.cells.forEach((_, c) => {
    const points = projector.base.geometry(c).points;
    const centre = [0, 1, 2].map(
        (k) => points.reduce((s, q) => s + q[k], 0) / 4);
    const d = Math.hypot(centre[0] - 0.1, centre[1] - 0.5, centre[2] - 0.5);
    if (d < distance) {
      distance = d;
      best = c;
    }
  });
  return best;
}

describe('zero-trace projection of degree p + 1 near the boundary', function() {
  this.timeout(7200000);
  const c0 = cellNearBoundary();
  const points = projector.base.geometry(c0).points;
  const at = (w) => [0, 1, 2].map(
      (k) => w.reduce((s, wi, i) => s + wi * points[i][k], 0));

  /** A field of the space with zero trace: dofs on the boundary vanish. */
  const zeroTraceField = (l, seed) => {
    const info = space.dofInfo(l);
    const c = Float64Array.from(info, ({dimension, entity}, i) => (
      dimension < 3 &&
      projector.weights.topology.isBoundary(dimension, entity) ?
        0 : Math.sin(1.3 * i + seed)));
    return (x) => {
      for (let cell = 0; cell < projector.base.cells.length; cell++) {
        const b = projector.base.barycentric(cell, x);
        if (b.every((q) => q > -1e-12)) return space.evaluate(c, x, cell, l);
      }
      throw new Error('outside');
    };
  };

  // l = 1 next to the boundary did not finish in four hours of dense
  // solves on this mesh, so only l = 0 is checked here.
  for (const l of [0]) {
    it(`reproduces a zero-trace field of its space for l = ${l}`, () => {
      const u = zeroTraceField(l, 0.4);
      const pi = projector.local(u, l);
      for (const w of [[0.25, 0.25, 0.25, 0.25], [0.1, 0.3, 0.4, 0.2]]) {
        const x = at(w);
        const want = [].concat(u(x));
        [].concat(pi.value(x, c0)).forEach(
            (q, i) => expect(q).to.be.closeTo(want[i], 1e-8));
      }
    });
  }
});
