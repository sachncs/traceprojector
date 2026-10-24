/**
 * The trace-preserving projection above the lowest order (Ern, Guzman and
 * Potu, Theorem 3.1) at p = 1 on the 6 x 6 x 6 cube:
 *
 *   Pi u = Pi_boundary u + zero_trace_pi (u - Pi_boundary u)
 *
 * is a projection onto the degree-2 spaces and commutes with the exterior
 * derivative for the fields whose trace is a discrete trace (V_tr,p), which is
 * the class the proof covers. The trace itself is checked on the boundary
 * operator in validation/high-order-boundary.test.js.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {
  TracePreservingProjector,
} from '../../traceprojector/trace-preserving-projector.js';

const cube = generateUnitCubeMesh(6);
const vertices = cube.getVertices();
const tetrahedra = cube.getTetrahedra();
const projector = new TracePreservingProjector(
    vertices, tetrahedra, {degree: 1});
const complex = projector.complex;
// The quadrature of the weights and extensions is exact for polynomials up to
// a degree; the commuting test fields reach degree 6 (and the scalar one is not
// a polynomial), so it uses a higher order.
const accurate = new TracePreservingProjector(
    vertices, tetrahedra, {degree: 1, quadratureOrder: 8});

/** The cell whose centroid is nearest to a point, and a point inside it. */
function cellAt(target) {
  let best = 0;
  let distance = Infinity;
  complex.cells.forEach((_, c) => {
    const {points} = complex.geometry(c);
    const mid = [0, 1, 2].map((d) => points.reduce((s, p) => s + p[d], 0) / 4);
    const dd = Math.hypot(mid[0] - target[0], mid[1] - target[1],
        mid[2] - target[2]);
    if (dd < distance) {
      distance = dd;
      best = c;
    }
  });
  const {points} = complex.geometry(best);
  const x = [0, 1, 2].map((d) => 0.1 * points[0][d] + 0.2 * points[1][d] +
    0.3 * points[2][d] + 0.4 * points[3][d]);
  return {cell: best, x};
}
const places = [
  ['near the boundary', cellAt([0.1, 0.5, 0.5])],
  ['in the interior', cellAt([0.5, 0.5, 0.5])],
];

const bubble = (x) => 64 * x[0] * (1 - x[0]) * x[1] * (1 - x[1]) *
  x[2] * (1 - x[2]);
const gradBubble = (x) => [
  64 * (1 - 2 * x[0]) * x[1] * (1 - x[1]) * x[2] * (1 - x[2]),
  64 * x[0] * (1 - x[0]) * (1 - 2 * x[1]) * x[2] * (1 - x[2]),
  64 * x[0] * (1 - x[0]) * x[1] * (1 - x[1]) * (1 - 2 * x[2]),
];
const crossWith = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
const norm = (v) => (typeof v === 'number' ? Math.abs(v) :
  Math.max(...v.map(Math.abs)));
const minus = (a, b) => (typeof a === 'number' ? a - b :
  a.map((q, i) => q - b[i]));

// Fields of the degree-2 spaces: quadratic scalars, affine vectors.
const spaceFields = {
  0: [(x) => x[0] * x[0] - 0.5 * x[1] * x[2] + x[2],
    (x) => [2 * x[0], -0.5 * x[2], -0.5 * x[1] + 1]],
  1: [(x) => [x[1] + 0.3 * x[2], x[2] - x[0], 0.5 * x[0] + x[1] + 1],
    () => [0, -0.2, -2]],
  2: [(x) => [x[0] + 0.2 * x[1], x[1] - x[2] + 1, x[2] + 0.5 * x[0]],
    () => 3],
  3: [(x) => x[0] - 0.5 * x[1] + 0.25, null],
};

describe('the trace-preserving projection above the lowest order (p = 1)',
    function() {
      this.timeout(7200000);

      for (const l of [0, 1, 2, 3]) {
        for (const [name, {cell, x}] of places) {
          it(`l = ${l} is a projection: Pi u = u for u in the space, ${name}`,
              () => {
                const [u, du] = spaceFields[l];
                const got = projector.local(u, du, l).value(x, cell);
                const error = norm(minus(got, u(x)));
                console.log(
                    `      l = ${l}, ${name}: ${error.toExponential(1)}`);
                expect(error).to.be.below(1e-8);
              });
        }
      }

      // u = v + (zero-trace bubble part): its trace is the trace of v.
      const traceFields = {
        0: (() => {
          const [v, dv] = spaceFields[0];
          const g = (x) => Math.sin(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[1];
          const dg = (x) => [
            Math.cos(x[0] + 0.5 * x[1]) * Math.cos(x[2]),
            0.5 * Math.cos(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + 1,
            -Math.sin(x[0] + 0.5 * x[1]) * Math.sin(x[2])];
          return [
            (x) => v(x) + bubble(x) * g(x),
            (x) => {
              const a = gradBubble(x);
              const b = dg(x);
              const c = dv(x);
              return c.map((q, i) => q + a[i] * g(x) + bubble(x) * b[i]);
            }];
        })(),
        1: (() => {
          const [v, dv] = spaceFields[1];
          const w = [1, -2, 3];
          return [
            (x) => v(x).map((q, i) => q + bubble(x) * w[i]),
            (x) => {
              const c = dv(x);
              const e = crossWith(gradBubble(x), w);
              return c.map((q, i) => q + e[i]);
            }];
        })(),
        2: (() => {
          const [v, dv] = spaceFields[2];
          const w = [1, -2, 3];
          return [
            (x) => v(x).map((q, i) => q + bubble(x) * w[i]),
            (x) => dv(x) + gradBubble(x).reduce((s, q, i) => s + q * w[i], 0)];
        })(),
      };

      for (const [l, name] of [[0, 'grad'], [1, 'curl'], [2, 'div']]) {
        for (const [place, {cell, x}] of places) {
          it(`${name} commutes for a field with a discrete trace, ${place}`,
              () => {
                const [u, du] = traceFields[l];
                const left = accurate.local(u, du, l).derivative(x, cell);
                const second = l === 0 ? () => [0, 0, 0] :
                  l === 1 ? () => 0 : null;
                const right = accurate.local(du, second, l + 1).value(x, cell);
                const error = norm(minus(left, right));
                console.log(
                    `      ${name}, ${place}: ${error.toExponential(1)}`);
                expect(error).to.be.below(1e-8);
              });
        }
      }
    });
