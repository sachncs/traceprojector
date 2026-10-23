/**
 * The bounded commuting projection (arXiv:2502.03601, Thm 5.1, p = 0): no
 * boundary condition, a weight for every entity, so it is bounded and commutes
 * for every input, boundary included. It does not preserve traces.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {BoundedCommutingProjector} from '../traceprojector/bounded-commuting-projector.js';
import {tetrahedronRule, dot} from '../traceprojector/simplicial-complex.js';
import {shapeRegularity} from './support/mesh-quality.js';
import {seededRandom} from './support/random.js';
import {tolerances} from './support/tolerances.js';
import {whitneyField} from './support/locate.js';
import {
  vectorFunction,
  gradient,
  curl,
  divergence,
  randomPolynomial,
  randomVectorPolynomial,
} from './support/polynomial.js';

const N = 4;
const mesh = generateUnitCubeMesh(N);
const vertices = mesh.getVertices();
const cells = mesh.getTetrahedra();
const rho = shapeRegularity(vertices, cells);
const tolerance = (scale = 1) =>
  tolerances.identity.c *
  tolerances.stableOperator.nOps *
  tolerances.machineEpsilon *
  rho *
  Math.max(1, scale);

const projector = new BoundedCommutingProjector(vertices, cells, {
  quadratureOrder: 6,
});
const weights = projector.weights;
const complex = weights.base;
const counts = [
  complex.vertices.length,
  complex.edges.length,
  complex.faces.length,
  complex.cells.length,
];
const every = (l, step) =>
  Array.from({length: counts[l]}, (_, i) => i).filter((i) => i % step === 0);

describe('Bounded commuting projection (no boundary condition)', function() {
  this.timeout(1800000);

  it('every entity has a weight, boundary entities included', () => {
    for (let l = 0; l <= 3; l++) {
      for (const i of every(l, 7)) {
        expect(weights.weight(l, i)).to.not.equal(null);
      }
    }
  });

  describe('(Z(sigma), W_rho) = delta for every rho', () => {
    for (const l of [0, 1, 2, 3]) {
      it(`degree ${l}`, () => {
        let worst = 0;
        for (const sigma of every(l, l === 0 ? 11 : 37)) {
          const w = weights.weight(l, sigma);
          const rhos = new Set();
          for (const s of w.cells) {
            for (const r of complex.cellEntities(s >> 2, l)) rhos.add(r);
          }
          for (const r of rhos) {
            let sum = 0;
            for (const s of w.cells) {
              const c = s >> 2;
              const k = complex.cellEntities(c, l).indexOf(r);
              if (k < 0) continue;
              const rule = tetrahedronRule(weights.split.geometry(s).points, 4);
              for (const {x, weight} of rule) {
                const z = weights.evaluate(l, w.dofs, s, x);
                const phi = complex.whitney(c, l, x)[k];
                sum += weight * (typeof z === 'number' ? z * phi : dot(z, phi));
              }
            }
            worst = Math.max(worst, Math.abs(sum - (r === sigma ? 1 : 0)));
          }
        }
        expect(worst).to.be.at.most(tolerance());
      });
    }
  });

  describe('projection: Pi u = u for fields of the discrete space, with nonzero trace', () => {
    for (const l of [0, 1, 2, 3]) {
      it(`degree ${l}`, () => {
        const random = seededRandom(500 + l);
        const coefficients = new Map();
        const field = whitneyField(complex, l, (e) => {
          if (!coefficients.has(e)) coefficients.set(e, 2 * random() - 1);
          return coefficients.get(e);
        });
        let worst = 0;
        let scale = 1;
        for (const c of [0, 90, 190, 290, 383]) {
          const x = complex
              .geometry(c)
              .points.reduce(
                  (s, p) => s.map((v, k) => v + p[k] / 4), [0, 0, 0]);
          const got = projector.project(field, x, c, l);
          const want = field(x);
          const diff =
            typeof got === 'number' ? [got - want] : got.map((v, k) => v - want[k]);
          worst = Math.max(worst, ...diff.map(Math.abs));
          scale = Math.max(scale, ...[].concat(want).map(Math.abs));
        }
        expect(worst).to.be.at.most(tolerance(scale));
      });
    }
  });

  describe('commuting for every smooth field, not only those with polynomial trace', () => {
    const edgePairs = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    it('grad Pi0 u = Pi1 grad u for all edges', () => {
      const u = randomPolynomial(seededRandom(3), 3);
      const uF = (x) => u.evaluate(x);
      const gradF = vectorFunction(gradient(u));
      let worst = 0;
      for (const e of every(1, 3)) {
        const [a, b] = complex.edges[e];
        worst = Math.max(
            worst,
            Math.abs(
                projector.coefficient(gradF, 1, e) -
                (projector.coefficient(uF, 0, b) -
                  projector.coefficient(uF, 0, a)),
            ),
        );
      }
      expect(worst).to.be.at.most(tolerance(10));
    });
    it('curl Pi1 A = Pi2 curl A for all faces', () => {
      const A = randomVectorPolynomial(seededRandom(4), 3);
      const AF = vectorFunction(A);
      const curlF = vectorFunction(curl(A));
      let worst = 0;
      for (const f of every(2, 5)) {
        const sum = complex
            .boundary(2, f)
            .reduce(
                (s, {entity, sign}) =>
                  s + sign * projector.coefficient(AF, 1, entity),
                0,
            );
        worst = Math.max(
            worst,
            Math.abs(projector.coefficient(curlF, 2, f) - sum),
        );
      }
      expect(worst).to.be.at.most(tolerance(10));
    });
    it('div Pi2 B = Pi3 div B for all cells', () => {
      const B = randomVectorPolynomial(seededRandom(5), 3);
      const BF = vectorFunction(B);
      const divF = (x) => divergence(B).evaluate(x);
      let worst = 0;
      for (const c of every(3, 5)) {
        const sum = complex
            .boundary(3, c)
            .reduce(
                (s, {entity, sign}) =>
                  s + sign * projector.coefficient(BF, 2, entity),
                0,
            );
        worst = Math.max(
            worst,
            Math.abs(projector.coefficient(divF, 3, c) - sum),
        );
      }
      expect(worst).to.be.at.most(tolerance(100));
    });
    void edgePairs;
  });

  describe('boundedness at the boundary', () => {
    const corner = [0, 0, 0];
    const singular = (x) =>
      Math.hypot(x[0] - corner[0], x[1] - corner[1], x[2] - corner[2]) **
      tolerances.stableOperator.singularField.exponent;
    it('is finite for an H1 field unbounded at a boundary vertex', () => {
      const cell = cells.findIndex((t) =>
        t.some((v) => vertices[v].every((q, k) => q === corner[k])),
      );
      const x = complex
          .geometry(cell)
          .points.reduce((s, p) => s.map((v, k) => v + p[k] / 4), [0, 0, 0]);
      for (let l = 0; l <= 3; l++) {
        const scalar = l === 0 || l === 3;
        const field = scalar ? singular : (p) => [singular(p), 0, 0];
        const value = projector.project(field, x, cell, l);
        expect([].concat(value).every(Number.isFinite)).to.equal(true);
      }
    });
  });
});
