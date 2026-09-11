# Error Taxonomy

This library uses a small hierarchy of custom error classes to provide actionable diagnostics.

## ValidateError

Thrown by `Mesh` (and mesh generators) when input data is geometrically or topologically invalid.

| Condition | Message pattern |
|-----------|-----------------|
| Empty tetrahedra array | `Mesh must contain at least one tetrahedron` |
| Non-finite vertex coordinate | `Vertex ... contains non-finite value` |
| Duplicate vertex indices in a tet | `Tetrahedron ... contains duplicate vertex indices` |
| Out-of-bounds vertex index | `Tetrahedron ... references out-of-bounds vertex index` |
| Non-integer tetrahedron index | `Tetrahedron ... contains non-integer vertex index` |
| Negative orientation (det <= 0) | `Tetrahedron ... is degenerate or negatively oriented` |

**Recovery**: Fix the input mesh data and re-instantiate `Mesh`.

## ProjectError

Thrown by `Projector` and projector classes when arguments are invalid or operations cannot proceed.

| Condition | Message pattern |
|-----------|-----------------|
| Invalid `tIdx` type | `tIdx must be a non-negative integer` |
| Out-of-range `tIdx` | `tIdx ... is out of range` |
| Invalid point type | `point must be an array of 3 finite numbers` |
| Point outside mesh | `Point ... not found in mesh` |
| Unimplemented higher-order vector projection | `Higher-order vector projection (l=1 or l=2, p>0) is not yet implemented` |

**Recovery**: Validate inputs before calling projection methods; ensure the point locator is built for global queries.

## SingularError

Thrown by linear algebra routines in `utils.js` when a matrix is singular or numerically rank-deficient.

| Condition | Message pattern |
|-----------|-----------------|
| Zero pivot during LU | `Singular matrix encountered` |
| Zero determinant in `inverse3x3` | `Singular matrix encountered` |
| Zero determinant in `solve3x3` | `Singular matrix encountered` |

**Recovery**: Check mesh validity (degenerate elements cause singular Jacobians) or verify the input matrix.

## Weight Warnings

`Weight` logs warnings via an injected `warn` function rather than throwing, because per-vertex failures should not halt the entire computation.  Construct with `{ strict: true }` to opt into fail-fast behaviour: in that mode the same per-simplex failure path re-throws a `ProjectError` instead of emitting a warning.

| Code | Message | Meaning |
|------|---------|---------|
| `BWC_EDGE_FAILURE` | `Weight: failed to compute edge weight for edge ${eIdx}: ${err.message}` | See `traceprojector/weight.js` for the call site. |
| `BWC_EDGE_NO_STAR` | `Weight: edge ${eIdx} has no boundary-face star; skipping.` | See `traceprojector/weight.js` for the call site. |
| `BWC_FACE_FAILURE` | `Weight: failed to compute face weight for face ${fIdx}: ${err.message}` | See `traceprojector/weight.js` for the call site. |
| `BWC_FACE_NO_STAR` | `Weight: face ${fIdx} has no extended star; skipping.` | See `traceprojector/weight.js` for the call site. |
| `BWC_VERTEX_BWEIGHT_FAILURE` | `Weight: failed to compute vertex weight for vertex ${vIdx}: ${err.message}` | See `traceprojector/weight.js` for the call site. |
| `BWC_VERTEX_NO_STAR` | `Weight: vertex ${vIdx} has no boundary-face star; skipping.` | See `traceprojector/weight.js` for the call site. |

**Recovery**: Inspect the mesh near the reported simplex for degenerate or inverted elements.

## Bubble Warnings

`Bubble` also warns rather than throwing for singular mass matrices.

| Code | Message | Meaning |
|------|---------|---------|
| `HOP_BUBBLE_SOLVE_FAILED` | `Bubble: bubble solve failed for tet ${tIdx}, p=${p}: ${e.message}` | See `traceprojector/bubble.js` for the call site. |
| `HOP_L2_SOLVE_FAILED` | `Bubble: L2 solve failed for tet ${tIdx}, p=${p}: ${e.message}` | See `traceprojector/bubble.js` for the call site. |

**Recovery**: Ensure the tetrahedron has strictly positive volume.

## Solver Warnings

`Solver` warns on ill-conditioned local solves rather than throwing.

| Code | Message | Meaning |
|------|---------|---------|
| `LOCAL_SOLVER_ILL_CONDITIONED` | `Solver: matrix is ill-conditioned (norm=...). Results may be inaccurate.` | The local stiffness matrix is numerically ill-conditioned; the solve may be inaccurate. |

**Recovery**: Inspect the local star geometry for inverted or degenerate elements.

## Projector Warnings

`Projector` warns at construction if the mesh contains degenerate or near-degenerate tetrahedra.

| Code | Message | Meaning |
|------|---------|---------|
| `TRACEPROJECTOR_DEGENERATE_MESH` | `Projector: mesh contains N degenerate or near-degenerate tetrahedra. Projections may fail.` | The mesh has tetrahedra with signed volume below `1e-12`. |

**Recovery**: Re-mesh or repair the input mesh before computing projections.
