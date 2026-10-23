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

## Known gaps

- The paper's weight-based boundary operator `Π_∂` is not implemented, so
  boundary roughness is not covered and commuting outside `V_tr,p` is open.
- Higher order (`p > 0`) for the stable operators needs the operators `Q_p`
  of Arnold–Guzmán (2021), not yet read.
- Performance: local problems use iterative solvers on stars of up to several
  rings; the whole `n = 4` mesh takes minutes. Limits are not yet measured.
- Stability constants (growth under refinement) are not yet measured.
