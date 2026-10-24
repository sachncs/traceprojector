/** Criterion A8: the mesh fuzzer. Cases, limits and the verdict rule are
 * pre-registered. */
import {expect} from 'chai';
import {runFuzz, judge} from './fuzz/run.js';
import {tolerances} from './support/tolerances.js';

describe('Mesh input fuzzing', function() {
  this.timeout(3600000);

  it(`${tolerances.fuzz.cases} seeded cases: typed errors or correct answers, no hangs or crashes`, async () => {
    const verdicts = await runFuzz(tolerances.fuzz);
    const failures = verdicts
        .map((v) => ({v, why: judge(v)}))
        .filter((x) => x.why);
    const byGenerator = new Map();
    for (const {v, why} of failures) {
      const key = `${v.generator}: ${why.slice(0, 90)}`;
      byGenerator.set(key, (byGenerator.get(key) ?? 0) + 1);
    }
    const summary = [...byGenerator].map(([k, n]) => `${n} x ${k}`).join('\n');
    expect(failures.length, `\n${summary}`).to.equal(0);
  });
});
