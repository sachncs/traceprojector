// Boundary values. Some operators keep the values of the input on the
// boundary exactly (the discrete trace), which is what you need to impose
// boundary conditions or to couple two meshes. The bounded commuting
// operator does not, in exchange for needing nothing of u on the boundary.
import {
  BoundedCommutingProjector, StableProjector, TracePreservingProjector,
} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(3);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();
const u = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]);

const stable = new StableProjector(vertices, tetrahedra);
const bounded = new BoundedCommutingProjector(vertices, tetrahedra);

// A vertex on the boundary of the cube: the first vertex is the corner
// (0, 0, 0), and vertex 1 is the next one along an edge of the cube.
for (const vertex of [0, 1]) {
  console.log('vertex', vertex, 'at', vertices[vertex].map((q) => q.toFixed(2))
      .join(', '));
  console.log('  value of u                 ', u(vertices[vertex]).toFixed(6));
  console.log('  stable coefficient         ',
      stable.coefficient(u, 0, vertex).toFixed(6));
  console.log('  bounded commuting          ',
      bounded.coefficient(u, 0, vertex).toFixed(6));
}

// The paper's own boundary operator, TracePreservingProjector, needs even
// less of u on the boundary: its boundary coefficients are weighted averages
// near the boundary, not point values, so they do not equal u(vertex) for a
// general u. For a function inside the finite element space they do.
const gradU = (p) => [
  Math.cos(p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
  -Math.sin(p[0]) * Math.sin(p[1]) * Math.exp(p[2]),
  Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
];
const traced = new TracePreservingProjector(vertices, tetrahedra);
const linear = (p) => 2 * p[0] - p[1] + 0.5 * p[2] + 1;
const linearGradient = () => [2, -1, 0.5];
console.log('trace preserving, vertex 1:');
console.log('  u (a weighted average, not the point value)',
    traced.coefficient(u, gradU, 0, 1).toFixed(6));
console.log('  a linear function, which is in the space   ',
    traced.coefficient(linear, linearGradient, 0, 1).toFixed(6),
    'against', linear(vertices[1]).toFixed(6));
