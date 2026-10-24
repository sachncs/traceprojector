import {expect} from 'chai';
import {HigherOrderProjector} from '../../traceprojector/higher-order-projector.js';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';

const cube = generateUnitCubeMesh(2);
const vertices = cube.getVertices();
const tets = cube.getTetrahedra();

describe('the correction Q_r of Arnold and Guzman', function() {
  this.timeout(600000);
  const projector = new HigherOrderProjector(vertices, tets, {degree: 1});
  const space = projector.space;

  for (const l of [0, 1, 2, 3]) {
    it(`l = ${l}: Q is the identity on M_r, the forms with no lowest-order dofs`, () => {
      const info = space.dofInfo(l);
      const c = Float64Array.from(info, ({kind}, i) =>
        (kind === 'closed' || kind === 'coclosed' ? Math.sin(1.7 * i + 0.4) : 0));
      const w = (x, cell) => space.evaluate(c, x, cell, l);
      const back = projector.correctionCoefficients(w, l);
      back.forEach((value, i) => expect(value).to.be.closeTo(c[i], 1e-8));
    });
  }

  // A smooth form-degree-l field with its derivative.
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
      u: (x) => [Math.sin(x[1]) * x[2], x[0] * x[0] + x[2], Math.cos(x[0])],
      du: () => 0,
    },
  };

  for (const l of [0, 1, 2]) {
    it(`l = ${l}: d Q u = Q d u`, () => {
      const {u, du} = smooth[l];
      const left = projector.correctionCoefficients((x) => u(x), l);
      const right = projector.correctionCoefficients((x) => du(x), l + 1);
      projector.space.complex.cells.forEach((_, c) => {
        const {points} = projector.space.complex.geometry(c);
        const x = points[0].map((q, i) => 0.4 * q + 0.2 * points[1][i] +
          0.2 * points[2][i] + 0.2 * points[3][i]);
        const want = [].concat(space.evaluate(right, x, c, l + 1));
        const got = [].concat(space.derivative(left, x, c, l));
        got.forEach((q, i) => expect(q).to.be.closeTo(want[i], 1e-7));
      });
    });
  }
});
