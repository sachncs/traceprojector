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
| `BoundedCommutingProjector` | Paper 2, Thm 5.1, `p = 0`: a weight for every entity, no boundary condition | Locally L²-bounded and commuting for every input, boundary included. **Does not preserve traces.** |

## Claims

Status is the strongest evidence added here beyond the paper's own proof:
**identity** (an exact algebraic identity checked to a roundoff bound),
**empirical** (measured on meshes), **unchecked**.

| ID | Claim (source) | Status | Evidence |
|---|---|---|---|
| K1 | `Πu = u` on the discrete space (P1 Thm 3.1) | identity | `identities.test.js` (canonical), `stable-operator.test.js` (stable), `bounded-commuting.test.js` (bounded, nonzero trace) |
| K2 | `tr Πu = tr u` for `u ∈ V_tr,p` (P1 Thm 3.1) | identity | same files |
| K3 | `dΠu = Πdu` (P1 Thm 3.1) | identity: holds for **every** `u` for `BoundedCommutingProjector`; **narrowed to `V_tr,p`** for the trace-preserving operators | see "Commuting" below; `bounded-commuting.test.js` |
| K4 | local L²/graph bounds, constants depend only on `ρ, p` (P1 Thm 3.1) | empirical | **fails for `Projector`** (growth 64× over a 16× narrowing); holds for the interior part of `StableProjector` (ratio 0.86, growth 1.007 per halving), whose boundary part is open; holds everywhere for `BoundedCommutingProjector` (ratio 0.856, growth 1.000 per halving, at the boundary); holds for `TracePreservingProjector` at the boundary (ratio 1.01 for 0-forms and 1.006 for 1-forms, growth 0.995 per halving, `validation/trace-preserving.test.js`) |
| K5 | L² stability on `V_{d,p}` (P1 Cor 3.2) | unchecked | needs the paper's boundary operator |
| K6 | stable discrete lifting `Π∘E` (P1 Lemma 3.4) | unchecked | needs a harmonic extension and the boundary operator |
| K7 | best approximation and polynomial extension (P1 Cors) | unchecked | follow from K4–K6 by the paper's proofs |
| D1 | `tr Π_∂u = tr u` on `V_tr,p` | identity | canonical `Π_∂`: boundary degrees of freedom equal those of `u` (`stable-operator.test.js`) |
| D2 | `tr(dΠ_∂u) = tr(Π_∂du)` | identity | canonical `Π_∂`: Stokes; exact on boundary edges (checked at the coefficient level) |
| D3 | `Π_∂u = 0` away from the boundary | identity | holds by construction for canonical `Π_∂` (no boundary entity, no term) |
| D4 | local bound on `Π_∂`, incl. `Π_∂³` | empirical | **fails for canonical `Π_∂`** (point values); not implemented for the paper's `Π_∂` |
| D5 | `Π_∂³` preserves cell integrals | identity | `tests/` (cell-mean projection) |
| W1 | `α_r(w) = (tr w, ζ_r)_Γ`, zero on zero-trace (P1 Lemma 4.2) | identity (`p = 0`) | `tests/boundary_projector.test.js`: `α_r(W_s) = δ_rs` for every boundary vertex, edge and face `r` and every Whitney form `W_s` of the mesh, with the extensions `Y` on the Worsey–Farin split |
| W2 | `(ζ_{0,r}, tr B_{0,r'})_Γ = δ` (P1 Lemma 5.x) | identity | existing `tests/bweight.test.js`, `tests/weight.test.js`, `verifyBoundaryWeights` (not independently re-derived here) |
| W3 | `−sdiv ζ¹ = Σκζ⁰`, `srot ζ² = Σκζ¹` | identity (`p = 0`) | `tests/boundary_weights.test.js`: divergence of the edge weight matches the vertex weights; the face weight's rotation matches the edge weights to 1e-9 |
| W4 | partition of unity `Σ_f ζ_f ≡ 1` on `Γ` | identity (`p = 0`) | `tests/boundary_weights.test.js` ("partition of unity of the face weights"): the sum of the face weights is one at every surface point sampled |
| W5 | higher order: Kronecker, `ζ₀ ⊥ tr B₊`, mean-zero `div B₊²` | identity (`p = 1`; its structure holds for any `p`) | `validation/high-order-boundary.test.js`: the boundary weight of every kind of bubble (closed and complementary, `l = 0, 1, 2`) is dual to the bubble basis as a surface pairing and through its extension, to 1e-9; the lowest-order weights are made orthogonal to the bubbles by correcting the Whitney basis (see below); `div B₊² = 0` because the bubbles of 2-forms are closed |
| W6 | support and `h^β` norm bounds on `B`, `Y` | empirical (`p = 0`) | `tests/boundary_claims.test.js`: surface weight norms scale as `h⁻¹, h⁰, h¹` for vertices, edges, faces, and the extensions in the bulk as `h^(l−1/2)`, fitted slopes within 0.15 of the exponent |
| W7 | discrete Poincaré on boundary extended stars | empirical (`p = 0`) | `tests/boundary_claims.test.js`: the constant is 0.456 on vertex stars and 0.336 on edge stars, flat under refinement and under in-plane jitter of 0.25 `h` |
| M1 | `Π̊` is a projection onto the zero-trace space, commuting, L²-bounded (P2 Thm 6.1) | identity + empirical | `stable-operator.test.js` (identities at 2e-15), `stability.test.js` (bounded) |
| M2 | the input meets the star assumption (P2 §2) | empirical | **fails on cube meshes at radius one near edges**; the implementation grows the star until it holds; `LocalWeights.radius` raises `ValidateError` if no radius up to 4 works |
| G1 | `p > 0` for `l ∈ {1, 2}` | resolved at `p = 1, 2` | canonical interpolation of any degree for all `l` (`CanonicalProjector`); locally bounded commuting projection of any degree for all `l` (`HigherOrderProjector`), also with a zero trace; and the trace-preserving operator (`TracePreservingProjector` with `degree: p`), validated at `p = 1` for all `l` and `p = 2` for `l = 0` (TP2) |
| AG1 | `π_r = P_r + Q_r(I − P_r)` is a projection, commutes with `d`, and is `L²`-stable (Arnold–Guzmán Thm 3.1) | identity + empirical (`p = 1`) | `validation/slow/`: reproduces its space for `l = 1, 2, 3` and a quadratic (5e-15); `d π^l u = π^{l+1} d u` to 1e-13 (0→1), 3e-13 (1→2), 1e-12 (2→3); stability ratio on narrow bumps 1.007 (`l = 0`), 0.995 (`l = 1`), 0.997 (`l = 2`), growth 1.000 per halving of `h` (limit 1.10) |
| TP2 | `Π` above the lowest order: a projection, preserves the trace, commutes on `V_tr,p` (P1 Thm 3.1, `p ≥ 1`) | identity (`p = 1`, all `l`; `p = 2`, `l = 0`) | `validation/high-order-boundary.test.js` (trace of `Π_∂u` equals the trace of `u` to 7e-13 for `l = 0, 1, 2`; `tr dΠ_∂u = tr Π_∂du` to 6e-13 for grad and 6e-14 for curl on polynomial fields); `validation/slow/trace-preserving-higher-order.test.js` (`Πu = u` to 5e-13 near the boundary and in the interior for `l = 0..3`; grad, curl and div commute for fields with a discrete trace to 1e-11 at quadrature order 8; `p = 2`, `l = 0`: 7e-13) |
| S1 | the local minimum-norm problems are solved exactly | certified | every solve returns its constraint residual, stationarity and duality gap; at most 3e-11, 2e-14 and 3e-15 over regular, jittered and 10:1, 100:1 stretched meshes (`validation/solver-robustness.test.js`); energy equal to the dense reference to 6e-10 |
| AG2 | Assumption 2.4: the constant of the right inverse of `d` on each extended star is uniformly bounded | empirical | `validation/assumption-2-4.test.js` (see below) |

