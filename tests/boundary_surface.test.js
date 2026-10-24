import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {
  boundarySurface,
  alfeldSplit,
} from '../traceprojector/boundary-surface.js';

const cube = generateUnitCubeMesh(2);
const vertices = cube.getVertices();
const tets = cube.getTetrahedra();
const surface = boundarySurface(vertices, tets);

const sub = (a, b) => a.map((q, i) => q - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const areaVector = (vs, [a, b, c]) =>
  cross(sub(vs[b], vs[a]), sub(vs[c], vs[a])).map((q) => q / 2);
const norm = (v) => Math.hypot(...v);

describe('boundary surface', () => {
  it('is a closed surface of the right topology: Euler characteristic 2', () => {
    const edges = new Map();
    for (const [a, b, c] of surface.triangles) {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = p < q ? `${p}_${q}` : `${q}_${p}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((n) => n === 2)).to.equal(true);
    expect(
        surface.vertices.length - edges.size + surface.triangles.length,
    ).to.equal(2);
  });

  it('has total area 6 and the area vectors sum to zero', () => {
    let area = 0;
    const sum = [0, 0, 0];
    for (const t of surface.triangles) {
      const n = areaVector(vertices, t);
      area += norm(n);
      n.forEach((q, k) => (sum[k] += q));
    }
    expect(area).to.be.closeTo(6, 1e-12);
    expect(norm(sum)).to.be.below(1e-12);
  });

  it('orients every triangle outward from the cube centre', () => {
    for (const t of surface.triangles) {
      const n = areaVector(vertices, t);
      const centre = [0, 1, 2].map((k) =>
        t.reduce((s, i) => s + vertices[i][k], 0) / 3);
      const outward = sub(centre, [0.5, 0.5, 0.5]);
      expect(n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2])
          .to.be.above(0);
    }
  });

  it('lists each boundary vertex once, in increasing order', () => {
    const sorted = [...surface.vertices].sort((a, b) => a - b);
    expect(surface.vertices).to.deep.equal(sorted);
    expect(new Set(surface.vertices).size).to.equal(surface.vertices.length);
  });
});

describe('Alfeld split of the boundary surface', () => {
  const split = alfeldSplit(vertices, surface.triangles);

  it('adds a barycentre per triangle and three children per triangle', () => {
    expect(split.vertices.length)
        .to.equal(vertices.length + surface.triangles.length);
    expect(split.triangles.length).to.equal(3 * surface.triangles.length);
  });

  it('preserves the area and the outward orientation', () => {
    let area = 0;
    for (const t of split.triangles) {
      const n = areaVector(split.vertices, t);
      area += norm(n);
      const p = split.parent[split.triangles.indexOf(t)];
      const parentNormal = areaVector(vertices, surface.triangles[p]);
      expect(n[0] * parentNormal[0] + n[1] * parentNormal[1] +
        n[2] * parentNormal[2]).to.be.above(0);
    }
    expect(area).to.be.closeTo(6, 1e-12);
  });
});
