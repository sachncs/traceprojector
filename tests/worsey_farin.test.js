import {expect} from 'chai';
import {Mesh} from '../traceprojector/mesh.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {worseyFarinSplit} from '../traceprojector/worsey-farin.js';
import {relativeVolume} from '../traceprojector/utils.js';
import {SimplicialComplex} from '../traceprojector/simplicial-complex.js';

const cube = generateUnitCubeMesh(2);
const vertices = cube.getVertices();
const tets = cube.getTetrahedra();
const split = worseyFarinSplit(vertices, tets);
const volume = (points) => {
  const [a, b, c, d] = points;
  const u = b.map((q, i) => q - a[i]);
  const v = c.map((q, i) => q - a[i]);
  const w = d.map((q, i) => q - a[i]);
  return Math.abs(
      u[0] * (v[1] * w[2] - v[2] * w[1]) -
      u[1] * (v[0] * w[2] - v[2] * w[0]) +
      u[2] * (v[0] * w[1] - v[1] * w[0])) / 6;
};
const total = (vs, cells) =>
  cells.reduce((s, c) => s + volume(c.map((i) => vs[i])), 0);

describe('Worsey-Farin split', () => {
  const faces = new SimplicialComplex(vertices, tets).faces.length;

  it('adds one vertex per cell and per face, and twelve cells per cell', () => {
    expect(split.vertices.length)
        .to.equal(vertices.length + tets.length + faces);
    expect(split.cells.length).to.equal(12 * tets.length);
  });

  it('keeps the original vertices first and maps each cell to its children', () => {
    expect(split.vertices.slice(0, vertices.length)).to.deep.equal(vertices);
    expect(split.parent.length).to.equal(split.cells.length);
    for (let c = 0; c < tets.length; c++) {
      expect(split.parent.filter((p) => p === c).length).to.equal(12);
    }
  });

  it('preserves the volume and gives every child positive volume', () => {
    expect(total(split.vertices, split.cells))
        .to.be.closeTo(total(vertices, tets), 1e-12);
    for (const cell of split.cells) {
      expect(relativeVolume(cell.map((i) => split.vertices[i])))
          .to.not.equal(0);
    }
  });

  it('is a conforming mesh (each interior face is shared by two cells)', () => {
    const mesh = new Mesh(split.vertices, split.cells);
    expect(mesh.getTetrahedra().length).to.equal(split.cells.length);
  });

  it('puts the face vertex at the barycentre of the face', () => {
    const first = split.faceVertex.entries().next().value;
    const face = first[0].split('_').map(Number);
    const index = first[1];
    const centre = [0, 1, 2].map((k) =>
      face.reduce((s, v) => s + vertices[v][k], 0) / 3);
    split.vertices[index].forEach((q, k) =>
      expect(q).to.be.closeTo(centre[k], 1e-14));
  });
});
