/**
 * Criterion A7: metamorphic properties. Each states a relation between two
 * computations that must hold whatever the correct answer is, so wrong code
 * rarely satisfies all of them by accident. `fast-check` shrinks failures.
 */
import fc from 'fast-check';
import {expect} from 'chai';
import {Mesh, Whitney, Projector} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {shapeRegularity} from './support/mesh-quality.js';
import {seededRandom} from './support/random.js';
import {tolerances} from './support/tolerances.js';
import {
  randomPolynomial,
  randomVectorPolynomial,
} from './support/polynomial.js';

const RUNS = tolerances.metamorphic.runsPerProperty;

/** A perturbed cube mesh, the same for all properties. */
function baseMesh() {
  const cube = generateUnitCubeMesh(2);
  const random = seededRandom(5);
  const vertices = cube
      .getVertices()
      .map((v) =>
        v.map((q) => (q > 0 && q < 1 ? q + (0.1 * (random() - 0.5)) / 2 : q)),
      );
  return {vertices, tetrahedra: cube.getTetrahedra().map((t) => [...t])};
}

const base = baseMesh();
const rho = shapeRegularity(base.vertices, base.tetrahedra);
const tolerance = (scale) =>
  tolerances.identity.c *
  tolerances.identity.nOps *
  tolerances.machineEpsilon *
  rho *
  Math.max(1, scale);

const projectorFor = (vertices, tetrahedra) => {
  const mesh = new Mesh(vertices, tetrahedra);
  return new Projector(mesh, new Whitney(mesh), {onWarning: () => {}});
};

/** A random field of form degree l from a seed: scalar for l = 0, 3; vector for
 * l = 1, 2. */
function fieldFrom(l, seed) {
  const random = seededRandom(seed);
  if (l === 0 || l === 3) {
    const p = randomPolynomial(random, 2);
    return (x) => p.evaluate(x);
  }
  const A = randomVectorPolynomial(random, 2);
  return (x) => A.map((p) => p.evaluate(x));
}

const project = (projector, u, point, tIdx, l) => {
  switch (l) {
    case 0:
      return projector.projectH1(u, point, tIdx);
    case 1:
      return projector.projectHcurl(u, point, tIdx);
    case 2:
      return projector.projectHdiv(u, point, tIdx);
    default:
      return projector.projectL2(u, tIdx);
  }
};

const sizeOf = (value) =>
  [].concat(value).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const subtract = (a, b) =>
  typeof a === 'number' ? [a - b] : a.map((v, k) => v - b[k]);
const barycenter = (vertices, tet, weights) =>
  [0, 1, 2].map((k) =>
    tet.reduce((s, v, i) => s + weights[i] * vertices[v][k], 0),
  );

const at = (t, w) => barycenter(base.vertices, base.tetrahedra[t], w);
const seedArb = fc.integer({min: 1, max: 1e6});
const tetArb = fc.integer({min: 0, max: base.tetrahedra.length - 1});
const weightsArb = fc
    .tuple(
        fc.double({min: 0.1, max: 1, noNaN: true}),
        fc.double({min: 0.1, max: 1, noNaN: true}),
        fc.double({min: 0.1, max: 1, noNaN: true}),
        fc.double({min: 0.1, max: 1, noNaN: true}),
    )
    .map((w) => {
      const s = w[0] + w[1] + w[2] + w[3];
      return w.map((x) => x / s);
    });

