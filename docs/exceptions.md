# Errors and warnings

The library raises one of three error classes, all in `errors.js` and exported
from the package. A malformed mesh, a non-finite value or a point outside the
mesh is always one of them, never a silent wrong answer. Catch them by class:

```javascript
import { ValidateError, ProjectError, SingularError } from 'traceprojector';

try {
  projector.project(u, point, tIdx, 0);
} catch (error) {
  if (error instanceof ValidateError) { /* the input mesh or arguments are wrong */ }
  else if (error instanceof ProjectError) { /* the call cannot be answered */ }
  else if (error instanceof SingularError) { /* a local problem has no solution */ }
  else throw error;
}
```

## ValidateError

The input is invalid: the mesh, or an argument that describes a mesh or an
element.

| Condition | Message pattern |
|---|---|
| no vertices, or no tetrahedra | `vertices must be a non-empty array`, `tetrahedra must be a non-empty array` |
| a coordinate that is not a finite number | `Vertex ... must be an array of 3 finite numbers` |
| a tetrahedron repeats a vertex | `Tetrahedron ... contains duplicate vertex indices` |
| a vertex index that does not exist | `Tetrahedron ... contains out-of-bounds vertex index ...` |
| zero volume, or negative orientation | `Tetrahedron ... has non-positive or degenerate volume (signedVol=..., relative volume ...)` |
| a mesh that is not conforming | `inconsistent meshes` |
| `generateUnitCubeMesh` with a bad size | `n must be a positive integer` |
| a bad polynomial degree | `degree must be a nonnegative integer` |
| a projector that needs the derivative of the field was not given it | `the derivative of u is needed` |

**Recovery**: fix the input. For a flipped tetrahedron, swap two of its vertex
numbers.

## ProjectError

The arguments are well formed but the call cannot be answered.

| Condition | Message pattern |
|---|---|
| `tIdx` is not an integer, or is out of range | `tIdx must be an integer, got ...`, `tIdx=... out of range [0, ...]` |
| a point that is not three finite numbers | `point must be an array of 3 finite numbers, got ...` |
| a point outside the mesh | `Point [...] not found in any tetrahedron` |
| the field returns `NaN` or `Infinity` at a degree of freedom | `... produced a non-finite value ...`, `a degree of freedom is not finite`, `coefficient of degree ... entity ... is not finite` |
| a form degree that does not exist | `Invalid form degree l=...` |
| `Projector.projectHp` for `l = 1, 2` with `p > 0` | `Higher-order projections for l=..., p=... not yet implemented` (use `CanonicalProjector`) |

**Recovery**: check the field at the reported point; locate the point with
`Locator` before projecting; use `CanonicalProjector` or `HigherOrderProjector`
for higher degrees.

## SingularError

A local linear problem has no solution or the matrix is not definite.

| Condition | Message pattern |
|---|---|
| a `3x3` matrix with zero determinant | `Singular 3x3 matrix`, `Singular or near-singular matrix` |
| a local mass or stiffness matrix that is not positive definite | `matrix is not positive definite` |
| an extended star that is not a topological ball | `the extended star of the vertex is not contractible`, `... of the edge ...` |
| no field with the required derivative in a star | `no field with the required differential in the star of entity ...`, `no flux field with the required divergence` |
| a boundary weight that reaches outside its star | `a boundary weight leaves the star` |

**Recovery**: the mesh is too coarse near the reported entity for the local
problem to exist, or it has a degenerate element. Refine it, or repair the
element.

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

**Recovery**: Inspect the local star geometry for inverted or degenerate
* elements.

## Projector Warnings

`Projector` warns at construction if the mesh contains degenerate or near-degenerate tetrahedra.

| Code | Message | Meaning |
|------|---------|---------|
| `TRACEPROJECTOR_DEGENERATE_MESH` | `Projector: mesh contains N degenerate or near-degenerate tetrahedra. Projections may fail.` | The mesh has tetrahedra whose volume relative to their longest edge cubed is below `1e-10` (see `MIN_RELATIVE_VOLUME`). |

**Recovery**: Re-mesh or repair the input mesh before computing projections.
