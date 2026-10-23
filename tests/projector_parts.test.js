import {expect} from 'chai';
import {Mesh} from '../traceprojector/mesh.js';
import {Whitney} from '../traceprojector/whitney.js';
import {Projector} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {ProjectError} from '../traceprojector/errors.js';

const cube = generateUnitCubeMesh(2);
const mesh = new Mesh(cube.getVertices(), cube.getTetrahedra());
const whitney = new Whitney(mesh);
const projector = new Projector(mesh, whitney, {onWarning: () => {}});
const vertices = mesh.getVertices();
const tets = mesh.getTetrahedra();
const boundaryNodes = mesh.getBoundaryNodes();

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Fields of the lowest-order spaces, which the full projection must reproduce.
const affine = (x) => 0.7 * x[0] - 0.3 * x[1] + x[2] + 0.2;
const nedelec = (x) => {
  const a = [0.3, -0.2, 0.1];
  const b = [0.5, -0.3, 0.8];
  const c = cross(b, x);
  return [a[0] + c[0], a[1] + c[1], a[2] + c[2]];
};
const raviartThomas = (x) => [
  0.2 + 0.6 * x[0],
  -0.1 + 0.6 * x[1],
  0.4 + 0.6 * x[2],
];

const centroid = (t, w = [0.25, 0.25, 0.25, 0.25]) =>
  [0, 1, 2].map((k) =>
    tets[t].reduce((s, v, i) => s + w[i] * vertices[v][k], 0));
const weightsList = [
  [0.25, 0.25, 0.25, 0.25],
  [0.7, 0.1, 0.1, 0.1],
  [0.1, 0.2, 0.3, 0.4],
];
const sampleCells = [0, 7, 19, 33, 47];

describe('the full projection Pi reproduces the lowest-order spaces', () => {
  const cases = [
    ['l=0', affine, 0],
    ['l=1', nedelec, 1],
    ['l=2', raviartThomas, 2],
    ['l=3', () => 1.7, 3],
  ];
  for (const [name, field, l] of cases) {
    it(`${name}, in cells that touch and avoid the boundary`, () => {
      for (const t of sampleCells) {
        for (const w of weightsList) {
          const x = centroid(t, w);
          const got = projector.project(field, x, t, l);
          const want = field(x);
          [].concat(got).forEach((v, k) =>
            expect(Math.abs(v - [].concat(want)[k])).to.be.below(1e-10));
        }
      }
    });
  }

  it('Pi equals the boundary part plus the interior part of the residual', () => {
    const t = 12;
    const x = centroid(t, weightsList[2]);
    for (const [field, l] of [
      [affine, 0],
      [nedelec, 1],
      [raviartThomas, 2],
    ]) {
      const asArray = (v) => [].concat(v);
      const partialAt = (p) =>
        asArray(projector.projectPartial(field, p, t, l));
      const residual = (p) => {
        const r = asArray(field(p)).map((v, k) => v - partialAt(p)[k]);
        return l === 0 ? r[0] : r;
      };
      const full = asArray(projector.project(field, x, t, l));
      const sum = asArray(projector.projectRing(residual, x, t, l));
      full.forEach((v, k) =>
        expect(Math.abs(v - (partialAt(x)[k] + sum[k]))).to.be.below(1e-10));
    }
  });
});

describe('degrees of freedom and their orientation', () => {
  it('edge circulation of a constant field is a . (v1 - v0) along the stored edge', () => {
    const a = [0.5, -1.25, 2];
    mesh.getEdges().forEach((e, eIdx) => {
      const expected = dot(a, sub(vertices[e[1]], vertices[e[0]]));
      expect(projector.hcurl.computeEdgeDof(() => a, eIdx))
          .to.be.closeTo(expected, 1e-12);
    });
  });

  it('edge circulation of a scalar field is its difference along the edge', () => {
    mesh.getEdges().forEach((e, eIdx) => {
      expect(projector.hcurl.computeEdgeDof(affine, eIdx)).to.be.closeTo(
          affine(vertices[e[1]]) - affine(vertices[e[0]]), 1e-12);
    });
  });

  it('face flux of a constant field is a . n_out times the area on boundary faces', () => {
    const a = [0.5, -1.25, 2];
    for (const fIdx of mesh.getBoundaryFaces()) {
      const normal = mesh.getFaceOutwardNormal(fIdx);
      const expected = dot(a, normal) * mesh.getFaceArea(fIdx);
      expect(projector.hdiv.computeFaceDof(() => a, fIdx))
          .to.be.closeTo(expected, 1e-12);
    }
  });

  it('face flux of a gradient matches the analytic variant', () => {
    const g = [0.7, -0.3, 1];
    for (const fIdx of mesh.getBoundaryFaces()) {
      const exact =
        projector.hdiv.computeFaceDofAnalytic(affine, () => g, fIdx);
      expect(exact).to.be.closeTo(
          dot(g, mesh.getFaceOutwardNormal(fIdx)) * mesh.getFaceArea(fIdx),
          1e-12);
      expect(projector.hdiv.computeFaceDof(affine, fIdx))
          .to.be.closeTo(exact, 1e-6);
    }
  });
});

describe('the interior and boundary parts of the H1 projection', () => {
  const interiorTet = tets.findIndex((t) =>
    t.some((v) => !boundaryNodes.has(v)));
  const x = centroid(interiorTet, [0.1, 0.2, 0.3, 0.4]);
  const bary = whitney.getBarycentric(interiorTet, x);

  it('the interior part uses only interior vertices', () => {
    let want = 0;
    tets[interiorTet].forEach((v, i) => {
      if (!boundaryNodes.has(v)) want += affine(vertices[v]) * bary[i];
    });
    expect(projector.h1.projectRing(affine, x, interiorTet))
        .to.be.closeTo(want, 1e-12);
  });

  it('the boundary part uses only the supplied boundary values', () => {
    const data = new Map();
    tets[interiorTet].forEach((v) => {
      if (boundaryNodes.has(v)) data.set(v, 2 + v);
    });
    let want = 0;
    tets[interiorTet].forEach((v, i) => {
      if (data.has(v)) want += data.get(v) * bary[i];
    });
    expect(projector.h1.extendBoundary(data, x, interiorTet))
        .to.be.closeTo(want, 1e-12);
    // A boundary vertex without data contributes nothing.
    expect(projector.h1.extendBoundary(new Map(), x, interiorTet)).to.equal(0);
  });
});

describe('the L2 projection of a degenerate cell', () => {
  it('raises ProjectError instead of dividing by a vanishing volume', () => {
    const copy = new Mesh(cube.getVertices(), cube.getTetrahedra());
    const flat = new Projector(copy, new Whitney(copy), {onWarning: () => {}});
    // Collapse the cell by moving its last vertex into the plane of the others.
    const tet = copy.tetrahedra[0];
    const [a, b, c] = [0, 1, 2].map((i) => copy.vertices[tet[i]]);
    copy.vertices[tet[3]] = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    expect(() => flat.projectL2(() => 1, 0))
        .to.throw(ProjectError, /degenerate tetrahedron 0/);
  });
});
