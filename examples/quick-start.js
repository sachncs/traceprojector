// Quick start: project a smooth function onto the lowest-order finite element
// space and compare it with the function.
import {Locator, StableProjector} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

// A mesh is two arrays: vertex coordinates, and four vertex numbers per
// tetrahedron. generateUnitCubeMesh builds one for the unit cube.
const mesh = generateUnitCubeMesh(3);
const projector = new StableProjector(mesh.getVertices(), mesh.getTetrahedra());

// Any function of a point will do: here u(x, y, z) = sin(x) cos(y) exp(z).
const u = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]);

// The projection is evaluated inside a tetrahedron, so find the one that
// contains the point first.
const point = [0.3, 0.3, 0.3];
const {tIdx} = new Locator(mesh).findTetrahedron(point);

const form = 0; // 0 = a potential: a number at every point.
console.log('u at the point         ', u(point).toFixed(4));
console.log('projection at the point', projector.project(u, point, tIdx, form)
    .toFixed(4));
