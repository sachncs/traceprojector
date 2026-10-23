import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {BoundaryProjector} from '../traceprojector/boundary-projector.js';

const cube = generateUnitCubeMesh(3);
const vertices = cube.getVertices();
const cells = cube.getTetrahedra();
const projector = new BoundaryProjector(vertices, cells);
const orig = projector.orig;

/** The Whitney 0-form of vertex s and its gradient, as fields of (x, cell). */
const hat = (s) => ({
  u: (x, c) => {
    const local = orig.cells[c].indexOf(s);
    return local < 0 ? 0 : orig.whitney(c, 0, x)[local];
  },
  gradient: (x, c) => {
    const local = orig.cells[c].indexOf(s);
    return local < 0 ? [0, 0, 0] : orig.geometry(c).gradients[local];
  },
});

describe('boundary operator at lowest order: vertices', () => {
  const onBoundary = projector.complex.triangles.flat()
      .filter((v, i, all) => all.indexOf(v) === i);
  const r = onBoundary.find((v) => {
    const p = vertices[v];
    return p[2] === 0 && p[0] === 1 / 3 && p[1] === 1 / 3;
  });

  it('alpha_r(hat_s) = delta_rs for every vertex s of the mesh', () => {
    vertices.forEach((_, s) => {
      const {u, gradient} = hat(s);
      expect(projector.alpha0(r, u, gradient))
          .to.be.closeTo(s === r ? 1 : 0, 1e-9);
    });
  });
});

/** The Whitney 1-form of edge s of the original mesh and its curl. */
const edgeForm = (s) => ({
  u: (x, c) => {
    const local = orig.cellEdges[c].indexOf(s);
    return local < 0 ? [0, 0, 0] : orig.whitney(c, 1, x)[local];
  },
  curl: (x, c) => {
    const local = orig.cellEdges[c].indexOf(s);
    if (local < 0) return [0, 0, 0];
    const {gradients} = orig.geometry(c);
    const [i, j] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]][local];
    const a = gradients[i];
    const b = gradients[j];
    return [
      2 * (a[1] * b[2] - a[2] * b[1]),
      2 * (a[2] * b[0] - a[0] * b[2]),
      2 * (a[0] * b[1] - a[1] * b[0]),
    ];
  },
});

describe('boundary operator at lowest order: edges', () => {
  const r = projector.complex.edges.findIndex(([a, b]) => {
    const p = vertices[a];
    const q = vertices[b];
    return p[2] === 0 && q[2] === 0 && p[1] === q[1] && p[1] === 1 / 3;
  });
  const own = orig.edgeIndex(...projector.complex.edges[r]);

  it('alpha_r(W_s) = delta_rs for every edge s of the mesh', () => {
    orig.edges.forEach((_, s) => {
      const {u, curl} = edgeForm(s);
      expect(projector.alpha1(r, u, curl))
          .to.be.closeTo(s === own ? 1 : 0, 1e-9);
    });
  });
});

/** The Whitney 2-form of face s of the original mesh and its divergence. */
const faceForm = (s) => ({
  u: (x, c) => {
    const local = orig.cellFaces[c].indexOf(s);
    return local < 0 ? [0, 0, 0] : orig.whitney(c, 2, x)[local];
  },
  divergence: (x, c) => {
    const local = orig.cellFaces[c].indexOf(s);
    return local < 0 ? 0 :
      orig.cellFaceSigns[c][local] / orig.geometry(c).volume;
  },
});

describe('boundary operator at lowest order: faces', () => {
  const r = projector.complex.triangles.findIndex((t) => {
    const ps = t.map((v) => vertices[v]);
    return ps.every((p) => p[2] === 0) && ps.some((p) => p[0] === 1 / 3);
  });
  const own = orig.faceIndex(...projector.complex.triangles[r]);

  it('alpha_r(W_s) = delta_rs for the faces around r and a sample', function() {
    this.timeout(60000);
    // Faces sharing a vertex with r, plus every seventh face of the mesh.
    const near = new Set(orig.faces.map((face, s) => [face, s])
        .filter(([face]) => face.some((v) =>
          projector.complex.triangles[r].includes(v))).map(([, s]) => s));
    orig.faces.forEach((_, s) => {
      if (!near.has(s) && s % 7 !== 0) return;
      const {u, divergence} = faceForm(s);
      expect(projector.alpha2(r, u, divergence))
          .to.be.closeTo(s === own ? 1 : 0, 1e-9);
    });
  });
});
