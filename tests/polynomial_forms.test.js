import {expect} from 'chai';
import {
  Polynomial,
  formSpace,
  differential,
  rank,
} from '../traceprojector/polynomial-forms.js';

// dim P_r^- Lambda^k on a tetrahedron (Arnold, Falk, Winther, Table 5.1).
const dimension = (r, k) => [
  (r + 1) * (r + 2) * (r + 3) / 6,
  r * (r + 2) * (r + 3) / 2,
  r * (r + 1) * (r + 3) / 2,
  r * (r + 1) * (r + 2) / 6,
][k];

describe('polynomial forms', () => {
  it('differentiates and evaluates polynomials', () => {
    const p = Polynomial.monomial([2, 1, 0])
        .add(Polynomial.monomial([0, 0, 1]));
    expect(p.evaluate([2, 3, 5])).to.equal(2 * 2 * 3 + 5);
    expect(p.derivative(0).evaluate([2, 3, 5])).to.equal(2 * 2 * 3);
    expect(p.derivative(2).evaluate([2, 3, 5])).to.equal(1);
  });

  for (const r of [1, 2, 3]) {
    for (const k of [0, 1, 2, 3]) {
      it(`P_${r}^- Lambda^${k} has dimension ${dimension(r, k)}`, () => {
        expect(formSpace(r, k).length).to.equal(dimension(r, k));
      });
    }
  }

  for (const r of [1, 2, 3]) {
    it(`d maps P_${r}^- Lambda^k into P_${r}^- Lambda^(k+1)`, () => {
      for (const k of [0, 1, 2]) {
        const target = formSpace(r, k + 1);
        const images = formSpace(r, k).map((form) => differential(form, k));
        expect(rank([...target, ...images])).to.equal(target.length);
      }
    });

    it(`the complex of degree ${r} is exact`, () => {
      // dim ker d on Lambda^k = dim image of d on Lambda^(k-1); the constants
      // form the kernel on 0-forms and the image on 3-forms is everything.
      const rankOfD = [0, 1, 2].map((k) => rank(
          formSpace(r, k).map((form) => differential(form, k))));
      const dims = [0, 1, 2, 3].map((k) => dimension(r, k));
      expect(dims[0] - rankOfD[0]).to.equal(1);
      expect(dims[1] - rankOfD[1]).to.equal(rankOfD[0]);
      expect(dims[2] - rankOfD[2]).to.equal(rankOfD[1]);
      expect(dims[3]).to.equal(rankOfD[2]);
    });
  }
});
