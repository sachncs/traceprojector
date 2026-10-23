import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {boundarySurface, alfeldSplit} from '../traceprojector/boundary-surface.js';
import {SurfaceComplex} from '../traceprojector/surface-complex.js';

const cube = generateUnitCubeMesh(2);
const surface = boundarySurface(cube.getVertices(), cube.getTetrahedra());
const split = alfeldSplit(cube.getVertices(), surface.triangles);
const complex = new SurfaceComplex(split.vertices, split.triangles);

const sub = (a, b) => a.map((q, i) => q - b[i]);
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const lerp = (a, b, s) => a.map((q, i) => (1 - s) * q + s * b[i]);

describe('surface complex', () => {
  it('has Euler characteristic 2 and every edge in two triangles', () => {
    const used = new Set(split.triangles.flat());
    expect(used.size - complex.edges.length + complex.triangles.length)
        .to.equal(2);
    expect(complex.edgeTriangles.every((t) => t.length === 2)).to.equal(true);
  });

  it('barycentric coordinates sum to one and gradients to zero', () => {
    for (let t = 0; t < complex.triangles.length; t += 7) {
      const {gradients} = complex.geometry(t);
      const total = gradients.reduce((s, g) => s.map((q, i) => q + g[i]),
          [0, 0, 0]);
      expect(Math.hypot(...total)).to.be.below(1e-12);
      const {points} = complex.geometry(t);
      gradients.forEach((g, i) => {
        // The hat function of vertex i drops from 1 to 0 along each edge.
        expect(dot(g, sub(points[i], points[(i + 1) % 3])))
            .to.be.closeTo(1, 1e-12);
      });
    }
  });

  it('Whitney 0-forms are a partition of unity', () => {
    for (let t = 0; t < 5; t++) {
      const {points} = complex.geometry(t);
      const p = lerp(lerp(points[0], points[1], 0.3), points[2], 0.4);
      expect(complex.whitney(t, 0, p).reduce((a, b) => a + b))
          .to.be.closeTo(1, 1e-12);
    }
  });

  it('Whitney 1-forms have unit circulation on their own edge only', () => {
    const t = 3;
    const edges = complex.triangleEdges[t];
    edges.forEach((e, a) => {
      edges.forEach((f, b) => {
        const [v, w] = complex.edges[f].map((i) => complex.vertices[i]);
        const tangent = sub(w, v);
        let circulation = 0;
        const n = 8;
        for (let k = 0; k < n; k++) {
          const p = lerp(v, w, (k + 0.5) / n);
          circulation += dot(complex.whitney(t, 1, p)[a], tangent) / n;
        }
        expect(circulation).to.be.closeTo(a === b ? 1 : 0, 1e-12);
      });
    });
  });

  it('Whitney 1-forms have continuous tangential components across edges', () => {
    for (let e = 0; e < complex.edges.length; e += 5) {
      const [t1, t2] = complex.edgeTriangles[e];
      const [v, w] = complex.edges[e].map((i) => complex.vertices[i]);
      const tangent = sub(w, v);
      const p = lerp(v, w, 0.37);
      const value = (t) => complex.whitney(t, 1, p).map((u) => dot(u, tangent));
      const ids = (t) => complex.triangleEdges[t];
      for (const g of new Set([...ids(t1), ...ids(t2)])) {
        const a = ids(t1).indexOf(g);
        const b = ids(t2).indexOf(g);
        const left = a < 0 ? 0 : value(t1)[a];
        const right = b < 0 ? 0 : value(t2)[b];
        expect(left).to.be.closeTo(right, 1e-12);
      }
    }
  });

  it('Whitney 2-forms integrate to one over their triangle', () => {
    for (let t = 0; t < 5; t++) {
      const {area} = complex.geometry(t);
      expect(complex.whitney(t, 2, complex.geometry(t).points[0])[0] * area)
          .to.be.closeTo(1, 1e-12);
    }
  });
});
