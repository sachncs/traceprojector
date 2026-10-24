/**
 * Identity claims K1-K3 of docs/VALIDATION.md, tested on the operator the
 * library actually implements, with the pre-registered tolerance rule.
 */
import {expect} from 'chai';
import {identityTolerance} from './support/tolerances.js';
import {seededRandom} from './support/random.js';
import {
  Polynomial,
  X,
  Y,
  Z,
  vectorFunction,
  gradient,
  curl,
  divergence,
  randomPolynomial,
  randomVectorPolynomial,
} from './support/polynomial.js';
import {
  cubeFixture,
  pointIn,
  randomBary,
  sampleCells,
  applyPi,
  maxAbs,
  sub,
} from './support/fixtures.js';

const MESH_SIZES = [2, 3, 4];

/** Field in the lowest-order space V_0^l (global, so exactly representable). */
function fieldInDiscreteSpace(random, l) {
  const c = () => Polynomial.constant(2 * random() - 1);
  switch (l) {
    case 0:
      return [
        c()
            .add(X.scale(2 * random() - 1))
            .add(Y.scale(2 * random() - 1))
            .add(Z.scale(2 * random() - 1)),
      ];
    case 1: {
      // a + b x position vector (Nedelec, lowest order)
      const b = [c(), c(), c()];
      const a = [c(), c(), c()];
      const x = [X, Y, Z];
      const cross = [
        b[1].multiply(x[2]).add(b[2].multiply(x[1]).scale(-1)),
        b[2].multiply(x[0]).add(b[0].multiply(x[2]).scale(-1)),
        b[0].multiply(x[1]).add(b[1].multiply(x[0]).scale(-1)),
      ];
      return [0, 1, 2].map((k) => a[k].add(cross[k]));
    }
    case 2: {
      // a + s x (Raviart-Thomas, lowest order)
      const s = c();
      const x = [X, Y, Z];
      return [0, 1, 2].map((k) => c().add(s.multiply(x[k])));
    }
    default:
      return [c()];
  }
}

const asFunction = (field) =>
  field.length === 1 ? (p) => field[0].evaluate(p) : vectorFunction(field);

describe('K1: Pi u = u for u in the discrete space', () => {
  for (const n of MESH_SIZES) {
    for (const l of [0, 1, 2, 3]) {
      it(`l=${l}, cube mesh n=${n}`, () => {
        const {mesh, projector, rho} = cubeFixture(n);
        const random = seededRandom(1000 * n + l);
        const field = fieldInDiscreteSpace(random, l);
        const u = asFunction(field);
        let worst = 0;
        for (const tIdx of sampleCells(mesh, 40)) {
          const p = pointIn(mesh, tIdx, randomBary(random));
          const diff = sub(applyPi(projector, u, p, tIdx, l), u(p));
          worst = Math.max(worst, maxAbs([].concat(diff)));
        }
        expect(worst).to.be.at.most(identityTolerance(rho, 2));
      });
    }
  }
});

/** Zero-trace bubble on the unit cube. */
const bubble = X.multiply(Polynomial.constant(1).add(X.scale(-1)))
    .multiply(Y)
    .multiply(Polynomial.constant(1).add(Y.scale(-1)))
    .multiply(Z)
    .multiply(Polynomial.constant(1).add(Z.scale(-1)));

/** Boundary points: barycentric point on a boundary face of a boundary cell. */
function boundaryPoints(mesh, random, maxCount) {
  const v = mesh.getVertices();
  const out = [];
  for (const tIdx of sampleCells(mesh, 400)) {
    const t = mesh.getTetrahedra()[tIdx];
    for (let opposite = 0; opposite < 4; opposite++) {
      const face = [0, 1, 2, 3].filter((i) => i !== opposite);
      for (const axis of [0, 1, 2]) {
        for (const value of [0, 1]) {
          if (face.every((i) => v[t[i]][axis] === value)) {
            const bary = [0, 0, 0, 0];
            const w = [0.2 + random(), 0.2 + random(), 0.2 + random()];
            const s = w[0] + w[1] + w[2];
            face.forEach((i, k) => {
              bary[i] = w[k] / s;
            });
            out.push({tIdx, point: pointIn(mesh, tIdx, bary), axis});
          }
        }
      }
    }
    if (out.length >= maxCount) break;
  }
  return out;
}