**Counts (26 claims):** identity 15 (K1, K2, K3 narrowed, D1, D2, D3, D5, W1, W2, W3, W4, W5, M1, AG1, TP2; W1, W3 and W4 at `p = 0`, W5 and AG1 at `p = 1`), empirical 7 (K4, D4, W6, W7, M2, AG2, plus S1, which is certified), unchecked 3 (K5, K6, K7), narrowed or resolved 1 (G1; the document keeps the row because the evidence is partial). K4, D4 and M2 each have a documented negative or partial result.

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

## The bounded commuting projection (no boundary condition)

`BoundedCommutingProjector` computes the weights of Paper 2 Theorem 5.1 for
every entity, with the zero-flux condition on the whole boundary of every
star. It is the one operator here that is bounded **and** commutes for every
input, boundary included, because it never takes a point value, edge integral
or face flux and imposes no trace condition. It does not preserve traces.

- The star assumption holds at radius one everywhere (no escalation): the
  difficulty on cube meshes came entirely from the boundary patches of the
  trace-preserving variants. All 125 + 604 + 864 + 384 entities of the `n = 4`
  mesh solve, in about half a minute.
- `validation/bounded-commuting.test.js` (pre-registered tolerance):
  `⟨Z(σ), W_ρ⟩ = δ` for every pair of entities of the sampled stars, all four
  degrees; `Πu = u` for discrete fields **with nonzero trace**; and
  `grad Π⁰ = Π¹ grad`, `curl Π¹ = Π² curl`, `div Π² = Π³ div` at the
  coefficient level for generic cubic polynomial fields, which have
  nonzero boundary values and are **not** in `V_tr,p`. This is where the
  trace-preserving operator fails (see "Commuting" above).
