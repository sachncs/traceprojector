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

## Bounded operators at the lowest order

Computing *every* coefficient of all four form degrees, on a unit cube:

| Cells | `BoundedCommutingProjector` | `ZeroTraceProjector` (interior entities only) |
|---:|---:|---:|
| 384 (4 per side) | 12 s | 36 s |
| 750 (5) | 25 s | 89 s |
| 1,296 (6) | 45 s | 159 s |

That is 7 ms per entity for the operator with no boundary condition and 26 ms
per interior entity for the zero-trace operator; the latter is dearer because
near the boundary the neighbourhood is enlarged until it meets the paper's
assumption that it is a ball (see [Validation](VALIDATION.md)). The time grows
about linearly with the number of cells.

**You rarely need every coefficient.** Coefficients are computed the first time
they are used and cached, so projecting a field at a handful of points solves
only the local problems around those points: a few entities, not thousands.
To evaluate the projection of one field everywhere, you do need all of them.

## Higher-order operators

The cost of one weight of `HigherOrderProjector` at `p = 1` for an entity in the
interior of a 6 × 6 × 6 cube (a few thousand unknowns per local problem):

| Form degree of the entity | Before | Now |
|---|---:|---:|
| edge (`l = 1`) | 3.0 s | 0.45 s |
| face (`l = 2`) | 14.2 s | 2.0 s |
| cell (`l = 3`) | 42.8 s | 5.7 s |

Weights of cells that are translates of each other share one solve, so on a
structured mesh the number of distinct solves is small. The numbers grow quickly
with the polynomial degree (more unknowns per cell) and with the size of the
star.

A zero-trace weight of a cell next to the boundary at `p = 1`, which took more
than an hour before, now takes about a minute (four seconds at `p = 0`).

## Where the time went, and what was done

Profiling the higher-order weights showed that the time was in the dense
linear algebra: a minimum-norm solve of about 1,500 unknowns by dense Cholesky
took 1.9 s and nearly all of the weight's time. The local systems are sparse,
because each unknown is coupled only to the unknowns on neighbouring cells, so:

1. **Banded Cholesky.** After a reverse Cuthill–McKee reordering the matrix has
   a small profile, and a skyline factorization costs a small fraction of the
   dense `n³/3`. The solve above takes 0.02 s.
2. **A multiplier iteration for the constraint.** The weight is the field of
   least norm with a prescribed derivative, a constrained problem. It is solved
   by factoring `M + γ CᵀC` once and updating the multipliers with the true
   constraint residual; the answer is the exact minimizer (checked against the
   dense solver to 10⁻⁹) and the penalty `γ` is increased automatically if the
   iteration is slow. A dense solve remains as the fallback if the banded one
   cannot converge.
3. **Cheaper quadrature.** Exact quadrature orders instead of a fixed high
   order, flat arrays for the inner products, and powers of the coordinates
   computed once per polynomial evaluation.
4. **Caching by geometry.** Weights are cached by a signature of the star
   (cell shapes up to translation), so repeated shapes are solved once.

With these, the lowest-order bounded operators dropped from several minutes to
tens of seconds for a mesh of a few hundred cells, and the whole validation
suite runs in about ten minutes. What is left in a profile is a flat spread
over quadrature points and small-array arithmetic, not a single hot spot.

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
