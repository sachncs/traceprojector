# Performance

How long the operators take, what the time is spent on, and what to do when
it is too long. All numbers were measured on one Apple-silicon laptop with Node
26, on unit-cube meshes of the stated size, one thread; run the scripts named
below to get your own.

## The two families

The canonical operators (`Projector`, `CanonicalProjector`) read a few numbers
of the input at each entity and cost almost nothing: building a projector grows
linearly with the mesh and a projection at a point takes microseconds.

The bounded operators (`ZeroTraceProjector`, `BoundedCommutingProjector`,
`StableProjector`, `TracePreservingProjector`, `HigherOrderProjector`) solve
a local problem on the neighbourhood of every entity they need. Their cost is
set by the **size of those neighbourhoods**, not by the size of the mesh: the
work for one entity is the same on a mesh of a thousand cells and a million.
The total grows linearly with the number of entities, with a much larger
constant than the canonical operators.

## Canonical operators

| Cells | Build (ms) | Boundary weights (ms) | Locator build (ms) | One located projection (ms) | Heap (MB) |
|---:|---:|---:|---:|---:|---:|
| 48 | 4 | 20 | 1 | 0.002 | 2.5 |
| 1,296 | 19 | 95 | 3 | 0.005 | 13 |
| 10,368 | 69 | 405 | 29 | 0.003 | 48 |
| 48,000 | 453 | 1,757 | 182 | 0.008 | 235 |

Memory is about 5 KB per cell. Reproduce with
`node --expose-gc validation/limits.mjs`.

## How we measure

A number without a method cannot be compared, so the measurements here come
from the benchmark harness, not from one-off timings:

- `npm run bench` times the solver and the weight pipeline in *units of a
  calibration loop* (a dense matrix product run on the same machine just before), so
  a result means the same on a faster or slower machine; it also records the
  stored factor entries (space), the iteration counts and the solver
  certificates. `npm run bench:check` compares with the committed baseline
  and fails on a scenario that is slower, or whose space or iteration count changed.
- Every local solve returns a **certificate**: the constraint residual, the
  stationarity of the minimizer, the duality gap and the factor size. The
  limits are fixed in `validation/tolerances.json` before running (10⁻¹⁰ each;
  observed at most 3·10⁻¹¹, 2·10⁻¹⁴ and 3·10⁻¹⁵), so a fast solve that is wrong
  fails a test instead of passing a benchmark. `crossCheck` mode compares a
  solve with the dense reference.
- `stats` on the higher-order weights holds one record per solve: the form
  degree, the method, unknowns, constraints, milliseconds, iterations, stored
  entries and the certificate.

## Bounded operators at the lowest order

Computing *every* coefficient of all four form degrees on a unit cube, one
thread:

| Cells | `BoundedCommutingProjector` | `ZeroTraceProjector` (interior entities only) |
|---:|---:|---:|
| 162 (3 per side) | 4.6 s | |
| 384 (4) | 13 s | 92 s |
| 750 (5) | 28 s | 158 s |
| 1,296 (6) | 51 s | |

The time grows about linearly with the number of cells. Compared with the
previous solver, the operator with no boundary condition is about 14% slower on
small meshes: the certified solver factors two matrices and orders them with a
minimum-degree ordering whose cost shows on small problems (9% and 11% of the
time at 162 cells) and pays back on large ones. A size-based choice of
factorization was considered and not made; the saving is at most that 14%.

**You rarely need every coefficient.** Coefficients are computed the first time
they are used and cached, so projecting a field at a handful of points solves
only the local problems around those points.

## Higher-order operators

One weight of `HigherOrderProjector` at `p = 1` for an entity in the interior of
a 6 × 6 × 6 cube (a few thousand unknowns per local problem), cold:

| Form degree of the entity | First version | Banded solver | Now |
|---|---:|---:|---:|
| edge (`l = 1`) | 3.0 s | 0.45 s | 0.15 s |
| face (`l = 2`) | 14.2 s | 2.0 s | 0.32 s |
| cell (`l = 3`) | 42.8 s | 5.7 s | 0.78 s |

Weights of cells that are translates of each other share one solve.

**Scaling of one solve.** Measured over the sizes of real local problems, the
time grew as n^2.5 and the space as n^1.9 with the skyline factorization; with
the minimum-degree sparse Cholesky they grow as n^1.86 and n^1.76. On a real
`l = 2` problem the factor has 35.9 thousand entries, against 245 thousand for
the skyline.

### The boundary operator above the lowest order