- A field in `H¹` that is unbounded at a *boundary* vertex gives finite
  output for all four degrees; the canonical operator returns `Infinity`.

## Solver robustness (S1)

Each weight needs the field of least energy `x'Mx` with `Cx = r`. The solver
returns the solution together with a **certificate**: the constraint residual
`|Cx − r|`, the stationarity `|Mx − C'λ|` for the multipliers `λ` it found,
and the duality gap they give. A feasible point with zero stationarity is the
minimizer, so small values certify the answer without a reference solver.

| Mesh (5 × 5 × 5 cube, `p = 1`) | solves | residual | stationarity | gap |
|---|---:|---:|---:|---:|
| regular | 41 | 4e-12 | 3e-15 | 8e-16 |
| jittered by 0.25 `h` | 47 | 4e-12 | 3e-15 | 4e-16 |
| stretched 10 : 1 | 41 | 4e-12 | 1e-14 | 3e-15 |
| stretched 100 : 1 | 41 | 3e-11 | 1e-14 | 3e-15 |

The limits were fixed in advance (`validation/tolerances.json`, `solver`):
1e-10 for each of the three, no fallback to the dense solver, and agreement
with the dense reference in energy to 1e-8 (observed 6e-10 at 100 : 1).

**What measuring found.** The first comparison, "banded agrees with dense",
disagreed by 50 to 90% in energy on the degree-2 problems while both satisfied
the constraints equally well. The certificates settled which was wrong: the
*dense reference*. For more constraints than unknowns, when `C` has a null
space, the `n × n` normal equations it solved are singular, and a basic
solution of a singular system is not the minimum-norm one. It had up to 80%
more energy than the minimizer. All the identities of this document depend only
on feasibility, so none was affected, and the stability ratios measured with
the corrected solver differ from the earlier ones by at most 0.001. The dense solver now
solves the Gram system of the dual, which has a unique `x`, and a regression
test covers the case. The iterative solver was also found, by the same
certificates, to stop with a stationarity of up to 6e-5 on those problems because its
penalty amplified rounding; it now applies the Schur complement with an
accurate factorization of the mass matrix alone, and the stationarity is at
roundoff by construction.

The benchmark harness (`npm run bench`) records these certificates with
every timing, and `npm run bench:check` fails on a regression in time (in
units of a calibration loop), in factor size or in a certificate.

## The boundary operator above the lowest order (W5, TP2)

The paper builds, for `p ≥ 1`, a weight for every bubble degree of freedom of a
boundary edge or face: for the closed bubbles the Riesz representer, weighted by
the bump `μ`, of the coefficient functional on the trace space of the star;
for the complementary bubbles the surface rotation or divergence of the weights
of their differentials; each is extended into the bulk on the Worsey–Farin
split with no bulk degrees of freedom. The paper also takes the lowest-order
weights from a construction in the degree-`p` trace spaces, so that they are
orthogonal to the bubbles.

