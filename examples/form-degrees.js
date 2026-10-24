// The four form degrees: a number (0), an edge field (1), a flux (2) and a
// density (3). Each lives in its own finite element space, and the
// derivative that commutes with the projection changes with it.
import {CanonicalProjector, Locator} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(4);
const projector = new CanonicalProjector(mesh.getVertices(),
    mesh.getTetrahedra());
const point = [0.31, 0.42, 0.27];
const {tIdx} = new Locator(mesh).findTetrahedron(point);

const scalar = (p) => p[0] * p[0] + p[1] * p[2];
const vector = (p) => [p[1], p[2] + p[0], p[0] * p[1]];

const show = (label, value) => console.log(label.padEnd(26), [].concat(value)
    .map((q) => q.toFixed(4)).join(' '));

// l = 0: values at the vertices; the field is continuous.
show('l = 0 projection', projector.project(scalar, point, tIdx, 0));
show('l = 0 exact', scalar(point));
// l = 1: integrals along the edges; the tangential part is continuous.
show('l = 1 projection', projector.project(vector, point, tIdx, 1));
show('l = 1 exact', vector(point));
// l = 2: fluxes through the faces; the normal part is continuous.
show('l = 2 projection', projector.project(vector, point, tIdx, 2));
// l = 3: one number per tetrahedron (its mean); the field is discontinuous.
show('l = 3 projection', projector.project(scalar, point, tIdx, 3));
