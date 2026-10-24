/**
 * Every JavaScript example in the user-facing documentation must run. A
 * documented example that throws is a documentation bug that the reader meets
 * first, so the build fails on it.
 *
 * A block starting with the comment `// continued` builds on the nearest
 * earlier block that does not (the two are run as one module). Blocks that
 * only illustrate syntax can be marked `// not run` on their first line.
 */
import {expect} from 'chai';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const FILES = ['docs/getting-started.md', 'README.md'];

/** The runnable programs in a Markdown file. */
function programs(markdown) {
  const blocks = [...markdown.matchAll(/```(?:javascript|js)\n([\s\S]*?)```/g)]
      .map((m) => m[1]);
  const out = [];
  let base = null;
  for (const block of blocks) {
    if (block.startsWith('// not run')) continue;
    if (block.startsWith('// continued')) {
      expect(base, 'a continued block needs an earlier block').to.not.equal(
          null);
      out.push(`${base}\n${block}`);
    } else {
      base = block;
      out.push(block);
    }
  }
  return out;
}

describe('documentation examples', function() {
  this.timeout(600000);

  for (const file of FILES) {
    const found = programs(readFileSync(join(root, file), 'utf8'));
    it(`${file} has examples to run`, () => {
      expect(found.length).to.be.above(0);
    });
    found.forEach((code, i) => {
      it(`${file}: example ${i + 1} runs`, () => {
        // Inside the package, so that `traceprojector` resolves to this
        // checkout through its own `exports`.
        const directory = mkdtempSync(join(root, '.docs-example-'));
        try {
          const path = join(directory, 'example.mjs');
          writeFileSync(path, code);
          execFileSync(process.execPath, [path], {
            cwd: root,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } finally {
          rmSync(directory, {recursive: true, force: true});
        }
      });
    });
  }
});