This implementation keeps the lowest-order weights of `p = 0` and makes the
basis, rather than the weights, orthogonal: with `M_ab = (ζ_a, tr B_b)_Γ`
the pairing of a lowest-order weight with a bubble basis function, the
Whitney coefficient of the operator is `α_a(u) − Σ_b M_ab α_b(u)`. For a
finite element function this returns exactly its boundary degrees of freedom
(a short calculation, checked numerically below), the commuting of the traces
follows from the same relations as in the paper, and the weights stay local.
This is a departure from the paper's construction, not a restatement of it:
whether its boundedness constants match the paper's has not been measured.

What is checked (`p = 1`, 2 × 2 × 2 cube, `validation/high-order-boundary.test.js`):

- every bubble weight, of every kind, is dual to all the basis functions of its
  star, both as a surface pairing and through its extension (volume formula),
  to 1e-9;
- the surface pairing of a lowest-order weight with a bubble equals the volume
  formula over 2,000 pairs to 1e-15;
- the trace of `Π_∂u` equals the trace of `u` for a finite element function to
  3e-14 (0-forms), 7e-13 (1-forms) and 3e-13 (2-forms);
- `tr dΠ_∂u = tr Π_∂du` for polynomial fields to 6e-13 (grad) and 6e-14
  (curl). For a smooth non-polynomial field the identity holds up to the
  quadrature error (4e-8 at the default order), which the `quadratureOrder`
  option reduces.

The whole operator (`validation/slow/trace-preserving-higher-order.test.js`,
6 × 6 × 6 cube): see TP2 above.

## Assumption 2.4 of Arnold and Guzmán (AG2)

The bound of the higher-order operator rests on a constant: the norm of a right
inverse of `d` on the extended star of an entity, for fields with vanishing
trace on the whole boundary of the star (a Bogovskii-type operator). The paper
proves it only for stars that are star-shaped with respect to a ball and, for
the stars that occur, **assumes** it is uniformly bounded. This repository
measures its discrete form, in the finite element spaces the projector uses.

For each sampled entity `σ` and form degree `k = 0, 1, 2`, the constant is
`C = sup |ρ| / (diam(es σ) |dρ|)` over discrete `ρ` with zero trace. It equals
`1 / (diam · √μ)` for the smallest nonzero eigenvalue `μ` of
`BᵀM_to B x = μ M_from x` (`HighOrderWeights.extensionConstant`), computed
exactly. The rule (`validation/tolerances.json`, `extensionConstant`) was
fixed before the final run: `C ≤ 0.6` everywhere, and growth at most 1.10 per
halving of `h`.

| Mesh (6 × 6 × 6 cube unless noted) | `C₀` | `C₁` | `C₂` |
|---|---:|---:|---:|
| regular | 0.075 | 0.129 | 0.299 |
| interior vertices jittered by 0.2 `h` | 0.076 | 0.133 | 0.275 |
| jittered by 0.3 `h` | 0.075 | 0.140 | 0.274 |
| stretched 10 : 1 | 0.021 | 0.199 | 0.355 |
| stretched 100 : 1 | 0.002 | 0.204 | 0.362 |
| `p = 1`, jitter 0.2 `h`, 4 × 4 × 4 | 0.090 | 0.136 | 0.265 |
| jitter 0.25 `h`, `n = 4` → `n = 8` | 0.076 → 0.080 | 0.132 → 0.136 | 0.274 → 0.277 |

What this shows: over twelve entities of each degree on each of these meshes
the constant is far below the limit, does not depend on `h` (growth 1.03 per
halving at worst), and is insensitive to jitter and to anisotropy up to 100:1.
What it does not show: that no family of meshes has stars with a large constant.
The check is finite; a degenerating family would be seen only if it is among
the samples. The assumption remains an assumption of the paper, now with
numerical support on these families.

## Commuting for general fields: diagnosis

