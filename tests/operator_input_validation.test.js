/**
 * Every operator that takes vertices and tetrahedra checks them on
 * construction and raises a ValidateError: a bad mesh is never accepted
 * silently or turned into an untyped TypeError later. Orientation is the one
 * thing they do not insist on, because they sort the vertices of each cell
 * and so give the same answer for either; meshes from Gmsh and TetGen often
 * mix the two. Mesh and Projector, which use the sign, still require it.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {
  BoundedCommutingProjector,
  CanonicalProjector,
  HigherOrderProjector,
  StableProjector,
  TracePreservingProjector,
  ValidateError,
  ZeroTraceProjector,
} from '../traceprojector/traceprojector.js';

const good = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]];

const bad = {
  'a NaN coordinate': [[[0, 0, 0], [1, 0, 0], [0, 1, 0], [NaN, 0, 1]],
    [[0, 1, 2, 3]]],
  'an infinite coordinate': [[[0, 0, 0], [1, 0, 0], [0, 1, 0],
    [0, 0, Infinity]], [[0, 1, 2, 3]]],
  'a repeated vertex': [good, [[0, 1, 1, 3]]],
  'a missing vertex': [good, [[0, 1, 2, 9]]],
  'a negative index': [good, [[0, 1, 2, -1]]],
  'a flat tetrahedron': [[[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
    [[0, 1, 2, 3]]],
  'no tetrahedra': [good, []],
  'no vertices': [[], [[0, 1, 2, 3]]],
};

const operators = {
  ZeroTraceProjector: (v, t) => new ZeroTraceProjector(v, t),
  BoundedCommutingProjector: (v, t) => new BoundedCommutingProjector(v, t),
  StableProjector: (v, t) => new StableProjector(v, t),
  CanonicalProjector: (v, t) => new CanonicalProjector(v, t),
  HigherOrderProjector: (v, t) => new HigherOrderProjector(v, t, {degree: 1}),
  TracePreservingProjector: (v, t) => new TracePreservingProjector(v, t),
};

describe('mesh validation by the operators', () => {
  for (const [name, make] of Object.entries(operators)) {
    describe(name, () => {
      for (const [what, [vertices, tetrahedra]] of Object.entries(bad)) {
        it(`raises ValidateError for ${what}`, () => {
          expect(() => make(vertices, tetrahedra)).to.throw(ValidateError);
        });
      }

      it('accepts a valid tetrahedron', () => {
        expect(() => make(good, [[0, 1, 2, 3]])).to.not.throw();
      });
    });
  }
});

describe('orientation of the tetrahedra', () => {
  const cube = generateUnitCubeMesh(3);
  const vertices = cube.getVertices();
  const tetrahedra = cube.getTetrahedra();
  // Every other tetrahedron with two vertices swapped.
  const mixed = tetrahedra.map(
      (t, i) => (i % 2 ? [t[0], t[2], t[1], t[3]] : t));
  const field = (p) => Math.sin(p[0]) * Math.cos(p[1]) + p[2] * p[2];

  it('is not required by the operators, which accept either', () => {
    for (const make of Object.values(operators)) {
      expect(() => make(vertices, mixed)).to.not.throw();
    }
  });

  it('does not change the coefficients of the bounded operators', () => {
    const a = new ZeroTraceProjector(vertices, tetrahedra);
    const b = new ZeroTraceProjector(vertices, mixed);
    for (const entity of [0, 5, 11, 20]) {
      expect(b.coefficient(field, 0, entity)).to.equal(
          a.coefficient(field, 0, entity));
    }
  });

  it('does not change the canonical degrees of freedom', () => {
    const a = new CanonicalProjector(vertices, tetrahedra, {degree: 1});
    const b = new CanonicalProjector(vertices, mixed, {degree: 1});
    const ca = a.coefficients(field, 0);
    const cb = b.coefficients(field, 0);
    expect(cb.length).to.equal(ca.length);
    for (let i = 0; i < ca.length; i++) expect(cb[i]).to.equal(ca[i]);
  });
});