`TracePreservingProjector({degree: p})` evaluates the projection at a point:
the boundary part `Π_∂ u` and the zero-trace part of `u − Π_∂ u`. A point near
the boundary at `p = 1`, `l = 2` took 116 s at first and takes about 17 s now;
the cost is dominated by the boundary weights and the zero-trace weights of
the cells in range of the point, and every later point near the same faces is
cheaper because the weights are cached. These are minutes for a handful of
points, not an operator to evaluate everywhere.

## What was done, and what each step bought

Profiling showed that the time was in linear algebra and in polynomial
arithmetic, so:

1. **A solver that returns a proof.** The weight is the field of least norm with
   a prescribed derivative. It is now found by preconditioned conjugate
   gradients on the dual problem, with an accurate factor of the mass matrix and
   the certificate above. The earlier multiplier iteration stopped with a
   stationarity error up to 6·10⁻⁵.
2. **Sparse Cholesky with a minimum-degree ordering on a compressed graph.**
   35.9 thousand against 245 thousand stored entries on the same problem.
3. **Dense typed-array polynomials** and a cached reference rule, so a
   polynomial is a flat array and a product is a loop.
4. **Tabulation of the bubble basis at quadrature points** instead of
   evaluating polynomials point by point, and a cache of the forms of each
   simplex.
5. **Caches keyed by geometry:** element matrices, form banks and the
   derivatives of the canonical basis, so repeated shapes cost one solve.
6. **A sparse evaluator for the extensions** of the boundary weights, which
   touch only their nonzero degrees of freedom.

A bug was found along the way: the dense reference minimum-norm solver used the
normal equations on the wrong side when the matrix had a null space, and
returned a solution with up to 80% more energy than the minimum (the identities
it was checked against did not detect it). It always solves the dual system
now, with a regression test.

## Concurrency

The weights of a mesh depend only on the mesh, so the coefficients of a bounded
operator can be computed on any number of solvers at once.
`CoefficientPool` (`traceprojector/parallel`) gives each worker thread its own
operator, so there is **no shared mutable state**: the only module-level
state, scratch buffers, is per-isolate. The coefficients come back in a fixed
order and are **bitwise identical to the serial result for any number of
workers**, which a test checks. The pool takes `resourceLimits` to bound each
worker's memory.

Strong scaling on a 4 × 4 × 4 cube, every face coefficient, against one worker:

| Workers | Speedup |
|---:|---:|
| 2 | 1.69 |
| 4 | 2.75 |
| 8 | 3.4 |

This is one machine with 12 heterogeneous cores (performance and efficiency
cores), and a one-worker pool was about 33% slower than computing in-process,
probably from the cores the workers landed on; expect different efficiency on
yours, and measure with the harness. Each worker builds its own weights, so the
cache is not shared between workers: the speedup is smaller than the count
because stars are solved more than once.

## Known costs

- Stability constants of the operator above the lowest order are not measured.
- The cost per near-boundary point at `p = 1` is 17 to 30 s.
- The parallel efficiency is modest and machine dependent.

## Making it faster for your problem

- **Use the canonical operators when your data is smooth.** They are orders of
  magnitude cheaper (microseconds per point, against milliseconds per entity
  for the bounded ones) and, for smooth input, as accurate.
- **Project at the points you need.** Coefficients are lazy; do not ask for the
  whole mesh.
- **Reuse one projector for many fields.** The weights depend only on the mesh;
  a second field costs only its own quadrature. `Projector.sampler(points, l)`
  does this for fixed evaluation points (time-dependent data).
- **Use structured regions where you can.** For the higher-order operator,
  cells that are translates of each other share weights.
- **Split large problems.** The canonical projector uses about 5 KB per cell and
  has been run to 48,000 cells; there is no guard on the heap, so for larger
  meshes raise `--max-old-space-size` or split the domain.
- **Use worker threads for many evaluation points.** `projectInParallel`
  (`traceprojector/parallel`) spreads the evaluation of the canonical operator
  across threads.

## What would help further

The remaining costs are the per-entity solves of the bounded operators and the
allocation of small arrays in the geometry code. A native or WebAssembly
solver was not pursued: profiling a canonical projection on a 3,072-cell mesh
put the dense solver at 19% of the time, so even an infinitely fast one would
have sped the whole up by at most 1.24×, and for the bounded operators the
linear algebra is now a small part of a flat profile. Sharing weights between congruent stars on
unstructured meshes (not only translates) and computing the weights of
different entities on worker threads are the next steps, and are not done.
