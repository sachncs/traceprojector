# Choosing an operator

Seven classes project a field onto finite element forms. They differ in what
they guarantee, what input they accept and what they cost. Every statement
below is one that the [validation suite](VALIDATION.md) checks, with the
evidence named there; where something does not hold, that is said here too.

## The short answer

| You have | Use |
|---|---|
| a smooth field and want speed | [`Projector`](#projector) |
| a smooth field and a degree above the lowest | [`CanonicalProjector`](#canonicalprojector) |
| a field that may be rough or unbounded inside the domain, and you need commuting everywhere | [`BoundedCommutingProjector`](#boundedcommutingprojector) |
| the same, and the boundary values must be kept exactly | [`StableProjector`](#stableprojector) (finite boundary values) |
| any degree, bounded, commuting for every `L²` field | [`HigherOrderProjector`](#higherorderprojector) |
| the paper's full operator at the lowest order | [`TracePreservingProjector`](#tracepreservingprojector) |

## At a glance

"Commutes" means `d Π u = Π d u`. "Keeps traces" means the degrees of freedom
on the boundary of `Π u` equal those of `u`. "Bounded" means the `L²` norm of
`Π u` on a cell is bounded by the norm of `u` on the cells around it, with a
constant that does not depend on the mesh size.

| Class | Degree | Commutes | Keeps traces | Bounded | Input must be | Cost |
|---|---|---|---|---|---|---|
| `Projector` | 0 | yes (smooth input) | yes | **no** | smooth: point values, edge integrals and face fluxes exist | under a second for 10⁴ cells |
| `CanonicalProjector` | any | yes (smooth input) | yes | **no** | smooth, as above | fast |
| `ZeroTraceProjector` | 0 | yes | zero trace only | yes (interior) | `L²` | local solves per entity |
| `StableProjector` | 0 | on its class | yes | interior yes, boundary no | finite boundary values | local solves per entity |
| `BoundedCommutingProjector` | 0 | **yes, for every input** | **no** | yes | `L²` | local solves per entity |
| `TracePreservingProjector` | any | on its class | yes | yes at the boundary (measured at `p = 0`) | `L²` with `L²` derivative | local solves per point |
| `HigherOrderProjector` | any | **yes, for every input** | **no** | yes (measured) | `L²` with `L²` derivative | local solves per entity, larger |

"On its class" means: commuting is proved and tested for fields whose boundary
trace is a lowest-order trace, and measured to fail by about 5·10⁻³ on a
4×4×4 mesh for other fields. The papers' statement is wider than its proof;
the reason is explained in [Validation](VALIDATION.md#commuting-k3-the-papers-statement-is-wider-than-its-proof).

## Projector

The canonical lowest-order projection: the coefficient of each vertex, edge
and face is the point value, the edge integral or the face flux of the input,
taken directly. It is a projection, keeps boundary traces and commutes
(Stokes' theorem makes this exact). It is not bounded: a field that is
unbounded at a vertex has no point value there, and `Projector` raises
`ProjectError` instead of returning `Infinity`. Use it when your data are
smooth and you want the cheapest operator. It also provides `projectAtPoint`,
`sampler` (project many fields at fixed points) and `refine`.

## CanonicalProjector

The same idea in any polynomial degree (`degree: p` gives Lagrange, Nédélec,
Raviart–Thomas and discontinuous spaces of order `p + 1`). Checked for `p = 0,
1, 2` in all four form degrees: it is a projection, the traces are conforming,
it commutes with the exterior derivative, and it converges at the expected
orders. Like `Projector` it is not bounded and needs regular input.

## ZeroTraceProjector

The interior building block of the papers: a projection onto the forms with
zero trace, locally `L²`-bounded and commuting, computed from weight functions
instead of point values, so it is finite for rough input. By itself it is
useful for problems with homogeneous boundary conditions. `StableProjector`
and `TracePreservingProjector` are built on it.

## StableProjector

`Π u = Π_∂ u + Π̊ (u − Π_∂ u)` with a canonical boundary part. The interior is
stable for rough input (a field like `|x − c|^(−0.4)`, unbounded at an
interior vertex, is projected with a finite result); the boundary part uses
point values and fluxes, so the boundary data must be finite. Commuting holds
to roundoff on its class.

## BoundedCommutingProjector

The operator of Theorem 5.1 of Ern, Guzmán, Potu and Vohralík with no boundary
condition: a weight for every entity, boundary included. It is the only
lowest-order operator here that is both bounded **and** commuting for every
`L²` input with an `L²` derivative. It does not keep boundary traces. Choose
it when you need commuting and stability and can live without exact boundary
values (for instance when the boundary condition is imposed afterwards).

## TracePreservingProjector

The full operator of the trace-preserving paper,
`Π = mΠ (I − Π_∂) + Π_∂`, where `Π_∂` is built from the paper's boundary
weights on Worsey–Farin splits of the boundary and `mΠ` is the zero-trace
bounded projection. It reproduces the spaces, keeps the discrete trace on the
boundary and commutes with the exterior derivative for fields whose trace is a
discrete trace. You supply the derivative of your field as well as the field:
the gradient for a 0-form, the curl for a 1-form, the divergence for a 2-form.

At `degree: 0` (the default) it has coefficients on the Whitney forms and, at
the boundary, is stable (ratio about 1.01 for 0-forms and 1.006 for 1-forms,
flat under refinement). With `degree: p` for `p ≥ 1` it works field by field:
`projector.local(u, du, l)` gives the value and the derivative of the
projection at a point of a cell, computed lazily from the weights near that
cell. Validated at `p = 1` for all four form degrees (a projection to
5·10⁻¹³; commuting for fields with a discrete trace to 10⁻¹¹ at quadrature
order 8) and at `p = 2` for 0-forms. Its stability constant above the lowest
order has not been measured.

## HigherOrderProjector

The locally `L²`-bounded commuting projection of Arnold and Guzmán for any
degree `p`. It reproduces its own space, commutes with `d` for every `L²`
field with an `L²` derivative (measured to 3·10⁻¹² for 0→1, 1→2 and 2→3 at
`p = 1`), and its norm on narrow bumps did not grow under refinement (ratio
between 0.995 and 1.007 at `p = 1` for all four form degrees). With
`boundaryConditions: true` it is the zero-trace version. It does not keep
boundary traces. It needs a mesh fine enough that the extended stars are
topological balls; on a coarse mesh near the boundary the stars grow and the
local problems become very large (see [Performance](performance.md)).

## What to do about boundary values

If the boundary values of your field must be reproduced exactly and your field
is smooth, use `Projector` or `CanonicalProjector`. If you need both exact
boundary values and stability for rough interior data, use `StableProjector`
(finite boundary values, lowest order) or `TracePreservingProjector` (any
degree). If you need a degree above the lowest, stability and commuting
without preserving the boundary trace, `HigherOrderProjector` is the cheaper
choice. See [Limits](limits.md) for what is validated at each degree.
