/**
 * The programs in examples/ run, and print what is recorded next to them.
 * They are what the Recipes pages of the website show, so a recipe cannot say
 * something the library no longer does.
 */
import {expect} from 'chai';
import {
  exampleNames, recordedOutput, runExample,
} from '../scripts/run-examples.mjs';

describe('the examples', function() {
  this.timeout(900000);
  for (const name of exampleNames()) {
    it(`${name} prints what is recorded`, () => {
      const recorded = recordedOutput(name);
      expect(recorded, `examples/${name}.out.txt is missing: ` +
        'run node scripts/run-examples.mjs --update').to.not.equal(null);
      expect(runExample(name)).to.equal(recorded);
    });
  }
});
