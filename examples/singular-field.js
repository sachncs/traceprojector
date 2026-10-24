// A field that is infinite at a mesh vertex. Point values do not exist for
// it, so the canonical interpolation fails; the bounded operators integrate
// against a weight instead and stay finite and stable. This is what the
// bounded operators are for.
import {
  CanonicalProjector, Locator, ProjectError, StableProjector,
} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(4);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();

// u = 1 / sqrt(distance to the centre): in L2, but infinite at the centre,
// which is a vertex of this mesh.
const centre = [0.5, 0.5, 0.5];
const u = (p) => 1 / Math.sqrt(Math.hypot(p[0] - centre[0], p[1] - centre[1],
    p[2] - centre[2]));
const centreVertex = vertices.findIndex(
    (v) => v.every((q, i) => q === centre[i]));

// The canonical interpolation reads u at the vertex, finds Infinity, and
// refuses rather than return a number that means nothing.
try {
  new CanonicalProjector(vertices, tetrahedra).coefficients(u, 0);
} catch (error) {
  console.log('canonical:', error instanceof ProjectError ?
    'ProjectError, ' + error.message : error);
}

// The stable operator gives every coefficient a finite value, including the
// one at the singular vertex.
const stable = new StableProjector(vertices, tetrahedra);
console.log('stable coefficient at the singular vertex:',
    stable.coefficient(u, 0, centreVertex).toFixed(3));

// And its values near the singularity are of the size of the data there, not
// blown up: compare with u itself away from the centre.
const locator = new Locator(mesh);
for (const point of [[0.4, 0.45, 0.5], [0.3, 0.3, 0.3], [0.8, 0.7, 0.6]]) {
  const {tIdx} = locator.findTetrahedron(point);
  console.log('at', point.join(', ').padEnd(16),
      'u =', u(point).toFixed(3),
      ' stable projection =', stable.project(u, point, tIdx, 0).toFixed(3));
}
