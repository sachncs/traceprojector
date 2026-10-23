import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {boundarySurface} from '../traceprojector/boundary-surface.js';
import {SurfaceComplex} from '../traceprojector/surface-complex.js';
import {
  vertexBoundaryWeight,
  edgeBoundaryWeight,
  faceBoundaryWeight,
} from '../traceprojector/boundary-weights.js';

function surfaceOf(n) {
  const cube = generateUnitCubeMesh(n);
  const vertices = cube.getVertices();
  const {triangles, vertices: onBoundary} = boundarySurface(
      vertices, cube.getTetrahedra());
  return {complex: new SurfaceComplex(vertices, triangles), onBoundary};
}

describe('lowest-order vertex boundary weight (P1 eq. 605)', () => {
  const {complex, onBoundary} = surfaceOf(4);
  const hat = (w) => (x) => {
    for (let t = 0; t < complex.triangles.length; t++) {
      const index = complex.triangles[t].indexOf(w);
      if (index < 0) continue;
      const lambda = complex.barycentric(t, x);
      const {points} = complex.geometry(t);
      const back = [0, 1, 2].map((k) =>
        lambda.reduce((sum, q, i) => sum + q * points[i][k], 0));
      const offPlane = Math.hypot(...x.map((q, k) => q - back[k]));
      if (offPlane < 1e-9 && lambda.every((q) => q > -1e-9)) {
        return lambda[index];
      }
    }
    return 0;
  };
  const interior = onBoundary.find((v) => {
    const p = complex.vertices[v];
    return p.filter((q) => q > 0.2 && q < 0.8).length >= 2 &&
      p.some((q) => q === 0 || q === 1);
  });
  const weight = vertexBoundaryWeight(complex, interior);

  it('is supported in the extended star', () => {
    const extended = new Set(complex.extendedStar(0, interior));
    expect(weight.triangles.every((t) => extended.has(t))).to.equal(true);
    expect(weight.triangles.length).to.equal(extended.size);
  });

  it('has integral one', () => {
    expect(weight.integral()).to.be.closeTo(1, 1e-12);
  });

  it('reproduces the nodal value of every boundary P1 function', () => {
    // pair(hat_w) = delta_{vw}, the defining property (P1 eq. 608).
    for (const w of onBoundary) {
      const expected = w === interior ? 1 : 0;
      expect(weight.pair(hat(w))).to.be.closeTo(expected, 1e-10);
    }
  });
});

describe('vertex boundary weight scaling', () => {
  it('has L2 norm of order 1 / h, so the pairing is bounded by ||u||', () => {
    const norms = [4, 8].map((n) => {
      const {complex, onBoundary} = surfaceOf(n);
      const v = onBoundary.find((i) => {
        const p = complex.vertices[i];
        return p[2] === 0 && p[0] === 0.5 && p[1] === 0.5;
      });
      const weight = vertexBoundaryWeight(complex, v);
      // ||zeta||^2 = pair(zeta) computed with the same quadrature.
      return Math.sqrt(weight.normSquared());
    });
    // Halving h multiplies the norm by about 2 (scale invariance of the
    // normalized weight).
    expect(norms[1] / norms[0]).to.be.within(1.8, 2.2);
  });
});

describe('lowest-order edge boundary weight (P1 eq. 805.1)', () => {
  const {complex} = surfaceOf(3);
  // The Whitney 1-form of boundary edge f, as a field on the surface.
  const whitney = (f) => (x) => {
    for (const t of complex.edgeTriangles[f]) {
      const {points} = complex.geometry(t);
      const lambda = complex.barycentric(t, x);
      const back = [0, 1, 2].map((k) =>
        lambda.reduce((sum, q, i) => sum + q * points[i][k], 0));
      const off = Math.hypot(...x.map((q, k) => q - back[k]));
      if (off < 1e-9 && lambda.every((q) => q > -1e-9)) {
        return complex.whitney(t, 1, x)[complex.triangleEdges[t].indexOf(f)];
      }
    }
    return [0, 0, 0];
  };
  const e = complex.edges.findIndex(([a, b]) => {
    const p = complex.vertices[a];
    const q = complex.vertices[b];
    return p[2] === 0 && q[2] === 0 && p[1] === q[1] && p[1] > 0.2 &&
      p[1] < 0.8;
  });
  const weight = edgeBoundaryWeight(complex, e);

  it('is supported in the extended star of the edge', () => {
    const [a, b] = complex.edges[e];
    const touching = complex.triangles.map((t, i) => [t, i])
        .filter(([t]) => t.includes(a) || t.includes(b)).map(([, i]) => i);
    expect(weight.triangles.slice().sort()).to.deep.equal(touching.sort());
  });

  it('reproduces the circulation: (zeta, W_f) = delta for every edge f', () => {
    complex.edges.forEach((_, f) => {
      expect(weight.pair(whitney(f))).to.be.closeTo(f === e ? 1 : 0, 1e-9);
    });
  });

  it('has divergence minus the difference of the end-vertex weights', () => {
    for (const t of weight.triangles) {
      for (let k = 0; k < 3; k++) {
        const [va, vb] = weight.vertexWeights;
        expect(weight.divergence(t, k)).to.be.closeTo(
            -(vb.valueOf(t, k) - va.valueOf(t, k)), 1e-9);
      }
    }
  });
});

describe('lowest-order face boundary weight', () => {
  const {complex} = surfaceOf(3);
  const f = complex.triangles.findIndex((t) => {
    const ps = t.map((v) => complex.vertices[v]);
    return ps.every((p) => p[2] === 0) &&
      ps.every((p) => p[0] > 0.2 && p[0] < 0.8 || p[0] === 1 / 3);
  });
  const weight = faceBoundaryWeight(complex, f);
  // The Whitney 2-form of a boundary face: the constant 1 / area on it.
  const density = (g) => (x) => {
    const {points, area} = complex.geometry(g);
    const lambda = complex.barycentric(g, x);
    const back = [0, 1, 2].map((k) =>
      lambda.reduce((sum, q, i) => sum + q * points[i][k], 0));
    const off = Math.hypot(...x.map((q, k) => q - back[k]));
    return off < 1e-9 && lambda.every((q) => q > -1e-9) ? 1 / area : 0;
  };

  it('is supported in the extended star of the face', () => {
    const corners = new Set(complex.triangles[f]);
    const touching = complex.triangles.map((t, i) => [t, i])
        .filter(([t]) => t.some((v) => corners.has(v))).map(([, i]) => i);
    expect(weight.triangles.slice().sort()).to.deep.equal(touching.sort());
  });

  it('has a rotation equal to the signed sum of the edge weights', () => {
    expect(weight.rotationResidual).to.be.below(1e-9);
  });

  it('reproduces the face integral: (zeta, 1 / |g|)_g = delta', () => {
    complex.triangles.forEach((_, g) => {
      expect(weight.pair(density(g))).to.be.closeTo(g === f ? 1 : 0, 1e-9);
    });
  });
});