The README of an earlier version of this repository reported that
`TracePreservingProjector` commutes only for fields whose boundary trace is a
lowest-order trace, and fails by about 5·10⁻³ for others. The cause is not in
the implementation. Splitting the residual on the 4 × 4 × 4 cube by distance from
the boundary shows the failure on edges that touch the boundary (4.7·10⁻³) and
on edges one layer in (1.7·10⁻³), while the boundary part `Π_∂` commutes to
6·10⁻¹⁵ everywhere, as its definition requires. The failure is in the zero-trace
part, applied to `u − Π_∂u`: `Π̊` commutes with `d` only for functions with
zero trace, and `u − Π_∂u` has zero boundary *degrees of freedom* but not zero
trace unless `tr u` is a lowest-order trace. This is exactly the step of the
paper's proof that needs the narrower class. `BoundedCommutingProjector`, with
no boundary part, commutes for every input to roundoff, which separates the
two. The claim is therefore narrowed to `V_tr,p` (K3 above), as it was.

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

- **The bounded commuting projection is stable at the boundary too.** For a
  bump centred at a vertex in the middle of a face of the cube (half of the
  bump lies outside the domain) the largest ratio is 0.856 on meshes of 4, 6,
  8 and 10 cells per side, with growth 1.000 per halving of `h`. Unlike the
  trace-preserving variant it needs no finite boundary values.

Mesh-quality levels are covered for anisotropic stretch only (see below). Not
covered: bumps near the boundary for the stable operator, and the second part of the singular-field criterion
(change between mesh sizes against the smooth-field change). The stability
statement holds for the interior part only.

## Mutation testing (A12)

Stryker (`stryker.config.json`) with its generic `command` runner: Stryker's
mocha runner imports `mocha/lib/cli/run-helpers`, which mocha 12 no longer has,
so the plugin does not load. The kill signal is the fast unit suite (`npx mocha`,
about a second); the slower `validation/` suite is not run per mutant, so
mutants only that suite would kill are counted as survivors.

| Run | Scope | Mutants | Killed (incl. timeouts) | Score |
|---|---|---:|---:|---:|
| 1 | 22 files, suite as of the start of the run | 4,445 | 3,065 | **68.95%**, below the pre-registered 70% |
| 2 | `simplicial-complex.js` only, current suite | 310 | 288 | 92.9% |
| Combined | run 1 without `simplicial-complex.js`, plus run 2 | 4,446 | 3,353 | **75.42%** |

Run 1 scored `simplicial-complex.js` at 0%: Stryker copies the project when it
starts, and the unit tests that exercise that module were written after the
copy. Run 2 re-measures it with the tests that now exist. The other files were
measured before the Google-style reformat, which changed no behaviour. The
modules `local-weights.js`, `zero-trace-projector.js`, `stable-projector.js`
and `bounded-commuting-projector.js` were not mutated: the fast suite tests
them only lightly, and the validation suite is too slow to run per mutant.

Survivors in run 1 (1,380 of 4,445), by kind: arithmetic operators 371,
conditional expressions 275, equality operators 188, array declarations 120,
block statements 110, string literals 86 (mostly error-message text, which
no test asserts), logical operators 47, calls 38, and others 105. Weakest
files: `refinement.js` 50%, `errors.js` 50%, `traceprojector.js` 55%,
`surface.js` 59%, `l2.js` 64%, `sparse-linear-algebra.js` 66%, `locator.js`
68%, `bubble.js` 68%.

**Killing tests, and a second measurement.** The survivors showed that the
unit suite never exercised the full operator `Π = partial + ring`, the degree
of freedom orientations, the bubble basis or the quadrature rules. Added
`tests/projector_parts.test.js`, `tests/bubble_properties.test.js` and
`tests/quadrature_exactness.test.js`. Re-running Stryker on those three groups
with the current suite (703 killed + 12 timed out of 789 mutants):

| File | Before | After |
|---|---:|---:|
| `projectors/` (h1, hcurl, hdiv, l2) | 83.3% | 92.6% |
| `bubble.js` | 68.4% | 89.1% |
| `quadrature.js` | 73.9% | 90.3% |