describe('K2: trace preservation for u in V_tr,p (polynomial trace, arbitrary interior)', () => {
  for (const n of MESH_SIZES) {
    it(`l=0, n=${n}: Pi(bubble) has zero trace`, () => {
      const {mesh, projector, rho} = cubeFixture(n);
      const random = seededRandom(7 * n);
      let worst = 0;
      for (const {tIdx, point} of boundaryPoints(mesh, random, 60)) {
        worst = Math.max(
            worst,
            Math.abs(
                applyPi(projector, (q) => bubble.evaluate(q), point, tIdx, 0),
            ),
        );
      }
      expect(worst).to.be.at.most(identityTolerance(rho, 1));
    });
    it(`l=1, n=${n}: Pi(grad bubble) has zero tangential trace`, () => {
      const {mesh, projector, rho} = cubeFixture(n);
      const random = seededRandom(11 * n);
      const u = vectorFunction(gradient(bubble));
      let worst = 0;
      for (const {tIdx, point, axis} of boundaryPoints(mesh, random, 60)) {
        const w = applyPi(projector, u, point, tIdx, 1);
        worst = Math.max(worst, maxAbs(w.filter((_, k) => k !== axis)));
      }
      expect(worst).to.be.at.most(identityTolerance(rho, 1));
    });
    it(`l=2, n=${n}: Pi(curl(bubble e)) has zero normal trace`, () => {
      const {mesh, projector, rho} = cubeFixture(n);
      const random = seededRandom(13 * n);
      const field = curl([
        bubble,
        Polynomial.constant(0),
        Polynomial.constant(0),
      ]);
      const u = vectorFunction(field);
      let worst = 0;
      for (const {tIdx, point, axis} of boundaryPoints(mesh, random, 60)) {
        const w = applyPi(projector, u, point, tIdx, 2);
        worst = Math.max(worst, Math.abs(w[axis]));
      }
      expect(worst).to.be.at.most(identityTolerance(rho, 1));
    });
  }
});

/** Central finite difference; exact (up to roundoff) for the affine Pi u in a
 * cell. */
function derivatives(evaluate, point, step) {
  const d = [0, 1, 2].map((axis) => {
    const plus = point.slice();
    const minus = point.slice();
    plus[axis] += step;
    minus[axis] -= step;
    const fp = evaluate(plus);
    const fm = evaluate(minus);
    return []
        .concat(fp)
        .map((value, k) => (value - [].concat(fm)[k]) / (2 * step));
  });
  return d; // d[axis][component]
}

describe('K3: d Pi u = Pi d u for smooth u (not only u in V_p)', () => {
  for (const n of MESH_SIZES) {
    it(`l=0: grad Pi0 u = Pi1 grad u, n=${n}`, () => {
      const {mesh, projector, rho} = cubeFixture(n);
      const random = seededRandom(31 * n);
      const u = randomPolynomial(random, 2);
      const gradU = vectorFunction(gradient(u));
      let worst = 0;
      for (const tIdx of sampleCells(mesh, 40)) {
        const p = pointIn(mesh, tIdx, randomBary(random));
        const step = 0.01 / n;
        const d = derivatives(
            (q) => applyPi(projector, (r) => u.evaluate(r), q, tIdx, 0),
            p,
            step,
        );
        const lhs = [d[0][0], d[1][0], d[2][0]];
        worst = Math.max(
            worst,
            maxAbs(sub(lhs, applyPi(projector, gradU, p, tIdx, 1))),
        );
      }
      expect(worst).to.be.at.most(identityTolerance(rho, 20));
    });
    it(`l=1: curl Pi1 A = Pi2 curl A, n=${n}`, () => {
      const {mesh, projector, rho} = cubeFixture(n);
      const random = seededRandom(37 * n);
      const A = randomVectorPolynomial(random, 2);
      const curlA = vectorFunction(curl(A));
      let worst = 0;
      for (const tIdx of sampleCells(mesh, 40)) {
        const p = pointIn(mesh, tIdx, randomBary(random));
        const d = derivatives(
            (q) => applyPi(projector, vectorFunction(A), q, tIdx, 1),
            p,
            0.01 / n,
        );
        const lhs = [d[1][2] - d[2][1], d[2][0] - d[0][2], d[0][1] - d[1][0]];
        worst = Math.max(
            worst,
            maxAbs(sub(lhs, applyPi(projector, curlA, p, tIdx, 2))),
        );
      }
      expect(worst).to.be.at.most(identityTolerance(rho, 20));
    });
    it(`l=2: div Pi2 B = Pi3 div B, n=${n}`, () => {
      const {mesh, projector, rho} = cubeFixture(n);
      const random = seededRandom(41 * n);
      const B = randomVectorPolynomial(random, 2);
      const divB = divergence(B);
      let worst = 0;
      for (const tIdx of sampleCells(mesh, 40)) {
        const p = pointIn(mesh, tIdx, randomBary(random));
        const d = derivatives(
            (q) => applyPi(projector, vectorFunction(B), q, tIdx, 2),
            p,
            0.01 / n,
        );
        const lhs = d[0][0] + d[1][1] + d[2][2];
        const rhs = applyPi(projector, (q) => divB.evaluate(q), p, tIdx, 3);
        worst = Math.max(worst, Math.abs(lhs - rhs));
      }
      expect(worst).to.be.at.most(identityTolerance(rho, 20));
    });
  }
});
