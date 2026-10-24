/**
 * Verifies that the ESM and UMD bundles expose the same set of exported
 * names. Run after `npm run build`.
 */
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const esmNames = Object.keys(
    await import('../dist/traceprojector.esm.js'),
).sort();

const sandbox = {};
vm.runInNewContext(readFileSync('dist/traceprojector.umd.js', 'utf8'), sandbox);
const umdNames = Object.keys(sandbox.TraceProjector ?? {}).sort();

const expected = JSON.stringify(esmNames);
let failed = false;
for (const [label, names] of [['UMD', umdNames]]) {
  if (JSON.stringify(names) !== expected) {
    console.error(`${label} exports differ from ESM:`, {
      missing: esmNames.filter((n) => !names.includes(n)),
      extra: names.filter((n) => !esmNames.includes(n)),
    });
    failed = true;
  }
}
if (esmNames.length === 0) {
  console.error('ESM bundle exports nothing');
  failed = true;
}
if (failed) process.exit(1);
console.log(
    `Bundles agree: ${esmNames.length} exports (${esmNames.join(', ')})`,
);
