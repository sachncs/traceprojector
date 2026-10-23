# Validation

This document records what is claimed about the projections, where each claim
comes from, how it is tested and what the evidence shows. Claims are taken
from the papers, not from the README:

- **Paper 1** — Ern, Guzmán, Potu, *Bounded, commuting, discrete-trace
  preserving projections*, [arXiv:2604.28103](https://arxiv.org/abs/2604.28103).
  The paper contains no numerical experiments or tables, so its theorems and
  proofs are the only specification.
- **Paper 2** — Ern, Guzmán, Potu, Vohralík, *Local L²-bounded commuting
  projections using discrete local problems on Alfeld splits*,
  [arXiv:2502.03601](https://arxiv.org/abs/2502.03601). It supplies the
  zero-trace operator `Π̊` that Paper 1 takes as given.

Tolerances were fixed before the first validation run and live in
[`validation/tolerances.json`](../validation/tolerances.json); their git history
shows when they were committed and whether they changed.

Run everything with `npm run validate` (the unit tests run with `npm test`).

## What the code implements

| Class | Operator | Status |
|---|---|---|
| `Projector` | `Π = Π_∂ + Π_ring (I − Π_∂)` with **canonical** degrees of freedom throughout | Commutes and preserves traces for fields with well-defined point values, edge integrals and face fluxes. Not bounded: the paper's boundary weights only cross-check the degrees of freedom. |
| `ZeroTraceProjector` | `Π̊` of Paper 2, `p = 0` | Projection onto the zero-trace Whitney space, commuting, finite for rough input. |
| `StableProjector` | `Π_∂^canonical + Π̊ (I − Π_∂^canonical)` | Stable for interior roughness. Boundary part canonical, so boundary data must be finite. |

## Claims

Status is the strongest evidence added here beyond the paper's own proof:
**identity** (an exact algebraic identity checked to a roundoff bound),
**empirical** (measured on meshes), **unchecked**.

| ID | Claim (source) | Status | Evidence |
|---|---|---|---|
| K1 | `Πu = u` on the discrete space (P1 Thm 3.1) | identity | `validation/identities.test.js`, `validation/stable-operator.test.js` |
| K2 | `tr Πu = tr u` for `u ∈ V_tr,p` (P1 Thm 3.1) | identity | `validation/identities.test.js` (canonical), `validation/stable-operator.test.js` |
| K3 | `dΠu = Πdu` (P1 Thm 3.1) | identity, **narrowed** | see "Commuting" below |
| K4 | local L²/graph bounds, constants depend only on `ρ, p` (P1 Thm 3.1) | empirical | **fails for `Projector`**; holds for the interior part of `StableProjector`; open for the boundary part |
| K5–K7, D1–D5, W1–W7, M1, M2, G1 | see `plan` table | not yet separately tested | — |

### Commuting (K3): the paper's statement is wider than its proof

Theorem 3.1 states `d^l Π^l u = Π^{l+1} d^l u` for every `u ∈ V^l`. The proof
applies the commuting property of `Π̊` to `u − Π_∂ u`, which requires that
function to have **zero trace**. That holds exactly when `tr u = tr Π_∂ u`,
i.e. for `u ∈ V_tr,p` — the class of the trace-preservation claim — and not
for a general `u`. This repository therefore tests commuting on
`V_tr,p`, where it holds to roundoff (`StableProjector`, grad, curl and div).
For a smooth quadratic `u` outside `V_tr,p`, `StableProjector` does not commute
(coefficient error 1.2e-2 on interior edges at `n = 4`; one mesh size, so no
rate is claimed), whereas the canonical `Projector` does (Stokes). Whether the
paper's own weight-based `Π_∂` repairs this is not known here.

### Stability of the canonical operator (K4)

`u(x) = |x − c|^(−0.4)` is in `H¹` of the unit cube and unbounded at the mesh
vertex `c`. `Projector.project` returned `Infinity` silently; it now throws
`ProjectError` (`tests/non_finite.test.js`). `StableProjector` and
`ZeroTraceProjector` return finite values
(`validation/stable-operator.test.js`).

## Assumption of the construction, and what cube meshes do to it

Paper 2 assumes that each extended star `ES(σ)` is a ball whose boundary
splits into **one** edge-connected patch on `∂Ω` and **one** inside the
domain, and says this "can be satisfied if the mesh is fine enough". On the
unit cube it is **not**: near each geometric edge of the cube, the one-ring
star of an interior entity touches `∂Ω` in two separate patches, at every mesh
size (the pattern is scale-invariant). For `n = 4`, 12 of 27 interior
vertices, 144 of 316 interior edges and 228 of 672 interior faces violate it
at radius one.

The implementation therefore grows the star radius per entity until the
assumption holds (and at least to the radius of the entity's boundary
entities, so supports nest). The weights stay valid (all identities below
hold) but the supports are larger than one ring near the cube edges, which is
a departure from the paper's one-ring supports. Boundedness constants for
those stars are not proved.

## Results so far (cube mesh `n = 4`, 384 cells)

All at the pre-registered identity tolerance, `10 · 1000 · ε · ρ · scale`.

- `⟨Z^l(σ), W_ρ⟩ = δ_{σρ}` for interior `ρ`, all four degrees: max error 2e-15.
- Weak differential relations `⟨Z¹(e), ∇m⟩`, `⟨Z²(f), curl A⟩`, `⟨Z³(c), div B⟩`
  against independent quadrature of smooth test fields: pass.
- `ZeroTraceProjector`: projection onto the zero-trace Whitney space, all four
  degrees; commuting grad, curl, div: pass.
- `StableProjector`: reproduces the discrete space (all four degrees); commutes
  for fields with polynomial trace; finite for the interior singular field.
- Classical Whitney identities of the oriented complex (de Rham map,
  `d∘d = 0`, partition of unity, Stokes-compatible degrees of freedom): pass.

## Floating-point policy for geometry (A9)

Absolute thresholds made acceptance depend on the unit system. With the old
code, a mesh scaled to edges of 0.5e-4 was rejected as degenerate
(`signedVol 1.25e-13 < 1e-12`), the point locator returned nothing on it, face
normals below 1e-12 were silently replaced by `[0, 0, 1]`, and small 3x3
systems were declared singular. A double-precision determinant also had the
wrong sign for 1,069 of 100,000 nearly flat tetrahedra.

Policy now: a tetrahedron is degenerate when its volume determinant divided by
the cube of its longest edge is below `MIN_RELATIVE_VOLUME = 1e-10`. The
determinant of a tetrahedron with coordinates of size one carries a rounding
error of a few times 1e-16, so above the floor the sign is reliable, and the
barycentric gradients keep roughly six digits. The floor is a design
parameter chosen from that error analysis, not tuned to a test outcome.

Evidence (`validation/geometry.test.js`, `tests/scale_invariance.test.js`):
unit cubes scaled by 10^-6 to 10^6 are accepted, projected exactly, and pass
the boundary-weight verification; translations to 10^8 are accepted; over
100,000 random nearly flat tetrahedra no tetrahedron called valid or inverted
disagrees with the exact predicate of `robust-predicates`, and none clearly
above the floor is called degenerate.

## Input robustness: the fuzzer (A8)

`validation/fuzz.test.js` runs 10,000 seeded cases (limits and verdict rule in
`tolerances.json`), each in a worker thread with a 512 MB heap ceiling and a
10 s watchdog. Generators: valid perturbed/rotated/shifted/scaled cube meshes,
non-finite coordinates, empty and non-array input, wrong shapes, bad indices,
repeated indices, coincident vertices, flat and inverted tetrahedra, extreme
coordinates (1e±300), disconnected meshes, a face shared by three tetrahedra
and a hanging node. A case passes when the library raises `ValidateError`,
`ProjectError` or `SingularError` for invalid input, or returns the exact
projection of an affine field for valid input.

The first run found two silent acceptances: a **face shared by three
tetrahedra** and a **hanging node** (two cells meeting without sharing a face)
were accepted, so projections on such meshes would be wrong without any error.
`Mesh` now raises `ValidateError` for both. The check does not reject meshes
with cavities. Result: 10,000 of 10,000 cases pass, with no hangs, crashes or
untyped errors. Not detected, and not tested: two tetrahedra that overlap in
volume without any shared-face inconsistency.

## Metamorphic properties (A7)

`validation/metamorphic.test.js` (`fast-check`, 1,000 runs per property, shrinking
on): for form degrees 0 to 3, the canonical projection is linear, independent of
vertex and cell numbering (including even permutations of a cell's vertices),
commutes with rigid motions and with uniform scaling (for the pullback of the
field), and is idempotent. All pass.

Two things came out of writing these:

- **`computeBoundaryWeights()` modified the caller's arrays.** `Mesh` kept a
  reference to the `vertices` array it was given and the refinement appended
  split points to it (27 vertices became 195), so reusing the arrays produced a
  different mesh. `Mesh` now copies its input.
- **The default order-3 tetrahedron rule has points on the element faces and a
  negative weight.** A function that jumps across faces, such as the degree-3
  output, is then evaluated at ambiguous points: `Π³(Π³u) ≠ Π³u` with that rule
  (error 0.09) and holds with the interior order-2 rule (`quadratureOrder: 2`).
  The negative weight also means the cell average is not a monotone
  positive-weight quadrature. The default was not changed here.

## Convergence (A4)

`validation/convergence.test.js`, meshes of 4 to 24 cells per side. The target
orders are those of classical Whitney interpolation theory; the papers prove
quasi-optimality, not a rate. Rule (pre-registered): the lower 95% confidence
bound of the fitted log-log slope is at least the target minus 0.1.

| Quantity | Target | Observed slope | Lower 95% bound |
|---|---:|---:|---:|
| `Π⁰`, L² error | 2 | 1.956 | 1.926 |
| `Π⁰`, H¹ seminorm error | 1 | 0.977 | 0.961 |
| `Π¹`, L² error | 1 | 0.996 | 0.993 |
| `Π²`, L² error | 1 | 0.997 | 0.995 |
| `Π³`, L² error | 1 | 0.986 | 0.976 |

A first design failed the rule (`Π⁰` L² slope 1.42, lower bound 1.09): it used
one wavelength across the cube on meshes of 2 to 12 cells per side, so most of
the fit was in the pre-asymptotic range (successive-pair orders 0.87, 1.63,
1.90). The library was not at fault: `projectH1` equals plain nodal
interpolation exactly. The field and mesh range were changed to reach the
asymptotic regime; the threshold was not.

## Stability (A5)

`validation/stability.test.js`. For a smooth bump of width `δ` centred at a mesh
vertex, `‖Πu‖ / ‖u‖` in L² is a lower bound for the stability constant.

- **Canonical `Π⁰` is not stable.** `Π⁰u` is the vertex hat function however
  narrow the bump, so the ratio grows like `δ^(-3/2)`: from `δ = h/2` to
  `δ = h/32` it grows by a factor of 64, which is exactly the predicted
  `16^(3/2)`.
- **The stable interior projection is.** The largest ratio is 0.858 to 0.866 on
  meshes of 4, 6, 8 and 10 cells per side; fitted growth is `h^(-0.010)`, i.e.
  1.007 per halving of `h`, against the pre-registered limit of 1.10.

Not covered: the pre-registered four mesh-quality levels (shape regularity),
bumps near the boundary, and the second part of the singular-field criterion
(change between mesh sizes against the smooth-field change). The stability
statement holds for the interior part only.

## Known gaps

- The paper's weight-based boundary operator `Π_∂` is not implemented, so
  boundary roughness is not covered and commuting outside `V_tr,p` is open.
- Higher order (`p > 0`) for the stable operators needs the operators `Q_p`
  of Arnold–Guzmán (2021), not yet read.
- Performance: local problems use iterative solvers on stars of up to several
  rings; the whole `n = 4` mesh takes minutes. Limits are not yet measured.
- Stability constants (growth under refinement) are not yet measured.
