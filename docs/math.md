# Mathematical background

This page explains what the library computes and why, without assuming you
have met finite element exterior calculus. It states what is proved in the
papers, what is assumed, and what this repository has measured; the numbers
are in [Validation](VALIDATION.md).

## The de Rham complex

Four kinds of fields appear in three-dimensional physics, and each is
differentiated in its own way:

```
potentials  --grad-->  fields  --curl-->  fluxes  --div-->  densities
 (l = 0)               (l = 1)            (l = 2)           (l = 3)
```

Each derivative of a derivative vanishes (`curl grad = 0`, `div curl = 0`), and
on a domain without holes, every curl-free field is a gradient and every
divergence-free field is a curl. This chain is the *de Rham complex*; with
zero boundary values it reads

```
H¹₀  --grad-->  H₀(curl)  --curl-->  H₀(div)  --div-->  L²₀
```

A numerical method that respects this structure at the discrete level
(*structure-preserving*) inherits conservation laws and avoids spurious
solutions. That requires replacing each space by a finite element space so that
the same chain holds for the discrete spaces, and replacing each projection
onto them by one that **commutes** with the derivatives.

## The discrete spaces

On a tetrahedral mesh the lowest-order spaces are:

| `l` | Space | Degrees of freedom | Basis |
|---:|---|---|---|
| 0 | continuous piecewise linear | value at each vertex | barycentric coordinates `λᵢ` |
| 1 | Nédélec (edge elements) | integral along each edge | `λᵢ ∇λⱼ − λⱼ ∇λᵢ` |
| 2 | Raviart–Thomas (face elements) | flux through each face | `2(λᵢ ∇λⱼ × ∇λₖ + cyclic)` |
| 3 | piecewise constant | integral over each cell | indicator of the cell |

They are the *Whitney forms*. Higher degrees `p` use the spaces `𝒫ᵣ⁻Λᵏ` with
`r = p + 1` (full Lagrange, Nédélec of the first kind, Raviart–Thomas of
higher order, discontinuous polynomials), with degrees of freedom that are
moments of the form against polynomials on each sub-simplex.

## What a good projection does

A projection `Π` from fields onto these spaces should

1. **be a projection**: `Πv = v` for `v` already in the space;
2. **commute** with the derivative: `d Π = Π d`, so that `Π` maps the chain
   above to the discrete chain;
3. **preserve the trace** on the boundary: the boundary degrees of freedom of
   `Πu` equal those of `u`, so boundary conditions and interface couplings are
   exact;
4. **be bounded**: the `L²` norm of `Πu` on a cell is controlled by the norm of
   `u` on a patch around it, with a constant that does not depend on the mesh
   size. This makes the projection usable for rough data and gives
   quasi-optimal error estimates.

The obvious projection takes the degrees of freedom of `u` directly: the value
at a vertex, the integral along an edge, the flux through a face. This is the
*canonical interpolation* (`Projector`, `CanonicalProjector`). It satisfies 1,
2 and 3 by Stokes' theorem. It fails 4: a point value is not defined for an `L²`
function and is unbounded near a singularity, so the operator is not stable.
The library reports this honestly: a field that is infinite at a vertex raises
`ProjectError` instead of returning `Infinity`.

## The bounded construction

The papers replace each degree of freedom by an integral of `u` against a
*weight function* `Z(σ)` supported on the star around the entity `σ`: the
coefficient of `σ` is `⟨Z(σ), u⟩`. An integral against an `L²` function is
bounded by the norm of `u` on the support, so the operator is local and stable
as soon as the weights are bounded.

The weights are built degree by degree so that commuting holds exactly. The
weight of an entity has a derivative that is the signed sum of the weights of
the entities on the boundary of that entity:

- the **divergence** of the weight of an edge is the signed sum of the weights
  of its two vertices;
- the **curl** of the weight of a face is the signed sum of the weights of its
  three edges;
- the **gradient** of the weight of a cell is minus the signed sum of the
  weights of its four faces.

The weight of a vertex is the starting point: a bump with integral one on its
star. Each higher weight is then obtained by solving two local problems on the
*extended star* of `σ` (the cells within a few rings of it, split by an Alfeld
split, which adds a vertex at the barycenter of each tetrahedron):

1. **the minimum-norm field `η`** with the required derivative (the sum of the
   lower weights) that vanishes on the part of the star's boundary in the
   interior of the domain. Among all fields with that derivative it has the
   smallest `L²` norm, which makes it unique and bounded;
2. **a potential `ψ`** correcting `η` so that the pairing `⟨Z(σ), u⟩` reproduces
   the canonical degree of freedom of `σ` for `u` in the discrete space, which
   is what makes `Π` a projection.

Both are small linear systems on the star. In the code they are sparse
symmetric systems solved by a banded Cholesky factorization with a
multiplier iteration (see [Performance](performance.md)); the weights are
computed the first time a coefficient needs them and cached.

