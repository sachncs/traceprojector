# Developer guide

This page takes you from a fresh clone to a merged change. It also explains how
the repository is organised and why its checks are the way they are, because
most of them exist to stop one specific kind of mistake.

## Set up

You need Node.js 24 or newer (the repository pins 26 in `.nvmrc`) and git.

```bash
git clone https://github.com/sachncs/traceprojector.git
cd traceprojector
npm install        # installs the library and the demo site (npm workspaces)
npm test           # the fast suite: about 500 tests, 15 seconds
```

If `npm test` passes you have a working checkout.

## What is where

```
traceprojector/   the library: pure ES modules, no runtime dependencies,
                  with a hand-written .d.ts next to each public module
tests/            fast unit tests (Mocha + Chai), one file per module
tests-d/          type tests (tsd) that check the .d.ts files against the JS
validation/       the numerical validation of the papers' claims
  slow/           the same for the expensive higher-order operator
site/             the website and demo (Next.js), also renders docs/
docs/             the documentation; the site builds its pages from these files
scripts/          release and consistency checks (package, types, site)
.github/          CI, CodeQL, Pages deployment, weekly slow validation, publish
```

The library has two groups of modules. They share the mesh and quadrature
code, and nothing else:

- **The canonical path** (`traceprojector.js`, `mesh.js`, `whitney.js`,
  `projectors/`, `weight.js`, `bweight.js`, `surface.js`, `bubble.js`,
  `canonical-projector.js`): point values, edge integrals and face fluxes of
  the input, plus the paper's boundary weights used as a cross-check.
- **The bounded path** (`local-weights.js`, `zero-trace-projector.js`,
  `bounded-commuting-projector.js`, `stable-projector.js`,
  `boundary-*.js`, `trace-preserving-projector.js` and, for any degree,
  `high-order-weights.js`, `higher-order-projector.js`, `ag-*.js`):
  weight functions found by solving a small local problem on the star around
  each entity. [Architecture](architecture.md) describes how the pieces fit.

## The scripts

| Command | What it does |
|---|---|
| `npm test` | the fast suite (`tests/`) |
| `npm run test:coverage` | the fast suite under c8, with a text, HTML and lcov report |
| `npm run lint` / `lint:fix` | ESLint with the Google JavaScript style, 80 columns |
| `npm run validate` | the numerical validation, about ten minutes |
| `npm run validate:slow` | the expensive higher-order validation, tens of minutes |
| `npm run bench` | benchmarks of the solver and the weight pipeline, written to `reports/bench.json` |
| `npm run bench:check` | the same, failing on a regression against `validation/benchmarks/baseline.json` |
| `npm run bench:update` | rewrites the baseline (run it on a quiet machine, and say why in the commit) |
| `npm run build` | the ESM, CJS and UMD bundles in `dist/` |
| `npm run docs` | regenerates `docs/api.md` from the JSDoc comments |
| `npm run test:types` | `tsd`: the `.d.ts` files must match the JavaScript |
| `npm run verify:types` | every export of the JavaScript is declared, and conversely |
| `npm run lint:package` | `publint` and `@arethetypeswrong/cli` on the packed tarball |
| `npm run verify:package` | installs the packed tarball in a clean directory and imports every subpath |
| `npm run verify:site` | builds the site against the packed tarball |
| `npm run verify` | everything the `test` jobs run on every pull request (the `validate` and `web` jobs run separately) |
| `npm run site:dev` | the website and demo at http://localhost:3000 |

Run a single test file with `npx mocha tests/mesh.test.js`. For a file under
`validation/slow/`, use `npx mocha --no-config --timeout 7200000 <file>`: with
the repository's config, Mocha adds the config's own file list and runs the
whole suite.

## Measure before you optimize

Every change that is meant to make something faster or smaller starts from
`npm run bench` and a profile (`node --cpu-prof`), and ends with the same
benchmark. The benchmark reports time in units of a calibration loop (so that
numbers from two machines compare), the size of the factors, iteration counts
and the certificates of the solves. Three things have gone wrong before, and
the measurements are there to catch them: a "faster" solver that agreed with a
reference that was itself wrong (see the solver section of
[Validation](VALIDATION.md)); a fast path whose accuracy had silently dropped
(the benchmark fails on any certificate above 1e-9); and an optimization of a
part that took 6% of the time. Profile first.

## The three kinds of test

Each exists because the other two cannot catch what it catches.

1. **Unit tests (`tests/`)** check that code does what it was written to do:
   small inputs, exact expectations, error paths. They run on every change.
