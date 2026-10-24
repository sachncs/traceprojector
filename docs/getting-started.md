# Getting started

traceprojector turns a function on a tetrahedral mesh into a finite element
function in a way that **commutes with differentiation** and, for the
operators that say so, **keeps the values on the boundary**. This page takes
you from nothing installed to a projected field, and tells you how to check
that the result is right.

You need Node.js 24 or newer (26 is recommended). No other software is
required; the package has no runtime dependencies.

## 1. Install

```bash
npm install traceprojector
```

The package is plain ES modules with TypeScript declarations. In a browser you
can load the UMD bundle instead:

```html
<script src="https://cdn.jsdelivr.net/npm/traceprojector/dist/traceprojector.umd.js"></script>
<script>
  const { StableProjector } = window.TraceProjector;
</script>
```

## 2. Get a mesh

A mesh is two arrays: the vertex coordinates, and for every tetrahedron the
four vertex numbers (counting from 0).

```javascript
import { generateUnitCubeMesh } from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(4); // 4 x 4 x 4 cubes, 384 tetrahedra
const vertices = mesh.getVertices(); // [[x, y, z], ...]
const tetrahedra = mesh.getTetrahedra(); // [[a, b, c, d], ...]
```

To use your own mesh (from Gmsh, TetGen or anything else), build the same two
arrays and pass them in. The library checks them when you construct a
projector and raises a `ValidateError` naming the offending tetrahedron if:

| Problem | What to do |
|---|---|
| a coordinate is `NaN` or infinite | repair the mesh generator's output |
| a tetrahedron repeats a vertex, or names a vertex that does not exist | check the index base (it must start at 0) |
| a tetrahedron has zero or **negative** volume | swap two of its vertex numbers to flip its orientation |
| the mesh is not conforming (hanging nodes, overlapping cells) | neighbouring tetrahedra must share whole faces |

Very flat slivers are accepted but cost accuracy; see [Limits](limits.md).

## 3. Project a field

Every operator takes the field as a plain function of a point. Scalars
(0-forms and 3-forms) return a number; vectors (1-forms and 2-forms) return
`[x, y, z]`. To evaluate the result you also need to know which tetrahedron
contains the point, which `Locator` finds.

```javascript
import { Locator, StableProjector } from 'traceprojector';
import { generateUnitCubeMesh } from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(3);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();
const projector = new StableProjector(vertices, tetrahedra);
const locator = new Locator(mesh);

// u(x, y, z) = sin(x) cos(y) exp(z)
const u = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]);

const point = [0.3, 0.3, 0.3];
const { tIdx } = locator.findTetrahedron(point);

const l = 0; // form degree: 0 = scalar, 1 = edge field, 2 = face field, 3 = density
console.log(projector.project(u, point, tIdx, l)); // 0.3875...
console.log(u(point)); // 0.3811...
```

The two numbers differ by the interpolation error of a coarse mesh (3 cubes
per side). Refine the mesh and the gap closes at the rate described in
[Validation](VALIDATION.md).

### The four form degrees

The form degree `l` says what kind of field you are projecting. It decides
which finite element space the answer lives in and which derivative commutes
with the projection.

| `l` | Field | Input `u(p)` returns | Finite element space | Commutes with |
|---:|---|---|---|---|
| 0 | potential, temperature | a number | continuous piecewise linear (values at vertices) | `grad` |
| 1 | electric field, circulation | `[x, y, z]` | Nédélec (integrals along edges) | `curl` |
| 2 | flux, magnetic induction | `[x, y, z]` | Raviart–Thomas (fluxes through faces) | `div` |
| 3 | density | a number | piecewise constant (integral per cell) | none |

Commuting means that projecting and then differentiating gives the same
answer as differentiating and then projecting: `grad(Π⁰u) = Π¹(grad u)`,
`curl(Π¹u) = Π²(curl u)`, `div(Π²u) = Π³(div u)`. This is what keeps discrete
physics (conservation laws, curl-free fields, divergence-free fields)
intact.

## 4. Check that it works

**It reproduces what it should.** A projection leaves functions of its own
space unchanged, so projecting a linear function must return it to roundoff:

```javascript
// continued
const linear = (p) => 2 * p[0] - p[1] + 0.5 * p[2] + 1;
const q = [0.41, 0.27, 0.19];
const { tIdx: cell } = locator.findTetrahedron(q);
console.log(Math.abs(projector.project(linear, q, cell, 0) - linear(q)));
// about 1e-14
```

**It commutes.** Every operator has a test that compares both sides of the
identity on your kind of mesh; the quickest independent check is to run the
validation suite, `npm run validate` (about ten minutes), which reports pass or
fail for each claim of the papers. [Validation](VALIDATION.md) says what each
test establishes and under which assumptions.

## 5. Choose an operator

The library has several projectors because the papers it implements trade
properties against each other: some are cheap and need smooth input, some
accept rough input but cost much more, and not all of them preserve boundary
values. [Choosing an operator](operators.md) has the decision table. The short
version:

- **Smooth data, speed matters** → `Projector` or `CanonicalProjector`.
- **Rough data, or data unbounded at interior points, with commuting** →
  `BoundedCommutingProjector` (does not keep boundary values) or
  `StableProjector` (keeps boundary values; needs finite boundary values).
- **Degree above the lowest** → `CanonicalProjector` (any degree) or
  `HigherOrderProjector` (any degree, locally bounded).

## 6. Higher degree

Pass `degree` to move from the lowest-order spaces (`degree: 0`) to richer
ones:

```javascript
// continued
import { CanonicalProjector } from 'traceprojector';

const p2 = new CanonicalProjector(vertices, tetrahedra, { degree: 1 });
const coefficients = p2.coefficients(u, 0); // one number per degree of freedom
const value = p2.evaluate(coefficients, point, tIdx, 0);
const gradient = p2.derivative(coefficients, point, tIdx, 0);
```

## 7. When something goes wrong

All errors are instances of three classes: `ValidateError` (bad input),
`ProjectError` (a call that cannot be answered, for instance a point outside
the mesh or a field that returns `NaN`) and `SingularError` (a local problem
has no solution, usually because of a degenerate element). See
[Errors and warnings](exceptions.md) for every message and what to do about it.

If a projection is slow, read [Performance](performance.md) first: the bounded
operators solve local problems around every entity, and their cost grows with
the size of those neighbourhoods.

## Where next

- [Choosing an operator](operators.md): what each class guarantees.
- [API reference](api.md): every export.
- [Mathematical background](math.md): the construction, in words.
- [Validation](VALIDATION.md): which claims of the papers hold, with the
  numbers, and the ones that do not.
- [Developer guide](developer-guide.md): to change the library.
