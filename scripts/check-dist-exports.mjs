/**
 * Verifies that the ESM, CommonJS and UMD bundles expose the same set of
 * exported names. Run after `npm run build`.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const esmNames = Object.keys(await import('../dist/traceprojector.esm.js')).sort()
const cjsNames = Object.keys(require('../dist/traceprojector.cjs')).sort()

const sandbox = {}
vm.runInNewContext(readFileSync('dist/traceprojector.umd.js', 'utf8'), sandbox)
const umdNames = Object.keys(sandbox.TraceProjector ?? {}).sort()

const expected = JSON.stringify(esmNames)
let failed = false
for (const [label, names] of [['CJS', cjsNames], ['UMD', umdNames]]) {
  if (JSON.stringify(names) !== expected) {
    console.error(`${label} exports differ from ESM:`,
      { missing: esmNames.filter((n) => !names.includes(n)), extra: names.filter((n) => !esmNames.includes(n)) })
    failed = true
  }
}
if (esmNames.length === 0) {
  console.error('ESM bundle exports nothing')
  failed = true
}
if (failed) process.exit(1)
console.log(`Bundles agree: ${esmNames.length} exports (${esmNames.join(', ')})`)
