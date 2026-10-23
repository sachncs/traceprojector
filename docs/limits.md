# Size and complexity limits

Measured with `node --expose-gc validation/limits.mjs` on a unit-cube mesh
(Apple silicon, Node 26). Re-run it to get numbers for your machine.

## `Projector` (canonical degrees of freedom)

| Cells | Build (ms) | Boundary weights (ms) | Locator build (ms) | One located projection (ms) | Heap (MB) |
|---:|---:|---:|---:|---:|---:|
| 48 | 4 | 20 | 1 | 0.002 | 2.5 |
| 1,296 | 19 | 95 | 3 | 0.005 | 13 |
| 10,368 | 69 | 405 | 29 | 0.003 | 48 |
| 48,000 | 453 | 1,757 | 182 | 0.008 | ≈ 235 |

- **Time** for building the mesh, the boundary weights and the locator grows
  roughly linearly with the number of cells (fitted exponents 0.8-0.9 over the last
  six sizes, which includes fixed overheads). A located projection takes a
  few microseconds, independent of mesh size.
- **Memory** is about 5 KB per cell. A 512 MB heap holds roughly 100,000 cells;
  Node's default heap on a 64-bit system (about 4 GB) roughly 800,000. These
  two figures are extrapolations of the measured slope, not measurements.
- **Beyond the limit** there is no guard: when the heap is exhausted V8 aborts
  the process, which cannot be caught from JavaScript. For large meshes raise
  `--max-old-space-size`, or split the domain.
- **Per-call checks** are linear in the mesh only at construction: the mesh
  validates conformity once, with a hash grid over the boundary faces.

## `ZeroTraceProjector` and `StableProjector`

These are validation-scale. Every interior vertex, edge, face and cell needs
the solution of two local problems on its extended star, a few rings of cells
wide (more near sharp boundary features, see `docs/VALIDATION.md`). On the
unit cube with 384 cells the weights of all entities take several minutes, so
the cost is roughly a second per cell. Use them for meshes of up to a few
hundred cells, or compute only the entities you need: coefficients are
computed lazily and cached, so projecting at a few points only solves the
local problems around those points.

Memory is dominated by the cached weights, proportional to the number of
entities times the size of a star.
