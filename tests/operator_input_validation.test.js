/**
 * Every operator that takes vertices and tetrahedra checks them on
 * construction and raises a ValidateError, the same as Mesh: a bad mesh is
 * never accepted silently or turned into an untyped TypeError later.
 */
import {expect} from 'chai';
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
  'a flipped tetrahedron': [good, [[0, 2, 1, 3]]],
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
