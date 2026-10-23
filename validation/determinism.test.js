/** Criterion A10: the same input gives bit-identical output in separate processes. */
import { execFileSync } from 'node:child_process'
import { expect } from 'chai'

describe('Determinism', function () {
  this.timeout(1800000)
  const run = () => execFileSync(process.execPath, [new URL('./support/determinism-run.mjs', import.meta.url).pathname],
    { encoding: 'utf8', maxBuffer: 1 << 26 }).trim()

  it('two separate processes produce bit-identical projections, including the stable projector', () => {
    const first = run()
    const second = run()
    expect(first.length).to.be.above(1000)
    expect(second).to.equal(first)
  })
})
