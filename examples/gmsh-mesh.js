// A mesh from Gmsh: read the .msh file (ASCII, format 2.2 or 4.1, first-order
// tetrahedra) and use it like any other. parseGmsh returns the two arrays the
// operators take, keeps only the vertices the tetrahedra use, and counts the
// boundary triangles and lines Gmsh also writes.
import {readFileSync} from 'node:fs';
import {Locator, Mesh, StableProjector, parseGmsh} from 'traceprojector';

// In Gmsh: Mesh > 3D, then File > Export as a .msh file; choose ASCII.
const file = new URL('_cube.msh', import.meta.url);
const {vertices, tetrahedra, skipped} = parseGmsh(readFileSync(file, 'utf8'));
console.log('vertices', vertices.length, ' tetrahedra', tetrahedra.length);
console.log('skipped', JSON.stringify(skipped));

// The tetrahedra come out positively oriented, so Mesh accepts them.
const mesh = new Mesh(vertices, tetrahedra);
const projector = new StableProjector(vertices, tetrahedra);
const u = (p) => Math.sin(p[0] + p[1]) * Math.exp(p[2]);
const point = [0.3, 0.45, 0.2];
const {tIdx} = new Locator(mesh).findTetrahedron(point);
console.log('u at the point         ', u(point).toFixed(4));
console.log('projection at the point', projector.project(u, point, tIdx, 0)
    .toFixed(4));

// What cannot be used is an error that says why, never a different mesh.
for (const [what, text] of [
  ['a binary file', '$MeshFormat\n2.2 1 8\n$EndMeshFormat\n'],
  ['hexahedra', readFileSync(file, 'utf8').replace(/ 4 2 2 1 /, ' 5 2 2 1 ')],
]) {
  try {
    parseGmsh(text);
  } catch (error) {
    console.log(what.padEnd(14), error.constructor.name + ':',
        error.message.split(';')[0]);
  }
}