2. **Validation (`validation/`)** checks that the *mathematics* is right, one
   test per claim of the papers (commuting, trace preservation, boundedness,
   convergence orders). Its tolerances are written down in
   `validation/tolerances.json` before the first run and may not be loosened to
   make a test pass; if one has to change, the reason is recorded in
   [Validation](VALIDATION.md). A failing validation test means the
   implementation or the paper's claim is wrong, not that the test is flaky.
3. **Property and fuzz tests** (`validation/metamorphic.test.js`,
   `validation/fuzz.test.js`) check invariances (renumbering, rigid motion,
   scaling, linearity) and that every malformed mesh produces a typed error and
   never a silent wrong answer, a hang or a crash.

Coverage and mutation testing measure the suite rather than the code:
`npm run test:coverage` for branches, and Stryker (`stryker.config.json`) for
whether the tests notice a deliberately introduced bug. The mutation score and
its surviving mutants are listed in [Validation](VALIDATION.md).

## Continuous integration

Every pull request runs:

| Job | What it checks |
|---|---|
| `test (24)`, `test (26)` | `npm run verify` on the oldest and newest supported Node, plus `npm audit` |
| `validate` | the numerical validation against the pre-registered tolerances |
| `web` | the site builds against the packed tarball, as a consumer would get it |
| CodeQL | static analysis |

`master` is protected: linear history, and the four checks above must pass
before a merge. The weekly `validate-slow` workflow runs the expensive
higher-order validation and can be started by hand. Merging to `master`
deploys the site to GitHub Pages.

## Making a change

1. Branch from `master`.
2. Write the failing test first when you are fixing a bug, and name it after
   the bug.
3. `npm run lint:fix`, `npm test`, and the validation file that covers what you
   touched.
4. `npm run verify` before you push.
5. Commit with a [Conventional Commit](https://www.conventionalcommits.org/)
   message (`feat(scope): ...`, `fix(scope): ...`, `docs: ...`). Scopes are the
   module names.
6. Open a pull request. Say what changed and what evidence shows it is right.

### Style

Google JavaScript style, enforced by ESLint (`eslint-config-google`): two-space
indentation, 80 columns, semicolons, single quotes, trailing commas in
multi-line literals, `{a, b}` without inner spaces. Comments explain why, not
what, and numerical code says which equation of which paper it implements.

### Adding an operator or a public function

1. Write the module in `traceprojector/` with JSDoc.
2. Write its `.d.ts` beside it and export it from `traceprojector.js` and
   `traceprojector.d.ts`. `npm run verify:types` fails if they disagree.
3. Add a unit test in `tests/` and a `tsd` test in `tests-d/`.
4. If it implements a claim of a paper, add the claim to
   [Validation](VALIDATION.md) with its assumptions, pre-register the
   tolerance in `validation/tolerances.json`, and add the validation test.
5. Run `npm run docs` and commit the regenerated `docs/api.md`.
6. If users will choose between it and another operator, add it to
   [Choosing an operator](operators.md).

### Documentation

The site renders the Markdown files in `docs/` (and `CHANGELOG.md`) directly:
what you write there is what visitors read, at
https://sachncs.github.io/traceprojector/docs/. Link between pages with
relative `.md` links (`[Limits](limits.md)`); the site rewrites them. The page
list and order are in `site/lib/docs.ts`. `docs/api.md` is generated: change
the JSDoc, not the file. The JavaScript examples in the getting-started guide and the README are
run by `validation/docs-examples.test.js` (mark a block `// continued` to build
on the one before it, or `// not run` to skip it), so an example that stops
working fails the build.

## Releasing

Releases are cut from `master` by a maintainer.

1. Update `CHANGELOG.md` and bump the version with `npm version <patch|minor|major>`.
2. Push the commit and the tag, and create a GitHub release for the tag.
3. The `Publish` workflow runs `npm run verify`, regenerates the docs and
   publishes to npm with a provenance attestation, so each published version
   links to the commit and workflow that built it. It needs the `NPM_TOKEN`
   repository secret.

Versions follow [semantic versioning](https://semver.org/): a change to the
public API or to what an operator guarantees is a minor or major version, and a
fix that makes an operator meet its documented guarantee is a patch.

## Where to ask

Questions about the mathematics or the papers belong in
[Discussions](https://github.com/sachncs/traceprojector/discussions); bugs in
[Issues](https://github.com/sachncs/traceprojector/issues); security problems
as described in `SECURITY.md`, not in a public issue.
