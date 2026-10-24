import {expect} from 'chai';
import {
  SimplexForms,
  bubbleDimensionOf,
  dimensionOf,
} from '../traceprojector/bubble-forms.js';

describe('bubble spaces of Arnold and Guzman on reference simplices', () => {
  for (const r of [1, 2, 3]) {
    for (let m = 1; m <= 3; m++) {
      for (let k = 0; k <= m; k++) {
        it(`r = ${r}, m = ${m}, k = ${k}: dimensions and splitting`, () => {
          const forms = SimplexForms.of(r, k, m);
          expect(forms.independent.length).to.equal(dimensionOf(r, k, m));
          // The bubbles have the dimension of eq. (5.6).
          const bubbles = bubbleDimensionOf(r, k, m);
          const closed = forms.closedBasis.length;
          const coclosed = forms.coclosedBasis.length;
          expect(closed + coclosed).to.equal(bubbles);
        });
      }
    }
  }
});
