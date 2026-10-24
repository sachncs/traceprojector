/**
 * The locally bounded commuting projection of Arnold and Guzman onto the
 * spaces of degree p + 1, assembled from the weights of any degree and the
 * correction Q_r. Slow (minutes): the weights are dense local solves.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {HigherOrderProjector} from '../../traceprojector/higher-order-projector.js';
import {tetrahedronRule} from '../../traceprojector/simplicial-complex.js';
import {fitSlope} from '../support/statistics.js';
import {tolerances} from '../support/tolerances.js';

/** The cell whose centroid is nearest the centre of the unit cube. */
function centralCell(projector) {
  let best = 0;
  let distance = Infinity;
  projector.base.cells.forEach((_, c) => {
    const points = projector.base.geometry(c).points;
    const centre = [0, 1, 2].map(
        (k) => points.reduce((s, q) => s + q[k], 0) / 4);
    const d = Math.hypot(centre[0] - 0.5, centre[1] - 0.5, centre[2] - 0.5);
    if (d < distance) {
      distance = d;
      best = c;
    }
  });
  return best;
}

describe('Arnold-Guzman projection of degree p + 1', function() {
  this.timeout(7200000);

  describe('p = 1 on the 4 x 4 x 4 cube', () => {
    const cube = generateUnitCubeMesh(4);
    const projector = new HigherOrderProjector(
        cube.getVertices(), cube.getTetrahedra(), {degree: 1});
    const c0 = centralCell(projector);
    const points = projector.base.geometry(c0).points;
    const at = (w) => [0, 1, 2].map(
        (k) => w.reduce((s, wi, i) => s + wi * points[i][k], 0));

    it('reproduces a quadratic (a projection onto P2)', () => {
      const quadratic = (x) => x[0] * x[0] + 2 * x[1] * x[2] -
        x[0] * x[1] + 0.3 * x[2];
      const pi = projector.local(quadratic, 0);
      for (const w of [[0.25, 0.25, 0.25, 0.25], [0.1, 0.3, 0.4, 0.2]]) {
        const x = at(w);
        expect(pi.value(x, c0)).to.be.closeTo(quadratic(x), 1e-10);
      }
    });

    const smooth = {
      0: {
        u: (x) => Math.sin(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[0] * x[1],
        du: (x) => [
          Math.cos(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[1],
          0.5 * Math.cos(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[0],
          -Math.sin(x[0] + 0.5 * x[1]) * Math.sin(x[2]),
        ],
      },
      1: {
        u: (x) => [Math.sin(x[1]) + x[2] * x[2], Math.cos(x[2]) * x[0],
          Math.exp(0.3 * x[0]) + x[1]],
        du: (x) => [
          1 + Math.sin(x[2]) * x[0],
          2 * x[2] - 0.3 * Math.exp(0.3 * x[0]),
          Math.cos(x[2]) - Math.cos(x[1]),
        ],
      },
      2: {
        u: (x) => [Math.sin(x[1]) * x[2] + x[0], x[0] * x[0] + x[2] * x[1],
          Math.cos(x[0]) + x[1] * x[2]],
        du: (x) => 1 + x[2] + x[1] - Math.sin(x[0]) * 0 + x[1] * 0 +
          x[2] * 0 + 0 * x[0],
      },
    };
    // d/dx of the first, second and third components of the l = 2 field.
    smooth[2].du = (x) => 1 + x[2] + x[1];

    for (const l of [0, 1, 2]) {
      it(`commutes with d between degrees ${l} and ${l + 1}`, () => {
        const {u, du} = smooth[l];
        const lower = projector.local(u, l);
        const upper = projector.local(du, l + 1);
        for (const w of [[0.4, 0.2, 0.2, 0.2], [0.1, 0.3, 0.4, 0.2]]) {
          const x = at(w);
          const left = [].concat(lower.derivative(x, c0));
          const right = [].concat(upper.value(x, c0));
          const diff = Math.hypot(...left.map((q, i) => q - right[i]));
          console.log(`      l = ${l}: difference ${diff.toExponential(2)}`);
          expect(diff).to.be.below(1e-9);
        }
      });
    }

    for (const l of [1, 2, 3]) {
      it(`reproduces a field of its space for l = ${l}`, () => {
        const space = projector.space;
        const c = Float64Array.from({length: space.size(l)},
            (_, i) => Math.sin(1.3 * i + 0.2));
        // The function is the global field with these coefficients.
        const u = (x) => {
          for (let cell = 0; cell < projector.base.cells.length; cell++) {
            const b = projector.base.barycentric(cell, x);
            if (b.every((q) => q > -1e-12)) {
              return space.evaluate(c, x, cell, l);
            }
          }
          throw new Error('outside');
        };
        const pi = projector.local(u, l);
        const x = at([0.25, 0.25, 0.25, 0.25]);
        const want = [].concat(u(x));
        const got = [].concat(pi.value(x, c0));
        got.forEach((q, i) => expect(q).to.be.closeTo(want[i], 1e-8));
      });
    }
  });

  describe('stability of pi at p = 1 on narrow bumps', () => {
    const bumpNormSquared = (delta) => {
      let sum = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) {
        const s = (i + 0.5) / N;
        sum += (1 - s * s) ** 4 * s * s / N;
      }
      return 4 * Math.PI * sum * delta ** 3;
    };

    const direction = [1, -2, 0.5];

    function worstRatio(n, l) {
      const cube = generateUnitCubeMesh(n);
      const projector = new HigherOrderProjector(
          cube.getVertices(), cube.getTetrahedra(), {degree: 1});
      const complex = projector.base;
      // A vertex near the centre of the cube, and the cells within 2 rings.
      const centre = complex.vertices.reduce((best, v, i) => {
        const d = Math.hypot(v[0] - 0.5, v[1] - 0.5, v[2] - 0.5);
        return d < best.d ? {i, d} : best;
      }, {i: -1, d: Infinity});
      const x0 = complex.vertices[centre.i];
      let touching = new Set([centre.i]);
      const cells = new Set();
      for (let ring = 0; ring < 2; ring++) {
        complex.cells.forEach((t, k) => {
          if (t.some((v) => touching.has(v))) cells.add(k);
        });
        touching = new Set([...cells].flatMap((k) => complex.cells[k]));
      }
      let worst = 0;
      for (const delta of [1 / n, 1 / (2 * n)]) {
        const bump = (x) => {
          const s = Math.hypot(x[0] - x0[0], x[1] - x0[1], x[2] - x0[2]) /
            delta;
          return s < 1 ? (1 - s * s) ** 2 : 0;
        };
        const field = l === 0 || l === 3 ? bump :
          (x) => direction.map((q) => q * bump(x));
        const pi = projector.local(field, l);
        let sum = 0;
        for (const c of cells) {
          for (const {x, weight} of tetrahedronRule(
              complex.geometry(c).points, 6)) {
            const value = pi.value(x, c);
            sum += weight * (typeof value === 'number' ? value ** 2 :
              value.reduce((acc, q) => acc + q * q, 0));
          }
        }
        const scale = l === 0 || l === 3 ? 1 :
          direction.reduce((acc, q) => acc + q * q, 0);
        worst = Math.max(
            worst, Math.sqrt(sum / (scale * bumpNormSquared(delta))));
      }
      return worst;
    }

    for (const l of [0, 1, 2, 3]) {
      it(`degree ${l}: the constant does not grow as h shrinks`, () => {
        const sizes = [4, 5, 6];
        const logH = [];
        const logC = [];
        for (const n of sizes) {
          const ratio = worstRatio(n, l);
          console.log(`      n = ${n}: largest ratio ${ratio.toFixed(3)}`);
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
});
