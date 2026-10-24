/**
 * Every public export is shown to a developer: it has an entry in the API
 * reference, an entry in the capability inventory (examples/capabilities.json)
 * and either a recipe in examples/ or a stated reason why it needs none. A new
 * export that nobody documents fails here, so a capability cannot ship
 * invisible.
 */
import {expect} from 'chai';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exampleNames} from '../scripts/run-examples.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const inventory = JSON.parse(
    readFileSync(resolve(root, 'examples/capabilities.json'), 'utf8'));
const recipes = JSON.parse(
    readFileSync(resolve(root, 'examples/recipes.json'), 'utf8'));
const api = readFileSync(resolve(root, 'docs/api.md'), 'utf8');

/** Every runtime export of every public entry point, with where it is. */
async function publicExports() {
  const found = new Map();
  for (const [sub, def] of Object.entries(pkg.exports)) {
    const mod = await import(resolve(root, def.default));
    for (const name of Object.keys(mod)) {
      if (!found.has(name)) found.set(name, sub);
    }
  }
  return found;
}

describe('the showcase of the public API', () => {
  let exported;
  before(async () => {
    exported = await publicExports();
  });

  it('inventories every public export, and nothing else', () => {
    const missing = [...exported.keys()].filter((n) => !inventory[n]);
    const stale = Object.keys(inventory).filter((n) => !exported.has(n));
    expect(missing, 'exports with no inventory entry').to.deep.equal([]);
    expect(stale, 'inventory entries for exports that do not exist')
        .to.deep.equal([]);
  });

  it('has an API reference entry for every public export', () => {
    const missing = [...exported.keys()]
        .filter((n) => !api.includes(`### \`${n}\``));
    expect(missing, 'exports missing from docs/api.md').to.deep.equal([]);
  });

  it('gives each export a recipe or a reason it needs none', () => {
    for (const [name, entry] of Object.entries(inventory)) {
      const ok = (Array.isArray(entry.recipes) && entry.recipes.length > 0) ||
        (typeof entry.reference === 'string' && entry.reference.length > 0);
      expect(ok, `${name} has neither recipes nor a reference reason`)
          .to.equal(true);
    }
  });

  it('points every recipe at an example that exists, and shows every example', () => {
    const slugs = new Set(Object.values(inventory)
        .flatMap((entry) => entry.recipes ?? []));
    const missing = [...slugs]
        .filter((s) => !existsSync(resolve(root, 'examples', `${s}.js`)));
    expect(missing, 'recipes with no example').to.deep.equal([]);
    const orphans = exampleNames().filter((n) => !slugs.has(n));
    expect(orphans, 'examples no export points to').to.deep.equal([]);
  });

  it('describes every example in recipes.json, in a stated order', () => {
    const described = recipes.map((r) => r.slug);
    expect([...described].sort(), 'recipes.json against examples/')
        .to.deep.equal(exampleNames());
    for (const r of recipes) {
      for (const key of ['title', 'summary', 'assumes', 'cost']) {
        expect(r[key], `${r.slug}.${key}`).to.be.a('string').with.length
            .above(10);
      }
    }
  });
});
