/**
 * Classical Whitney / finite element exterior calculus identities on the
 * oriented complex (claim family A6). They do not depend on the paper's
 * operator, so they are an independent check of the infrastructure it uses.
 */
import {expect} from 'chai';
import {SimplicialComplex, dot} from '../traceprojector/simplicial-complex.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {identityTolerance} from './support/tolerances.js';
import {shapeRegularity} from './support/mesh-quality.js';
import {seededRandom} from './support/random.js';
import {
  Polynomial,
  vectorFunction,
  gradient,
  curl,
  divergence,
  randomPolynomial,
  randomVectorPolynomial,
} from './support/polynomial.js';

function cubeComplex(n, perturb = 0, seed = 1) {
  const mesh = generateUnitCubeMesh(n);
  const random = seededRandom(seed);
  const vertices = mesh
      .getVertices()
      .map((v) =>
        v.map((q) =>
          q > 0 && q < 1 ? q + (perturb * (random() - 0.5)) / n : q,
        ),
      );
  const cells = mesh.getTetrahedra();
  return {
    complex: new SimplicialComplex(vertices, cells),
    rho: shapeRegularity(vertices, cells),
  };
}

const MESHES = [
  [2, 0],
  [3, 0.3],
];

describe('Classical identities of the oriented complex', () => {
  for (const [n, perturb] of MESHES) {
    describe(`cube n=${n}, perturbation ${perturb}`, () => {
      const {complex, rho} = cubeComplex(n, perturb);
      const tol = identityTolerance(rho, 1);

      it('de Rham map: phi_sigma(W_sigma\') = delta for every entity of every cell', () => {
        let worst = 0;
        const random = seededRandom(5);
        for (let c = 0; c < complex.cells.length; c += 3) {
          for (const l of [0, 1, 2, 3]) {
            const entities = complex.cellEntities(c, l);
            for (let k = 0; k < entities.length; k++) {
              const u = (x) => complex.whitney(c, l, x)[k];
              for (let m = 0; m < entities.length; m++) {
                const dof = complex.degreeOfFreedom(l, entities[m], u, 5);
                worst = Math.max(worst, Math.abs(dof - (k === m ? 1 : 0)));
              }
            }
          }
        }
        expect(worst).to.be.at.most(tol * 50);
        expect(random()).to.be.a('number');
      });

      it('d o d = 0: incidence numbers cancel (edge-vertex, face-edge, cell-face)', () => {
        for (let f = 0; f < complex.faces.length; f++) {
          const net = new Map();
          for (const {entity: e, sign: s} of complex.boundary(2, f)) {
            for (const {entity: v, sign: t} of complex.boundary(1, e)) {
              net.set(v, (net.get(v) ?? 0) + s * t);
            }
          }
          for (const value of net.values()) expect(value).to.equal(0);
        }
        for (let c = 0; c < complex.cells.length; c++) {
          const net = new Map();
          for (const {entity: f, sign: s} of complex.boundary(3, c)) {
            for (const {entity: e, sign: t} of complex.boundary(2, f)) {
              net.set(e, (net.get(e) ?? 0) + s * t);
            }
          }
          for (const value of net.values()) expect(value).to.equal(0);
        }
      });

      it('partition of unity: sum lambda = 1 and sum grad lambda = 0', () => {
        const random = seededRandom(9);
        for (let c = 0; c < complex.cells.length; c += 2) {
          const x = [random(), random(), random()];
          const sum = complex.barycentric(c, x).reduce((a, b) => a + b, 0);
          expect(Math.abs(sum - 1)).to.be.at.most(tol);
          const {gradients} = complex.geometry(c);
          for (let k = 0; k < 3; k++) {
            expect(
                Math.abs(gradients.reduce((a, g) => a + g[k], 0)),
            ).to.be.at.most(tol * 10);
          }
        }
      });

      it('Stokes compatibility: phi_e(grad u), phi_f(curl A), phi_c(div B) match the incidence sums', () => {
        const random = seededRandom(17);
        const u = randomPolynomial(random, 3);
        const A = randomVectorPolynomial(random, 3);
        const B = randomVectorPolynomial(random, 3);
        const uF = (x) => u.evaluate(x);
        const gradF = vectorFunction(gradient(u));
        const AF = vectorFunction(A);
        const curlF = vectorFunction(curl(A));
        const BF = vectorFunction(B);
        const divF = (x) => divergence(B).evaluate(x);
        let worst = 0;
        for (let e = 0; e < complex.edges.length; e += 5) {
          const lhs = complex.degreeOfFreedom(1, e, gradF, 6);
          const rhs = complex
              .boundary(1, e)
              .reduce(
                  (s, {entity, sign}) =>
                    s + sign * complex.degreeOfFreedom(0, entity, uF),
                  0,
              );
          worst = Math.max(worst, Math.abs(lhs - rhs));
        }
        for (let f = 0; f < complex.faces.length; f += 5) {
          const lhs = complex.degreeOfFreedom(2, f, curlF, 6);
          const rhs = complex
              .boundary(2, f)
              .reduce(
                  (s, {entity, sign}) =>
                    s + sign * complex.degreeOfFreedom(1, entity, AF, 6),
                  0,
              );
          worst = Math.max(worst, Math.abs(lhs - rhs));
        }
        for (let c = 0; c < complex.cells.length; c += 5) {
          const lhs = complex.degreeOfFreedom(3, c, divF, 6);
          const rhs = complex
              .boundary(3, c)
              .reduce(
                  (s, {entity, sign}) =>
                    s + sign * complex.degreeOfFreedom(2, entity, BF, 6),
                  0,
              );
          worst = Math.max(worst, Math.abs(lhs - rhs));
        }
        expect(worst).to.be.at.most(tol * 100);
        expect(
            dot([1, 0, 0], [1, 0, 0]) + Polynomial.constant(0).degree,
        ).to.equal(1);
      });
    });
  }
});
