/**
 * The operators that take vertices and tetrahedra give the same answer,
 * bit for bit, whichever way each tetrahedron is oriented: they sort the
 * vertices of a cell, so a mesh from Gmsh or TetGen that mixes the two is
 * accepted and is not a source of error.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {
  HigherOrderProjector,
  Locator,
  StableProjector,
  TracePreservingProjector,
} from '../traceprojector/traceprojector.js';

const mesh = generateUnitCubeMesh(6);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();
const mixed = tetrahedra.map(
    (t, i) => (i % 2 ? [t[0], t[2], t[1], t[3]] : t));
const locator = new Locator(mesh);

const u = (p) => Math.sin(2 * p[0]) * Math.cos(p[1]) * Math.exp(p[2]);
const du = (p) => [
  2 * Math.cos(2 * p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
  -Math.sin(2 * p[0]) * Math.sin(p[1]) * Math.exp(p[2]),
  Math.sin(2 * p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
];
const inside = [0.43, 0.52, 0.37];
const near = [0.09, 0.5, 0.5];

describe('orientation does not change the result', function() {
  this.timeout(600000);

  it('StableProjector', () => {
    const cell = locator.findTetrahedron(inside).tIdx;
    expect(new StableProjector(vertices, mixed).project(u, inside, cell, 0))
        .to.equal(new StableProjector(vertices, tetrahedra)
            .project(u, inside, cell, 0));
  });

  it('HigherOrderProjector at degree 1', () => {
    const cell = locator.findTetrahedron(inside).tIdx;
    const make = (cells) => new HigherOrderProjector(vertices, cells,
        {degree: 1}).local(u, 0).value(inside, cell);
    expect(make(mixed)).to.equal(make(tetrahedra));
  });

  it('TracePreservingProjector at degree 1, next to the boundary', () => {
    const cell = locator.findTetrahedron(near).tIdx;
    const make = (cells) => new TracePreservingProjector(vertices, cells,
        {degree: 1}).local(u, du, 0).value(near, cell);
    expect(make(mixed)).to.equal(make(tetrahedra));
  });
});
