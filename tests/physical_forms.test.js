import {expect} from 'chai';
import {AgSpace} from '../traceprojector/ag-space.js';
import {
  evaluateForm,
  physicalForm,
} from '../traceprojector/physical-forms.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

describe('physical polynomial forms', () => {
  const cube = generateUnitCubeMesh(2);
  const space = new AgSpace(cube.getVertices(), cube.getTetrahedra(),
      {degree: 1});

  for (const l of [0, 1, 2, 3]) {
    it(`l = ${l}: equals the numerically mapped basis function`, () => {
      const c = 5;
      const {basis} = space.element(l);
      const frame = space.frame(c);
      const {points} = frame;
      const x = points[0].map((q, i) => 0.4 * q + 0.2 * points[1][i] +
        0.2 * points[2][i] + 0.2 * points[3][i]);
      basis.forEach((psi, i) => {
        const symbolic = evaluateForm(physicalForm(psi, l, frame), x);
        const dofs = space.cellDofs(c, l);
        const coefficients = new Float64Array(space.size(l));
        coefficients[dofs[i]] = 1;
        const numeric = space.evaluate(coefficients, x, c, l);
        [].concat(symbolic).forEach((q, a) =>
          expect(q).to.be.closeTo([].concat(numeric)[a], 1e-9));
      });
    });
  }
});
