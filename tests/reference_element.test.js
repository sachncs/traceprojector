import {expect} from 'chai';
import {
  carriers,
  countOn,
  moments,
  referenceBasis,
} from '../traceprojector/reference-element.js';
import {formSpace} from '../traceprojector/polynomial-forms.js';

const REFERENCE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dimension = (r, k) => [
  (r + 1) * (r + 2) * (r + 3) / 6,
  r * (r + 2) * (r + 3) / 2,
  r * (r + 1) * (r + 3) / 2,
  r * (r + 1) * (r + 2) / 6,
][k];

describe('canonical degrees of freedom on the reference tetrahedron', () => {
  for (const r of [1, 2, 3]) {
    for (const k of [0, 1, 2, 3]) {
      it(`P_${r}^- Lambda^${k}: ${dimension(r, k)} dofs, dual basis`, () => {
        const total = carriers(r, k).reduce(
            (sum, c) => sum + countOn(c, k), 0);
        expect(total).to.equal(dimension(r, k));
        expect(formSpace(r, k).length).to.equal(total);
        const {basis, carriers: list, offsets} = referenceBasis(r, k);
        // dof_a(psi_b) = delta_ab for every pair.
        basis.forEach((psi, b) => {
          const evaluate = (x) => (Array.isArray(psi) ?
            psi.map((p) => p.evaluate(x)) : psi.evaluate(x));
          list.forEach((c, ci) => {
            moments(k, c, REFERENCE, evaluate, r + 3).forEach((value, t) => {
              expect(value).to.be.closeTo(
                  offsets[ci] + t === b ? 1 : 0, 1e-9);
            });
          });
        });
      });
    }
  }

  it('at lowest order the dofs are the Whitney dofs', () => {
    // r = 1: vertex values, edge circulations, face fluxes, cell integral.
    const edge = carriers(1, 1).find((c) => c.vertices.join() === '0,1');
    expect(moments(1, edge, REFERENCE, () => [3, 5, 7], 4)[0])
        .to.be.closeTo(3, 1e-12);
    const face = carriers(1, 2).find((c) => c.vertices.join() === '1,2,3');
    // The normal (b - a) x (c - a) of the face e1, e2, e3 is (1, 1, 1), and
    // the face has area measure 1/2 in the reference triangle.
    expect(moments(2, face, REFERENCE, () => [1, 1, 1], 4)[0])
        .to.be.closeTo(3 / 2, 1e-12);
  });
});
