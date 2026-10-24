<h1 align="center">traceprojector</h1>

<p align="center">
  Commuting, discrete-trace preserving projections for the 3D de Rham complex
  on tetrahedral meshes. Pure JavaScript, no runtime dependencies.
</p>

<p align="center">
  <a href="https://sachncs.github.io/traceprojector/">Website</a> ·
  <a href="https://sachncs.github.io/traceprojector/docs/getting-started/">Getting started</a> ·
  <a href="https://sachncs.github.io/traceprojector/docs/api/">API</a> ·
  <a href="https://sachncs.github.io/traceprojector/docs/validation/">Validation</a> ·
  <a href="https://sachncs.github.io/traceprojector/playground/">Playground</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/traceprojector"><img src="https://img.shields.io/npm/v/traceprojector" alt="npm"></a>
  <a href="https://github.com/sachncs/traceprojector/actions"><img src="https://img.shields.io/github/actions/workflow/status/sachncs/traceprojector/ci.yml?branch=master" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A524-43853d" alt="Node 24+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <a href="https://google.github.io/styleguide/jsguide.html"><img src="https://img.shields.io/badge/code%20style-google-blue.svg" alt="Google JavaScript Style"></a>
</p>

## What it does

Given a function on a tetrahedral mesh, `traceprojector` computes its
projection onto the finite element spaces of the 3D de Rham complex: continuous
piecewise polynomials (`l = 0`), Nédélec edge elements (`l = 1`),
Raviart–Thomas face elements (`l = 2`) and discontinuous polynomials
(`l = 3`). The projections

1. **commute** with the exterior derivative: `grad Π⁰ = Π¹ grad`,
   `curl Π¹ = Π² curl`, `div Π² = Π³ div`, so discrete conservation laws and
   constraints are preserved;
2. **preserve discrete traces** on the boundary (for the operators that say
   so): vertex values, edge circulations and face fluxes are reproduced
   exactly;
3. for the bounded operators, are **locally `L²`-stable**, so rough data, such
   as a field unbounded at an interior point, is projected without blowing up.

It implements Ern, Guzmán and Potu,
[*Bounded, commuting, discrete-trace preserving projections*](https://arxiv.org/abs/2604.28103),
Ern, Guzmán, Potu and Vohralík,
[*Local L²-bounded commuting projections using discrete local problems on Alfeld splits*](https://arxiv.org/abs/2502.03601),
and Arnold and Guzmán, *Local L²-bounded commuting projections in FEEC*
(ESAIM: M2AN 55, 2021). I am not an author of any of them; this is an
independent implementation, and
[Validation](https://sachncs.github.io/traceprojector/docs/validation/) states
which of their claims are tested here, under which assumptions, and which are
not.

## Quick start

```bash
npm install traceprojector
```

```javascript
import { Locator, StableProjector } from 'traceprojector';
import { generateUnitCubeMesh } from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(3); // or your own vertices and tetrahedra
const projector = new StableProjector(mesh.getVertices(), mesh.getTetrahedra());

const u = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]);
const point = [0.3, 0.3, 0.3];
const { tIdx } = new Locator(mesh).findTetrahedron(point);

console.log(projector.project(u, point, tIdx, 0)); // 0.3875...  (u(point) = 0.3811...)
```

The [getting started guide](https://sachncs.github.io/traceprojector/docs/getting-started/)
covers meshes of your own, the four form degrees, checking a result and what to
do when something fails.

## Which operator?

| You have | Use |
|---|---|
| a smooth field, and speed matters | `Projector`, or `CanonicalProjector` for any degree |
| a rough field; commuting for every input | `BoundedCommutingProjector` (no boundary values kept) |
| a rough interior and exact boundary values | `StableProjector`, `TracePreservingProjector` |
| a degree above the lowest, bounded and commuting | `HigherOrderProjector` |

[Choosing an operator](https://sachncs.github.io/traceprojector/docs/operators/)
has the full table of what each class guarantees and what it needs.

## What to expect

- **Correctness is checked, not assumed.** `npm run validate` runs one
  numerical test per claim of the papers against tolerances fixed before the
  first run. Commuting holds to roundoff on the class of fields the papers
  prove it for (about 10⁻¹³), the stability constants did not grow under
  refinement, and Assumption 2.4 of Arnold and Guzmán, which the paper
  assumes, was measured on jittered and 100:1 stretched meshes.
- **Known limits are documented with their evidence**: commuting for the
  trace-preserving operators is proved only for fields whose boundary trace is
  a lowest-order trace (the papers' wider statement does not follow from their
  proof, and it fails by about 5·10⁻³ otherwise); there is no
  trace-preserving operator above the lowest order yet; and the bounded
  operators cost a local solve per mesh entity. See
  [Limits](https://sachncs.github.io/traceprojector/docs/limits/) and
  [Performance](https://sachncs.github.io/traceprojector/docs/performance/).
- **Bad input is an error, not a wrong answer.** Malformed meshes and
  non-finite values raise `ValidateError`, `ProjectError` or `SingularError`
  ([Errors](https://sachncs.github.io/traceprojector/docs/errors/)).

## Also included

- `projector.sampler(points, l, p)` locates points once and projects each new
  field cheaply (time-dependent data).
- `refineTetrahedra` and `projector.refine(marked)` for adaptive refinement by
  longest-edge bisection.
- `projectInParallel` from `traceprojector/parallel` projects one field at many
  points on worker threads (Node.js).
- A [web playground](https://sachncs.github.io/traceprojector/playground/)
  with a 3D mesh viewer, code export and a convergence plot.

## Documentation

Everything is on the [website](https://sachncs.github.io/traceprojector/docs/),
rendered from [`docs/`](docs/):
[getting started](docs/getting-started.md),
[choosing an operator](docs/operators.md), [API reference](docs/api.md),
[errors](docs/exceptions.md), [performance](docs/performance.md),
[limits](docs/limits.md), [mathematical background](docs/math.md),
[architecture](docs/architecture.md), [validation](docs/VALIDATION.md),
[developer guide](docs/developer-guide.md), [changelog](CHANGELOG.md).

## Contributing

Start with the [developer guide](docs/developer-guide.md); the short version
is `npm install`, `npm test`, make the change with a test, `npm run verify`.
See also [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md) (please do
not report security problems in a public issue).

## License

[MIT](LICENSE) © 2026 Sachin