/** A random rotation matrix from a unit quaternion. */
function rotation(a, b, c, d) {
  const length = Math.hypot(a, b, c, d);
  // Near-zero quaternions cannot be normalised reliably; use the identity.
  const [w, x, y, z] =
    length > 1e-6 ?
      [a / length, b / length, c / length, d / length] :
      [1, 0, 0, 0];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
const apply = (R, v) =>
  R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const transposeApply = (R, v) =>
  [0, 1, 2].map((j) => R[0][j] * v[0] + R[1][j] * v[1] + R[2][j] * v[2]);

describe('Metamorphic properties of the canonical projection', function() {
  this.timeout(1800000);
  const reference = projectorFor(base.vertices, base.tetrahedra);

  for (const l of [0, 1, 2, 3]) {
    describe(`form degree ${l}`, () => {
      it('is linear: Pi(a u + b w) = a Pi u + b Pi w', () => {
        fc.assert(
            fc.property(
                seedArb,
                seedArb,
                fc.double({min: -5, max: 5, noNaN: true}),
                fc.double({min: -5, max: 5, noNaN: true}),
                tetArb,
                weightsArb,
                (s1, s2, a, b, t, w) => {
                  const u = fieldFrom(l, s1);
                  const v = fieldFrom(l, s2);
                  const combined = (x) =>
                l === 0 || l === 3 ?
                  a * u(x) + b * v(x) :
                  u(x).map((q, k) => a * q + b * v(x)[k]);
                  const point = at(t, w);
                  const lhs = project(reference, combined, point, t, l);
                  const pu = project(reference, u, point, t, l);
                  const pv = project(reference, v, point, t, l);
                  const rhs =
                l === 0 || l === 3 ?
                  a * pu + b * pv :
                  pu.map((q, k) => a * q + b * pv[k]);
                  const scale =
                Math.max(sizeOf(lhs), sizeOf(pu), sizeOf(pv)) *
                (1 + Math.abs(a) + Math.abs(b));
                  expect(
                      Math.max(...subtract(lhs, rhs).map(Math.abs)),
                  ).to.be.at.most(tolerance(scale));
                },
            ),
            {numRuns: RUNS, seed: 42},
        );
      });

      it('does not depend on how vertices and cells are numbered', () => {
        fc.assert(
            fc.property(
                seedArb,
                fc.infiniteStream(fc.nat()),
                tetArb,
                weightsArb,
                (seed, stream, t, w) => {
                  const random = seededRandom(seed);
                  const shuffle = (n) => {
                    const order = Array.from({length: n}, (_, i) => i);
                    for (let i = n - 1; i > 0; i--) {
                      const j = Math.floor(random() * (i + 1));
                      [order[i], order[j]] = [order[j], order[i]];
                    }
                    return order;
                  };
                  void stream;
                  const vertexMap = shuffle(base.vertices.length);
                  const cellMap = shuffle(base.tetrahedra.length);
                  const vertices = [];
                  base.vertices.forEach((v, i) => {
                    vertices[vertexMap[i]] = v;
                  });
                  const tetrahedra = [];
                  base.tetrahedra.forEach((tet, i) => {
                    // An even permutation of the vertex order keeps the cell
                    // positively oriented.
                    const order = shuffle(4);
                    const inversions = order.reduce(
                        (n, a, i2) =>
                          n + order.slice(i2 + 1).filter((b) => b < a).length,
                        0,
                    );
                    if (inversions % 2 === 1) {
                      [order[0], order[1]] = [order[1], order[0]];
                    }
                    tetrahedra[cellMap[i]] = order.map(
                        (k) => vertexMap[tet[k]],
                    );
                  });
                  const permuted = projectorFor(vertices, tetrahedra);
                  const u = fieldFrom(l, seed);
                  const point = at(t, w);
                  const lhs = project(reference, u, point, t, l);
                  const rhs = project(permuted, u, point, cellMap[t], l);
                  expect(
                      Math.max(...subtract(lhs, rhs).map(Math.abs)),
                  ).to.be.at.most(tolerance(sizeOf(lhs)));
                },
            ),
            {numRuns: RUNS, seed: 43},
        );
      });

      it('commutes with rigid motions', () => {
        fc.assert(
            fc.property(
                seedArb,
                fc.tuple(
                    fc.double({min: -1, max: 1, noNaN: true}),
                    fc.double({min: -1, max: 1, noNaN: true}),
                    fc.double({min: -1, max: 1, noNaN: true}),
                    fc.double({min: -1, max: 1, noNaN: true}),
                ),
                fc.tuple(
                    fc.double({min: -3, max: 3, noNaN: true}),
                    fc.double({min: -3, max: 3, noNaN: true}),
                    fc.double({min: -3, max: 3, noNaN: true}),
                ),
                tetArb,
                weightsArb,
                (seed, q, shift, t, w) => {
                  const R = rotation(...q);
                  const moved = base.vertices.map((v) =>
                    apply(R, v).map((c, k) => c + shift[k]),
                  );
                  const projector = projectorFor(moved, base.tetrahedra);
                  const u = fieldFrom(l, seed);
                  const vectorField = l === 1 || l === 2;
                  // The field expressed in the moved coordinates: (R u)(R x +
                  // shift), so that the pullback is u.
                  const uMoved = (y) => {
                    const x = transposeApply(
                        R,
                        y.map((c, k) => c - shift[k]),
                    );
                    const value = u(x);
                    return vectorField ? apply(R, value) : value;
                  };
                  const point = at(t, w);
                  const lhs = project(reference, u, point, t, l);
                  const rhsRaw = project(
                      projector,
                      uMoved,
                      apply(R, point).map((c, k) => c + shift[k]),
                      t,
                      l,
                  );
                  const rhs = vectorField ? transposeApply(R, rhsRaw) : rhsRaw;
                  expect(
                      Math.max(...subtract(lhs, rhs).map(Math.abs)),
                  ).to.be.at.most(tolerance(sizeOf(lhs) * 10));
                },
            ),
            {numRuns: RUNS, seed: 44},
        );
      });

      it('commutes with uniform scaling (with the pullback of the field)', () => {
        fc.assert(
            fc.property(
                seedArb,
                fc.double({min: -3, max: 3, noNaN: true}),
                tetArb,
                weightsArb,
                (seed, logScale, t, w) => {
                  const s = 10 ** logScale;
                  const scaled = projectorFor(
                      base.vertices.map((v) => v.map((c) => c * s)),
                      base.tetrahedra,
                  );
                  const u = fieldFrom(l, seed);
                  // The pullback of an l-form under x -> s x.
                  const factor = s ** -l;
                  const uScaled = (y) => {
                    const value = u(y.map((c) => c / s));
                    return typeof value === 'number' ?
                  value * factor :
                  value.map((c) => c * factor);
                  };
                  const point = at(t, w);
                  const lhs = project(reference, u, point, t, l);
                  const rhs = project(
                      scaled,
                      uScaled,
                      point.map((c) => c * s),
                      t,
                      l,
                  );
                  const back =
                typeof rhs === 'number' ?
                  rhs / factor :
                  rhs.map((c) => c / factor);
                  expect(
                      Math.max(...subtract(lhs, back).map(Math.abs)),
                  ).to.be.at.most(tolerance(sizeOf(lhs) * 10));
                },
            ),
            {numRuns: RUNS, seed: 45},
        );
      });

      it('is idempotent: Pi(Pi u) = Pi u', () => {
        // The default order-3 tetrahedron rule has points on the element faces
        // and a
        // negative weight, so a field that jumps across faces (the degree-3
        // output) is
        // evaluated at ambiguous points. The interior order-2 rule has neither.
        const idempotentProjector =
          l === 3 ?
            (() => {
              const m = new Mesh(base.vertices, base.tetrahedra);
              return new Projector(m, new Whitney(m), {
                onWarning: () => {},
                quadratureOrder: 2,
              });
            })() :
            reference;
        const reference2 = idempotentProjector;
        reference2.buildLocator();
        fc.assert(
            fc.property(seedArb, tetArb, weightsArb, (seed, t, w) => {
              const u = fieldFrom(l, seed);
              const projected = (x) => {
                const found = reference2.locator.findTetrahedron(x);
                return project(reference2, u, x, found.tIdx, l);
              };
              const point = at(t, w);
              const found = reference2.locator.findTetrahedron(point);
              const once = project(reference2, u, point, found.tIdx, l);
              const twice = project(
                  reference2, projected, point, found.tIdx, l);
              expect(
                  Math.max(...subtract(once, twice).map(Math.abs)),
              ).to.be.at.most(tolerance(sizeOf(once) * 10));
            }),
            {numRuns: RUNS, seed: 46},
        );
      });
    });
  }
});