Writing these tests found a real defect, fixed in the same change: the
tetrahedron rule documented as order 3 was exact only to degree 2 (its four
off-centre points were at face centroids, not the Keast points), so the L²
projection onto P^p was wrong for `p >= 2` (error 0.13 for a linear function at
`p = 2`, 11 at `p = 3`).

**Still open:** `bweight.js` stays at 82.8% (79 survivors) after the
similarity-equivariance tests in `tests/bweight_equivariance.test.js`: they
pass but kill no further mutants, because the surviving mutants sit in helper
functions that are not exported and that the functionals reach only through
symmetric paths. The score was re-measured, not improved. The other files of the first run were not re-measured.

### Stability under degrading mesh quality

The mesh is stretched in z by 1, 2, 4, 8 (aspect ratios up to 8), and a bump of
radius h/2 centred in the cube is projected by the stable operator. The ratio
||Pi u|| / ||u|| is 0.440, 0.354, 0.289, 0.247: it does not grow, so the
pre-registered bound (at most linear in the stretch) holds with room. This
tests anisotropy only; slivers and random perturbation are covered by the
geometry and fuzz suites for acceptance, not for the stability constant, and
the bump shrinks relative to the stretched cells, so the test is not a worst
case.

## Coverage

`npm run test:coverage` (c8, unit suite only, not `validation/`): 83.9% of statements, **95.4% of branches**, 79.7% of functions. The files under 80% of statements are `parallel-worker.js` (50%, runs in worker threads that c8 does not see in this setup), `parallel.js` (73%) and `whitney.js` (76%). Branch coverage measures that a branch ran, not that a test would notice if it were wrong; the mutation score above is the measure of the latter.

## Known gaps

- **Stability of the operator above the lowest order is not measured.**
  `TracePreservingProjector` at `p ≥ 1` is checked for being a projection, for
  preserving the trace and for commuting; the local `L²` bound of the boundary
  part (W6 for the higher-order weights) and of the whole operator under
  refinement are not. A first measurement was run once (a script, not a test in the suite): for a
  bump `(1 − r²/δ²)³` of width `δ = h/2` one cell from a face and in the
  interior, `l = 0`, `p = 1`, `‖Πu‖/‖u‖` in `L²` over the cells within `2.2h`
  (4-point quadrature) is 0.198 (odd `n`) and 0.598 (even `n`) near the boundary
  for `n = 5` to `10`, and 0.7245 in the interior for `n = 6, 8, 10`. It is
  the same to four digits for every `n` of a parity, as it must be on
  self-similar meshes with a bump that scales with `h`, so it shows the
  ratio does not grow under this refinement, nothing about degrading meshes,
  other fields. The same script for `l = 1, 2, 3` (the bump times a constant
  vector for `l = 1, 2`) gave, near the boundary for `n = 5` to `8` (odd, even)
  and in the interior (`n = 6`): `l = 1` 2.32, 2.94 and 2.56; `l = 2` 3.17, 3.39
  and 2.08; `l = 3` 0.72, 0.75 and 0.47. The values do not grow with `n` (they
  repeat to three digits for each parity), which is again what self-similar
  meshes give. They are lower bounds for the constants, not estimates, and
  degraded meshes and `p = 2` are not covered.
- **Commuting above the lowest order is tested on cubes** (`p = 1` for all
  form degrees, `p = 2` for 0-forms) and on one mesh size; no convergence rate
  is claimed.
- **Cost.** A value of the operator near the boundary at `p = 1` costs 20 to 30
  seconds on a 6 × 6 × 6 cube the first time (weights and extensions are cached
  after), and the operator needs a mesh fine enough for the zero-trace part
  (3 × 3 × 3 and 4 × 4 × 4 are too coarse). See [Performance](performance.md).
- **Mesh requirements.** The bounded operators need meshes fine enough that the
  extended stars are topological balls; near a cube's edges the stars grow
  beyond one ring.
- **Assumption 2.4** is measured on the families above, not proved.
- **`TracePreservingProjector` at `p = 0`** has its stability measured for 0-
  and 1-forms with a bump at a face centre only (ratio 1.01 and 1.006, growth
  0.995 per halving of `h`, `n = 4` to `8`).
