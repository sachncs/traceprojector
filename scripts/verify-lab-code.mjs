#!/usr/bin/env node
/**
 * The playground's "same thing as a program" must run as written. This
 * generates the program for every operator and field of the operator lab,
 * runs each with Node against the package, and checks the outcome: every one
 * succeeds, except that the operators that read point values must refuse the
 * singular field with a ProjectError (which is what the lab shows).
 */
import {spawnSync} from 'node:child_process';
import {
  cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'traceprojector-lab-'));

try {
  // Node strips the types itself, but wants the extension in the import.
  for (const file of ['lab-code.ts', 'lab-fields.ts']) {
    cpSync(join(root, 'site/lib', file), join(work, file));
  }
  const code = join(work, 'lab-code.ts');
  writeFileSync(code, readFileSync(code, 'utf8')
      .replace('"./lab-fields"', '"./lab-fields.ts"'));
  const {labCode} = await import(pathToFileURL(code).href);

  const operators = ['projector', 'canonical', 'bounded-commuting', 'stable',
    'trace-preserving'];
  const fields = ['smooth', 'singular', 'bump'];
  const refuses = new Set(['projector', 'canonical']);
  let failures = 0;
  for (const operator of operators) {
    for (const fieldId of fields) {
      // A program imports the package by name, so it runs from inside it.
      const placed = join(root, 'examples',
          `_lab-${operator}-${fieldId}.mjs`);
      writeFileSync(placed, labCode({
        operator, fieldId, centre: [0.5, 0.5, 0.5],
        points: [[0.2, 0.51, 0.5], [0.5, 0.51, 0.5], [0.8, 0.51, 0.5]],
        mesh: {kind: 'cube', n: 4},
      }));
      const run = spawnSync(process.execPath, [placed], {
        cwd: root, encoding: 'utf8', timeout: 300000,
      });
      rmSync(placed);
      const expectRefusal = refuses.has(operator) && fieldId === 'singular';
      const ok = expectRefusal ?
        run.status !== 0 && /ProjectError/.test(run.stderr) :
        run.status === 0;
      if (!ok) {
        failures++;
        console.error(`FAIL ${operator} / ${fieldId}\n${run.stderr}`);
      }
    }
  }
  if (failures) process.exit(1);
  console.log(`lab programs: ${operators.length * fields.length} run as ` +
    'written');
} finally {
  rmSync(work, {recursive: true, force: true});
}
