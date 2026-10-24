// Higher polynomial degree. Three operators, in order of cost:
//  - CanonicalProjector: any degree, cheap, for smooth input;
//  - HigherOrderProjector: any degree, locally bounded, commuting for every
//    L2 input, a local solve per entity;
//  - TracePreservingProjector({degree}): the same with exact boundary traces,
//    the dearest, and evaluated field by field.
// Lines that start with "~" report time and are not part of the checked output.
import {
  CanonicalProjector, HigherOrderProjector, Locator, TracePreservingProjector,
} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(6);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();
const locator = new Locator(mesh);

const u = (p) => Math.sin(2 * p[0]) * Math.cos(p[1]) * Math.exp(p[2]);
const gradU = (p) => [
  2 * Math.cos(2 * p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
  -Math.sin(2 * p[0]) * Math.sin(p[1]) * Math.exp(p[2]),
  Math.sin(2 * p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
];
const inside = [0.43, 0.52, 0.37];
const {tIdx} = locator.findTetrahedron(inside);

// 1. Raising the degree shrinks the error fast for a smooth u.
for (const degree of [0, 1, 2]) {
  const projector = new CanonicalProjector(vertices, tetrahedra, {degree});
  const error = Math.abs(projector.project(u, inside, tIdx, 0) - u(inside));
  console.log('canonical, degree', degree, ' error', error.toExponential(1));
}

const timed = (label, run) => {
  const start = performance.now();
  const value = run();
  console.log('~', label, ((performance.now() - start) / 1000).toFixed(1), 's');
  return value;
};

// 2. The locally bounded operator at degree 1: only the coefficients that
//    this cell needs are computed.
const high = new HigherOrderProjector(vertices, tetrahedra, {degree: 1});
const bounded = timed('higher order, one cell:', () =>
  high.local(u, 0).value(inside, tIdx));
console.log('higher order, degree 1 ', ' error',
    Math.abs(bounded - u(inside)).toExponential(1));

// 3. With exact boundary traces, next to a face of the cube. Each point near
//    the boundary costs seconds to tens of seconds at degree 1.
const near = [0.09, 0.5, 0.5];
const nearCell = locator.findTetrahedron(near).tIdx;
const traced = new TracePreservingProjector(vertices, tetrahedra,
    {degree: 1, quadratureOrder: 6});
const value = timed('trace preserving, one point:', () =>
  traced.local(u, gradU, 0).value(near, nearCell));
console.log('trace preserving, degree 1', ' error',
    Math.abs(value - u(near)).toExponential(1));