`BoundedCommutingProjector` and `ZeroTraceProjector` are this construction
at the lowest order, with and without a boundary condition. `HigherOrderProjector`
is the same idea for any degree in the finite element spaces of Arnold and
Guzmán, whose degrees of freedom split a form into a lowest-order part and a
*bubble* correction supported inside each cell.

## The boundary

Weights that ignore the boundary can be bounded and commuting but cannot
preserve the trace. To preserve it, the papers split

```
Π = Π_∂ + Π̊ (I − Π_∂)
```

where `Π_∂` reproduces the boundary degrees of freedom and extends them into the
interior, and `Π̊` is the zero-trace operator above. `Π_∂ u` vanishes away from
the boundary, and `u − Π_∂ u` has zero boundary degrees of freedom, so `Π̊`
acts on it without touching the trace. That is why `Π` keeps the trace.

For `Π_∂` to be stable too, its boundary degrees of freedom must also be
weights, not point values. The paper builds them on the boundary surface
with the surface operators `grad_Γ`, `rot_Γ`, `div_Γ`, `curl_Γ` (eqs. 2.10 and
2.14), in a cascade over vertices, edges and faces of `∂Ω`:

```
ζ⁰ (vertices)  →  ζ¹ (edges)  →  ζ² (faces)
```

each constructed on the boundary trace spaces (`P₁`, the surface Whitney
1-forms `N₀`, the surface Raviart–Thomas `RT₀`) with the barycentric tent `μ`
(which is 1 at face barycenters and 0 on face boundaries) and a mass matrix on
the star. The weights are then extended into the domain through the
Worsey–Farin split, which adds a vertex at the barycenter of every face as
well as every cell. `TracePreservingProjector` implements this at the lowest
order. The canonical `Projector` computes the same weights only to cross-check
its degrees of freedom (`verifyBoundaryWeights`).

## What is proved, assumed and measured

- **Commuting** is proved by the papers for fields whose trace is a
  lowest-order trace. The statement for all fields does not follow from their
  proof: it applies the commuting property of `Π̊` to `u − Π_∂ u`, which has
  zero trace only when `tr u = tr Π_∂ u`. This repository tests it on the class
  where it is proved and measures the failure outside (about 5·10⁻³ on a
  4×4×4 cube). `BoundedCommutingProjector`, with no boundary part, commutes for
  every input. Details: [Validation](VALIDATION.md).
- **Assumption 2.4 of Arnold and Guzmán.** Their bound needs a constant for
  the right inverse of `d` on each extended star (a Bogovskii-type operator) to
  be uniform. They cannot prove it for stars that are not star-shaped with
  respect to a ball and assume it. Here the discrete form of the constant is
  *computed* for sampled stars of jittered meshes, meshes stretched 100:1 and
  `p = 1`: it stays between 0.002 and 0.36 and grows by about 3% from `n = 4` to
  `n = 8`. That is evidence, not a proof; it would show a degenerating family
  and does not prove none exists.
- **The star assumption of the construction** (that each extended star is a ball
  whose boundary is one connected patch on `∂Ω` and one inside) fails at radius
  one near the edges of a cube. The implementation grows the star until it holds;
  the weights remain exact but their supports are larger than one ring there.

## Glossary

| Term | Meaning |
|---|---|
| form degree `l` | 0 potential, 1 field, 2 flux, 3 density |
| exterior derivative `d` | `grad`, `curl`, `div` for `l = 0, 1, 2` |
| trace | the part of a field that lives on the boundary: values, tangential components, normal components |
| star of a vertex | the cells that contain it; the *extended star* adds neighbours |
| Alfeld split | each tetrahedron cut into 4 by joining its barycenter to its vertices |
| Worsey–Farin split | each tetrahedron cut into 12 by also using the barycenters of its faces |
| commuting | `d Π = Π d` |
| stable / bounded | `‖Πu‖` on a cell controlled by `‖u‖` on a patch, uniformly in `h` |
| canonical degrees of freedom | point values, edge integrals, face fluxes, cell integrals |

## References

- Ern, Guzmán, Potu, *Bounded, commuting, discrete-trace preserving
  projections*, [arXiv:2604.28103](https://arxiv.org/abs/2604.28103).
- Ern, Guzmán, Potu, Vohralík, *Local L²-bounded commuting projections using
  discrete local problems on Alfeld splits*,
  [arXiv:2502.03601](https://arxiv.org/abs/2502.03601).
- Arnold, Guzmán, *Local L²-bounded commuting projections in FEEC*,
  ESAIM: M2AN 55 (2021), [doi:10.1051/m2an/2021054](https://doi.org/10.1051/m2an/2021054).
- Arnold, Falk, Winther, *Finite element exterior calculus: from Hodge theory
  to numerical stability*, Bull. AMS 47 (2010).
