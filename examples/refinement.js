// Adaptive refinement: bisect the cells around a feature, keep the mesh
// conforming, and watch the error near the feature fall while the rest of
// the mesh stays coarse.
import {Mesh, Projector, Whitney, refineTetrahedra} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

// A sharp bump at one place: refinement should go there.
const centre = [0.3, 0.3, 0.3];
const u = (p) => Math.exp(-40 * ((p[0] - centre[0]) ** 2 +
  (p[1] - centre[1]) ** 2 + (p[2] - centre[2]) ** 2));

// Where we measure the error: a small grid around the bump.
const probes = [];
for (const x of [0.2, 0.27, 0.34, 0.41]) {
  for (const y of [0.2, 0.27, 0.34, 0.41]) {
    for (const z of [0.2, 0.27, 0.34, 0.41]) probes.push([x, y, z]);
  }
}

const start = generateUnitCubeMesh(3);
let vertices = start.getVertices();
let tetrahedra = start.getTetrahedra();
const centroid = (cell) => [0, 1, 2].map((k) => tetrahedra[cell]
    .reduce((s, v) => s + vertices[v][k], 0) / 4);

for (let step = 0; step < 6; step++) {
  const mesh = new Mesh(vertices, tetrahedra);
  const projector = new Projector(mesh, new Whitney(mesh));
  // sampler locates the probe points once and projects u at all of them.
  const values = projector.sampler(probes, 0)(u);
  const error = values.reduce((s, v, i) => s + Math.abs(v - u(probes[i])), 0) /
    probes.length;
  console.log('step', step, ' cells', String(tetrahedra.length).padStart(5),
      ' mean error near the bump', error.toExponential(2));
  // Bisect every cell whose centre is within 0.3 of the bump.
  const marked = tetrahedra.map((_, c) => c).filter((c) => Math.hypot(
      ...centroid(c).map((q, i) => q - centre[i])) < 0.3);
  ({vertices, tetrahedra} = refineTetrahedra(vertices, tetrahedra, marked));
}
