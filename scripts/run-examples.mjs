#!/usr/bin/env node
/**
 * Runs the programs in examples/ and compares what each prints with the
 * recorded output next to it (examples/NAME.out.txt). Lines that start with
 * "~" report time and are ignored. `--update` rewrites the recorded outputs.
 * The test validation/examples.test.js uses runExample directly.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'examples');

/** The example programs: examples/NAME.js, not the helpers (_NAME.js). */
export function exampleNames() {
  return readdirSync(dir)
      .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
      .map((f) => f.slice(0, -3))
      .sort();
}

/** The lines an example prints, without the timing lines. */
export function runExample(name) {
  const run = spawnSync(process.execPath, [resolve(dir, `${name}.js`)], {
    cwd: root, encoding: 'utf8', timeout: 600000,
  });
  if (run.status !== 0) {
    throw new Error(`examples/${name}.js exited with ${run.status}:\n` +
      `${run.stderr}`);
  }
  return run.stdout.split('\n').filter((line) => !line.startsWith('~'))
      .join('\n').trimEnd() + '\n';
}

export const recordedOutput = (name) => {
  const file = resolve(dir, `${name}.out.txt`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const update = process.argv.includes('--update');
  let failed = 0;
  for (const name of exampleNames()) {
    const out = runExample(name);
    if (update) {
      writeFileSync(resolve(dir, `${name}.out.txt`), out);
      console.log(`recorded ${name}`);
    } else if (out !== recordedOutput(name)) {
      console.error(`examples/${name}.js prints something else than ` +
        `${name}.out.txt`);
      failed++;
    } else {
      console.log(`ok ${name}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
