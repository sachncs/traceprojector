/**
 * The local weights with boundary conditions (the zero-trace operator of Ern,
 * Guzman, Potu and Vohralik, Theorem 6.1) for any polynomial degree: for an
 * entity sigma that is not on the boundary, <Z(sigma), u> = phi_sigma(u) for
 * every u of the space of degree p with zero trace, and the weights of
 * entities on the boundary vanish. At p = 0 they equal the weights of
 * `LocalWeights`.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {HighOrderWeights} from '../../traceprojector/high-order-weights.js';
import {LocalWeights} from '../../traceprojector/local-weights.js';
import {AgSpace} from '../../traceprojector/ag-space.js';

const cube = generateUnitCubeMesh(4);
const vertices = cube.getVertices();
const tets = cube.getTetrahedra();

/** The interior entity of degree l nearest to a point. */
function nearest(base, topology, l, target) {
  const count = [vertices.length, base.edges.length, base.faces.length,
    base.cells.length][l];
  let best = -1;
  let distance = Infinity;
  for (let i = 0; i < count; i++) {
    if (topology.isBoundary(l, i)) continue;
    const points = l === 0 ? [vertices[i]] : l === 1 ?
      base.edges[i].map((v) => vertices[v]) : l === 2 ?
      base.faces[i].map((v) => vertices[v]) : base.geometry(i).points;
    const centre = [0, 1, 2].map(
        (k) => points.reduce((s, q) => s + q[k], 0) / points.length);
    const d = Math.hypot(...centre.map((q, k) => q - target[k]));
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

const cellsOf = (base, l, index) => base.cells.map((_, c) => c).filter(
    (c) => [base.cells[c].includes(index), base.cellEdges[c].includes(index),
      base.cellFaces[c].includes(index), c === index][l]);

describe('local weights with the zero-trace boundary condition', function() {
  this.timeout(3600000);

  /** A field of the space with zero trace: dofs on the boundary vanish. */
  function zeroTraceField(space, topology, l, seed) {
    const info = space.dofInfo(l);
    const c = Float64Array.from(info, ({dimension, entity}, i) => (
      dimension < 3 && topology.isBoundary(dimension, entity) ? 0 :
        Math.sin(0.9 * i + seed)));
    return (x, cell) => space.evaluate(c, x, cell, l);
  }

  describe('p = 0 agrees with LocalWeights', () => {
    const how = new HighOrderWeights(vertices, tets,
        {degree: 0, boundaryConditions: true});
    const local = new LocalWeights(vertices, tets, {boundaryConditions: true});
    const space = new AgSpace(vertices, tets, {degree: 0});
    for (const l of [0, 1, 2, 3]) {
      for (const target of [[0.5, 0.5, 0.5], [0.25, 0.5, 0.5]]) {
        it(`l = ${l} near (${target})`, () => {
          const sigma = nearest(how.base, how.topology, l, target);
          const u = zeroTraceField(space, how.topology, l, 0.3);
          expect(how.pair(l, sigma, u))
              .to.be.closeTo(local.pair(l, sigma, u), 1e-10);
        });
      }
    }
  });

  describe('p = 1: <Z(sigma), u> = phi_sigma(u) for zero-trace u', () => {
    const how = new HighOrderWeights(vertices, tets,
        {degree: 1, boundaryConditions: true});
    const space = new AgSpace(vertices, tets, {degree: 1});
    for (const l of [0, 1, 2, 3]) {
      for (const target of [[0.5, 0.5, 0.5], [0.25, 0.5, 0.5]]) {
        it(`l = ${l} near (${target})`, () => {
          const sigma = nearest(how.base, how.topology, l, target);
          const u = zeroTraceField(space, how.topology, l, 1.1);
          const cell = cellsOf(how.base, l, sigma)[0];
          const phi = how.base.degreeOfFreedom(
              l, sigma, (x) => u(x, cell), 5);
          expect(how.pair(l, sigma, u)).to.be.closeTo(phi, 1e-9);
        });
      }
    }
  });
});
