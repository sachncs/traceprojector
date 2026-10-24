# Limits

What the library does not do, what it asks of your input, and where its
guarantees stop, each with the evidence. Costs are in
[Performance](performance.md); the claims of the papers and their status are in
[Validation](VALIDATION.md).

## What the mathematics does not give you

| Limit | Detail |
|---|---|
| **Trace preservation above the lowest order is validated at `p = 1` (all form degrees) and `p = 2` (0-forms) on cubes.** | `TracePreservingProjector` takes `degree: p`. It is not evaluated as coefficients but field by field (`local`), costs seconds to a minute per point near the boundary at `p = 1`, and its stability constant above the lowest order has not been measured. The boundary weights use the lowest-order weights of the paper with a corrected Whitney basis rather than weights re-derived for each `p`; the properties the proof needs are checked (see [Validation](VALIDATION.md)). `HigherOrderProjector` does not preserve nonzero boundary traces. |
| **Commuting for the trace-preserving operators holds on a class of fields.** | For `TracePreservingProjector` and `StableProjector`, `d Π u = Π d u` is proved and tested for fields whose boundary trace is a lowest-order trace, and fails by about 5·10⁻³ (4 × 4 × 4 cube) for others. The papers state it for all fields, but their proof needs the narrower class. `BoundedCommutingProjector` and `HigherOrderProjector` commute for every input. |
| **`Projector` is not bounded.** | It takes point values, edge integrals and face fluxes. A field that is unbounded at a vertex raises `ProjectError`; use a bounded operator for such data. |
| **The stability constants are measured, not proved here.** | Narrow-bump ratios stayed between 0.86 and 1.01 across refinement for the bounded operators and did not grow, at the sizes tested (up to 10 cells per side at the lowest order, 6 at higher order). That a constant is bounded for all meshes is the papers' theorem, with an assumption (below). |
| **Assumption 2.4 of Arnold and Guzmán is assumed by the paper.** | This repository measured its discrete form on jittered meshes, 100:1 stretched meshes and `p = 1` (0.002 to 0.36, no growth with refinement). It is evidence on those families, not a proof. |
| **Not all claims of the papers are tested.** | K5, K6 and K7 (stability on the discrete space, the discrete lifting, best approximation) and the bounds of W6 for the higher-order boundary weights are listed as unchecked. |

## What it asks of your mesh

- **Conforming and positively oriented.** Neighbouring tetrahedra share whole
  faces; no hanging nodes; every tetrahedron has positive volume. Violations
  raise `ValidateError`, including a face shared by three tetrahedra and a
  hanging node (found by the fuzzer; 10,000 of 10,000 cases are handled
  correctly). Two tetrahedra that overlap in volume without any shared-face
  inconsistency are not detected.
- **No degenerate cells.** A tetrahedron whose volume over the cube of its
  longest edge is below `1e-10` is rejected. That is an aspect ratio of about
  `10⁵`; meshes stretched by `10⁴` are projected correctly.
- **Fine enough for the bounded operators.** They need each extended star to be
  a topological ball. A 3 × 3 × 3 cube is too coarse for the trace-preserving operator and raises
  `ValidateError`;
  near the edges of a cube the stars are enlarged beyond one ring (up to four
  rings), which is allowed but costs time.
- **Any unit system.** Cubes scaled from 10⁻⁶ to 10⁶ are accepted and projected
  exactly; coordinates offset by 10⁸ are accepted.

## What it asks of your field

- **Finite.** A field that returns `NaN` or `Infinity` at a point the operator
  samples raises `ProjectError`; it does not return a wrong number.
- **Regular enough for the operator.** The canonical operators need point
  values, edge integrals and face fluxes to exist. The bounded operators need
  `L²`; for the trace-preserving ones you also supply the derivative of the
  field (gradient, curl or divergence) and it must be `L²`.
- **Defined on the whole domain.** Fields are evaluated at quadrature points of
  the cells; they must make sense in every cell.

## Size

The canonical projector uses about 5 KB per cell; a 512 MB heap holds roughly
100,000 cells and Node's default heap about 800,000 (extrapolations of the
measured slope, not measurements). There is no guard: when V8's heap is
exhausted the process aborts, which cannot be caught from JavaScript. Raise
`--max-old-space-size` or split the domain. Edge and face keys limit the
canonical path to fewer than about 131,000 vertices (see
[Architecture](architecture.md)); the library has not been run beyond that.

The bounded operators are practical for meshes of up to a few thousand cells if
you need every coefficient, and for meshes of any size if you only need the
projection at some points.

## Environment

Node.js 24 or newer. The package is ESM only. The UMD bundle runs in a browser;
`projectInParallel` needs Node worker threads and is not available there.
