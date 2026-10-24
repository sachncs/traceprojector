# Architecture

The library has one job, projecting a field onto finite element forms, done in
two different ways. Understanding which way a class uses explains what it
guarantees and what it costs.

```
                    the input field u(x)
                           |
          +----------------+----------------+
          |                                 |
   canonical path                      bounded path
   (point values, edge                 (a weight function per mesh entity,
   integrals, face fluxes)              found by a local solve on its star)
          |                                 |
   Projector                          ZeroTraceProjector
   CanonicalProjector                 BoundedCommutingProjector
                                      StableProjector
                                      TracePreservingProjector
                                      HigherOrderProjector
```

## The canonical path

A coefficient of the projection is a functional of the input at one entity: the
value at a vertex, the integral along an edge, the flux through a face, the
integral over a cell. This is cheap and exact for smooth input, but a
functional like a point value is not bounded in `L²`, so the operator is not
stable.

| Module | Role |
|---|---|
| `traceprojector.js` | the `Projector` facade (`project`, `projectAtPoint`, `sampler`, `refine`) and all public exports |
| `mesh.js` | topology and geometry of the tetrahedral mesh, with validation |
| `whitney.js` | barycentric coordinates and the lowest-order Whitney basis |
| `projectors/` | `h1.js`, `hcurl.js`, `hdiv.js`, `l2.js`: the projection for each form degree |
| `weight.js`, `bweight.js`, `solver.js`, `surface.js`, `refinement.js` | the paper's boundary weights on Alfeld and Worsey–Farin splits, used to cross-check the degrees of freedom |
| `boundaryVerify.js` | the cross-check itself |
| `bubble.js` | scalar higher-order enrichment |
| `canonical-projector.js` | canonical interpolation of any degree, built on `reference-element.js`, `polynomial-forms.js` and `simplicial-complex.js` |
| `locator.js` | point location by a bounding-box tree |
| `bisection.js` | longest-edge refinement that keeps the mesh conforming |
| `parallel.js`, `parallel-worker.js` | projection of one field at many points on worker threads |

## The bounded path

A coefficient is an integral of the input against a *weight function* that is
supported on the star of mesh entities around the entity. The weight is found
by solving a small local problem: the minimum-norm field whose exterior
derivative equals the weights of the entities on the boundary of the entity,
plus a local potential problem. Integrals against such weights are bounded in
`L²`, which is where the stability comes from; the weights are built so that
the commuting property holds by construction.

| Module | Role |
|---|---|
| `local-weights.js` | the weights of Ern, Guzmán, Potu and Vohralík at the lowest order, on Alfeld splits |
| `zero-trace-projector.js`, `bounded-commuting-projector.js` | the zero-trace operator and the one with no boundary condition |
| `stable-projector.js` | canonical boundary part plus the zero-trace interior part |
| `worsey-farin.js`, `boundary-surface.js`, `surface-complex.js` | the surface splits and the surface complex of the boundary |
| `boundary-weights.js`, `boundary-projector.js` | the paper's boundary weights and the boundary operator `Π_∂` (lowest order) |
| `trace-preserving-projector.js` | `Π = mΠ(I − Π_∂) + Π_∂` |
| `bubble-forms.js`, `ag-element.js`, `ag-space.js` | the Arnold–Guzmán finite element spaces of any degree |
| `physical-forms.js`, `polynomial-forms.js` | exact polynomial differential forms on physical cells |
| `high-order-weights.js`, `higher-order-projector.js` | the Arnold–Guzmán weights and projection for any degree, with optional zero-trace condition |
| `boundary-traces.js`, `high-order-boundary.js`, `high-order-trace-preserving.js` | traces of the finite element spaces on the boundary faces; the boundary weights, extensions and operator for `p ≥ 1`; and the whole trace-preserving projection above the lowest order |
| `parallel-pool.js`, `parallel-pool-worker.js` | the worker pool for the coefficients of the bounded operators |

## Shared numerical code

| Module | Role |
|---|---|
| `quadrature.js` | Gauss quadrature on intervals, triangles and tetrahedra, with exactness tests |
| `utils.js`, `small-linear-algebra.js` | `3×3` solves, vector operations, small symmetric eigenvalues |
| `dense-linear-algebra.js` | Cholesky, semidefinite and minimum-norm solves (dense) |
| `sparse-linear-algebra.js` | compressed sparse rows and conjugate gradients |
| `banded-linear-algebra.js` | the minimum-norm solver the weights use (conjugate gradients on the dual, with a certificate of optimality), sparse Cholesky with a minimum-degree ordering on a compressed graph, and the older skyline Cholesky with reverse Cuthill–McKee |
| `errors.js` | `ValidateError`, `ProjectError`, `SingularError` |

## Design decisions

1. **Pure ES modules, no runtime dependencies.** All the linear algebra is in
   the repository; bundlers produce the ESM, CJS and UMD files in `dist/`.
2. **Typed errors for bad input.** Anything a caller can get wrong (a flipped
   tetrahedron, a `NaN` coordinate, a point outside the mesh, a field that
   returns `Infinity`) raises one of three error classes. The fuzz tests assert
   that no malformed mesh produces a wrong answer, a hang or a crash.
3. **Lazy, cached weights.** The bounded operators compute the weight of an
   entity the first time a coefficient needs it and cache it. Projecting at a
   few points therefore solves only the problems near them. The higher-order
   weights are also cached by a signature of the star's geometry, so stars that
   are translates of each other share one solve.
4. **Local solves are minimum-norm.** The weight of an entity is the field of
   least `L²` norm with the required exterior derivative. Minimality makes it
   unique, which is what lets cached weights be reused.
5. **Warnings for local failures, errors for global ones.** The canonical
   boundary weights warn (and can be made strict) so that one bad element does
   not hide the rest.
6. **Determinism.** The same input gives the same bits, which the determinism
   test checks.

## Encoding limits

Edge and face lookups use integer keys computed in `Number` arithmetic, so
they are exact up to `2^53 − 1`:

| Key | Limit on the vertex count of the input mesh |
|---|---|
| edge key | `vertexCount < 2^26` (about 67 million) |
| face key | `originalVertexCount < 2^17` (about 131 thousand) |

The face key is reached first; meshes beyond about 131,000 vertices are
outside what the canonical path has been run on.
