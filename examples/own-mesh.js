// Your own mesh: build the two arrays yourself (from Gmsh, TetGen or by hand),
// and see what happens when they are wrong. Bad input is always a typed
// error, never a silent wrong answer.
import {
  Locator, Mesh, StableProjector, ValidateError, validateMeshInput,
} from 'traceprojector';

// Two tetrahedra that share the face (0, 1, 2).
const vertices = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, -1]];
const tetrahedra = [[0, 1, 2, 3], [0, 2, 1, 4]];

// The tetrahedra must have positive orientation. Mesh tells you where the
// problem is; swap two vertex numbers of the named tetrahedron to repair it.
const attempt = (label, make) => {
  try {
    make();
    console.log(label.padEnd(24), 'accepted');
  } catch (error) {
    console.log(label.padEnd(24), error.constructor.name + ':',
        error.message.split('(')[0].split('.')[0].trim());
  }
};
attempt('as given', () => new Mesh(vertices, tetrahedra));
attempt('second one flipped', () => new Mesh(vertices, [[0, 1, 2, 3],
  [0, 1, 2, 4]]));
attempt('a NaN coordinate', () => new Mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0],
  [NaN, 0, 1]], [[0, 1, 2, 3]]));
attempt('a vertex that is missing', () => new Mesh(vertices, [[0, 1, 2, 9]]));

// To check a mesh without building anything, call validateMeshInput.
attempt('validateMeshInput', () => validateMeshInput(vertices, tetrahedra));

// Every projector checks its mesh when you construct it, and raises the same
// errors for a NaN, a repeated or missing vertex and a flat tetrahedron. They
// do not insist on the orientation: they sort the vertices of each cell and
// give the same answer either way, so a Gmsh or TetGen mesh that mixes the two
// works as it is. Mesh and Projector, which use the sign, do insist.
attempt('projector, flipped', () => new StableProjector(vertices,
    [[0, 2, 1, 3]]));
attempt('projector, flat', () => new StableProjector([[0, 0, 0], [1, 0, 0],
  [0, 1, 0], [1, 1, 0]], [[0, 1, 2, 3]]));

// Once the mesh is good, find the tetrahedron that contains a point.
const mesh = new Mesh(vertices, tetrahedra);
const locator = new Locator(mesh);
console.log('point (0.2, 0.2, 0.2) lies in tetrahedron',
    locator.findTetrahedron([0.2, 0.2, 0.2]).tIdx);
console.log('point (2, 2, 2) lies in', locator.findTetrahedron([2, 2, 2]));

// Catching by class, when you do not care which check failed.
try {
  new Mesh(vertices, [[0, 0, 1, 2]]);
} catch (error) {
  console.log('caught a ValidateError:', error instanceof ValidateError);
}
