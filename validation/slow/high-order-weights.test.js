/**
 * The local weights of any polynomial degree (Arnold and Guzman 2021,
 * Theorem 6.2; Ern, Guzman, Potu and Vohralik, Theorem 5.1): for every vertex,
 * edge, face and cell sigma, <Z(sigma), u> equals the lowest-order degree of
 * freedom phi_sigma(u) for every u in the full space of degree p, and the
 * weights are related by -div Z^1 = sum Z^0, curl Z^2 = sum Z^1,
 * -grad Z^3 = sum Z^2. At p = 0 they must equal the weights of
 * `LocalWeights`.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {HighOrderWeights} from '../../traceprojector/high-order-weights.js';
import {LocalWeights} from '../../traceprojector/local-weights.js';
import {AgSpace} from '../../traceprojector/ag-space.js';
import {
  differential,
  evaluateForm,
} from '../../traceprojector/physical-forms.js';

const cube = generateUnitCubeMesh(4);
const vertices = cube.getVertices();
const tets = cube.getTetrahedra();

/** The entity of degree l whose centre is nearest the centre of the cube. */
function central(base, l) {
  const count = [vertices.length, base.edges.length, base.faces.length,
    base.cells.length][l];
  let best = -1;
  let distance = Infinity;
  for (let i = 0; i < count; i++) {
    const points = l === 0 ? [vertices[i]] : l === 1 ?
      base.edges[i].map((v) => vertices[v]) : l === 2 ?
      base.faces[i].map((v) => vertices[v]) : base.geometry(i).points;
    const centre = [0, 1, 2].map(
        (k) => points.reduce((s, q) => s + q[k], 0) / points.length);
    const d = Math.hypot(centre[0] - 0.5, centre[1] - 0.5, centre[2] - 0.5);
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

describe('local weights of any degree', function() {
  this.timeout(3600000);

  describe('p = 0 agrees with LocalWeights', () => {
    const how = new HighOrderWeights(vertices, tets, {degree: 0});
    const local = new LocalWeights(vertices, tets, {boundaryConditions: false});
    const space = new AgSpace(vertices, tets, {degree: 0});
    for (const l of [0, 1, 2, 3]) {
      it(`l = ${l}: the pairings are equal`, () => {
        const sigma = central(how.base, l);
        const c = Float64Array.from({length: space.size(l)},
            (_, i) => Math.sin(0.9 * i + 0.3));
        const u = (x, cell) => space.evaluate(c, x, cell, l);
        expect(how.pair(l, sigma, u))
            .to.be.closeTo(local.pair(l, sigma, u), 1e-10);
      });
    }
  });

  for (const p of [0, 1]) {
    describe(`p = ${p}: <Z(sigma), u> = phi_sigma(u) on the whole space`, () => {
      const how = new HighOrderWeights(vertices, tets, {degree: p});
      const space = new AgSpace(vertices, tets, {degree: p});
      for (const l of [0, 1, 2, 3]) {
        it(`l = ${l}`, () => {
          const sigma = central(how.base, l);
          for (const seed of [0.3, 1.1]) {
            const c = Float64Array.from({length: space.size(l)},
                (_, i) => Math.sin(0.9 * i + seed));
            const u = (x, cell) => space.evaluate(c, x, cell, l);
            const cell = cellsOf(how.base, l, sigma)[0];
            const phi = how.base.degreeOfFreedom(
                l, sigma, (x) => u(x, cell), p + 4);
            expect(how.pair(l, sigma, u)).to.be.closeTo(phi, 1e-9);
          }
        });
      }
    });
  }

  describe('p = 1: the weights satisfy the differential relations', () => {
    const how = new HighOrderWeights(vertices, tets, {degree: 1});
    it('-div Z^1(e) = Z^0(b) - Z^0(a) on every piece', () => {
      const e = central(how.base, 1);
      const [a, b] = how.base.edges[e];
      const z = how.weight(1, e);
      const za = how.weight(0, a);
      const zb = how.weight(0, b);
      const find = (weight, piece) => weight.pieces.find(
          (q) => q.cell === piece.cell && q.k === piece.k);
      let checked = 0;
      for (const piece of z.pieces) {
        const x = piece.points[0].map((q, i) => 0.4 * q +
          0.2 * piece.points[1][i] + 0.2 * piece.points[2][i] +
          0.2 * piece.points[3][i]);
        const divergence = evaluateForm(differential(piece.form, 2), x);
        const pa = find(za, piece);
        const pb = find(zb, piece);
        const target = (pb ? evaluateForm(pb.form, x) : 0) -
          (pa ? evaluateForm(pa.form, x) : 0);
        expect(-divergence).to.be.closeTo(target, 1e-8);
        checked++;
      }
      expect(checked).to.be.above(0);
    });
  });
});
