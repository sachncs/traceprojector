/**
 * Floating-point policy for geometric decisions (criterion A9): orientation and
 * degeneracy must not depend on the unit system, and must agree with exact
 * arithmetic.
 */
import {expect} from 'chai';
import {orient3d} from 'robust-predicates';
import {Mesh, Whitney, Projector} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {relativeVolume, MIN_RELATIVE_VOLUME} from '../traceprojector/utils.js';
import {ValidateError} from '../traceprojector/errors.js';
import {seededRandom} from './support/random.js';
import {tolerances} from './support/tolerances.js';

const [LOW, HIGH] = tolerances.geometry.scaleExponents;

/** Sign of the exact determinant det[b-a, c-a, d-a] (positive = right-handed).
 * */
function exactOrientation(a, b, c, d) {
  // robust-predicates: positive when d lies below the plane through a, b, c
  // counterclockwise seen from above, which is the opposite handedness.
  return -Math.sign(
      orient3d(
          a[0],
          a[1],
          a[2],
          b[0],
          b[1],
          b[2],
          c[0],
          c[1],
          c[2],
          d[0],
          d[1],
          d[2],
      ),
  );
}

describe('Floating-point policy for geometry', function() {
  this.timeout(600000);

  describe('the exact predicate oracle', () => {
    it('agrees with the library determinant on a well-conditioned tetrahedron', () => {
      const t = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      expect(exactOrientation(...t)).to.equal(1);
      expect(Math.sign(relativeVolume(t))).to.equal(1);
      expect(exactOrientation(t[1], t[0], t[2], t[3])).to.equal(-1);
    });
  });

  describe('unit invariance: the same mesh in any unit system is accepted and projected exactly', () => {
    for (let k = LOW; k <= HIGH; k += 2) {
      it(`unit cube scaled by 10^${k}`, () => {
        const scale = 10 ** k;
        const base = generateUnitCubeMesh(2);
        const vertices = base.getVertices().map((v) => v.map((q) => q * scale));
        const mesh = new Mesh(vertices, base.getTetrahedra());
        const projector = new Projector(mesh, new Whitney(mesh), {
          onWarning: () => {},
        });
        projector.computeBoundaryWeights();
        expect(projector.verifyBoundaryWeights(1e-6).ok).to.equal(true);
        const [first, , , last] = mesh.getTetrahedra()[0];
        const from = mesh.getVertices()[first];
        const to = mesh.getVertices()[last];
        const point = from.map((q, i) => q + 0.1 * (to[i] - q));
        const value = projector.projectH1(
            (x) => x[0] + 2 * x[1] + 3 * x[2],
            point,
            0,
        );
        const expected = point[0] + 2 * point[1] + 3 * point[2];
        expect(Math.abs(value - expected)).to.be.at.most(1e-10 * scale);
      });
    }
  });

  describe('large coordinate offsets', () => {
    for (const offset of [1e3, 1e6, 1e8]) {
      it(`unit cube translated by ${offset}`, () => {
        const base = generateUnitCubeMesh(2);
        const vertices = base
            .getVertices()
            .map((v) => v.map((q) => q + offset));
        expect(() => new Mesh(vertices, base.getTetrahedra())).to.not.throw();
      });
    }
  });

  describe('orientation decisions agree with exact arithmetic on near-degenerate tetrahedra', () => {
    /** The library's classification of a tetrahedron, from its relative volume.
     * */
    const classify = (a, b, c, d) => {
      const rv = relativeVolume([a, b, c, d]);
      if (!(Math.abs(rv) >= MIN_RELATIVE_VOLUME)) return 'degenerate';
      return rv > 0 ? 'valid' : 'inverted';
    };

    it(`${tolerances.geometry.nearDegenerateTets} random nearly flat tetrahedra`, () => {
      const random = seededRandom(2024);
      const counts = {valid: 0, inverted: 0, degenerate: 0};
      let wrongOrientation = 0;
      let wronglyDegenerate = 0;
      const examples = [];
      for (let i = 0; i < tolerances.geometry.nearDegenerateTets; i++) {
        // Three random points, and a fourth at a relative distance 10^-3 ..
        // 10^-17 from their plane.
        const p = () => [random(), random(), random()];
        const a = p();
        const b = p();
        const c = p();
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        const length = Math.hypot(...n);
        if (length < 1e-6) continue;
        const s = random() - 0.5;
        const t = random() - 0.5;
        const height = (random() - 0.5) * 10 ** (-3 - 14 * random());
        const d = a.map(
            (q, k) => q + s * u[k] + t * v[k] + (height * n[k]) / length,
        );
        const exact = exactOrientation(a, b, c, d);
        const decision = classify(a, b, c, d);
        counts[decision]++;
        // A tetrahedron the library accepts or calls inverted must be so in
        // exact arithmetic.
        if (
          (decision === 'valid' && exact !== 1) ||
          (decision === 'inverted' && exact !== -1)
        ) {
          wrongOrientation++;
          if (examples.length < 3) examples.push({decision, exact, height});
        }
        // Nothing comfortably above the floor may be called degenerate.
        const longest = Math.max(
            ...[
              [a, b],
              [a, c],
              [a, d],
              [b, c],
              [b, d],
              [c, d],
            ].map(([x, y]) =>
              Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])),
        );
        const exactRelative =
          (((Math.abs(height) * length) / 2) * 1) / longest ** 3;
        if (
          decision === 'degenerate' &&
          exactRelative > 100 * MIN_RELATIVE_VOLUME
        ) {
          wronglyDegenerate++;
        }
      }
      expect(wrongOrientation, JSON.stringify(examples)).to.equal(0);
      expect(wronglyDegenerate).to.equal(0);
      // Sanity: the sample really straddles the floor.
      expect(counts.valid).to.be.above(1000);
      expect(counts.degenerate).to.be.above(1000);
    });
  });

  describe('degenerate input is rejected with a typed error', () => {
    it('a flat tetrahedron is rejected', () => {
      const flat = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      expect(() => new Mesh(flat, [[0, 1, 2, 3]])).to.throw(ValidateError);
    });
  });
});
