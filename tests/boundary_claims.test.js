/**
 * Claims W6 and W7 of docs/VALIDATION.md at the lowest order: the boundary
 * weights and their bulk extensions have the sizes the paper assumes, and the
 * discrete Poincare inequalities hold on boundary extended stars with a
 * constant that does not depend on the mesh size or, within the mesh family
 * tested, on the shape of the star.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {boundarySurface} from '../traceprojector/boundary-surface.js';
import {SurfaceComplex} from '../traceprojector/surface-complex.js';
import {BoundaryProjector} from '../traceprojector/boundary-projector.js';
import {
  vertexBoundaryWeight,
  edgeBoundaryWeight,
  faceBoundaryWeight,
} from '../traceprojector/boundary-weights.js';
import {symmetricEigenvalues} from '../traceprojector/small-linear-algebra.js';
import {cholesky} from '../traceprojector/dense-linear-algebra.js';

/** Slope of log(value) against log(h). */
function slope(hs, values) {
  const x = hs.map(Math.log);
  const y = values.map(Math.log);
  const mx = x.reduce((a, b) => a + b) / x.length;
  const my = y.reduce((a, b) => a + b) / y.length;
  return x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0) /
    x.reduce((s, xi) => s + (xi - mx) ** 2, 0);
}

/** The boundary surface of the unit cube with n cells per side. */
function surfaceOf(n, jitter = 0) {
  const cube = generateUnitCubeMesh(n);
  const vertices = cube.getVertices().map((v) => v.slice());
  if (jitter > 0) {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    vertices.forEach((v) => {
      const onFace = v.map((q) => q === 0 || q === 1);
      if (onFace.filter(Boolean).length !== 1) return;
      v.forEach((_, d) => {
        if (!onFace[d]) v[d] += 2 * jitter * random() / n;
      });
    });
  }
  const {triangles, vertices: onBoundary} = boundarySurface(
      vertices, cube.getTetrahedra());
  return {
    complex: new SurfaceComplex(vertices, triangles),
    cube,
    vertices,
    onBoundary,
  };
}

/** Index of the entity of degree l on the face z = 0 nearest its centre. */
function central(complex, l, vertices) {
  const count = [vertices.length, complex.edges.length,
    complex.triangles.length][l];
  let best = -1;
  let distance = Infinity;
  for (let i = 0; i < count; i++) {
    const ids = l === 0 ? [i] : l === 1 ? complex.edges[i] :
      complex.triangles[i];
    const points = ids.map((v) => vertices[v]);
    if (!points.every((p) => Math.abs(p[2]) < 1e-12)) continue;
    const centre = [0, 1].map(
        (k) => points.reduce((s, q) => s + q[k], 0) / points.length);
    const d = Math.hypot(centre[0] - 0.5, centre[1] - 0.5);
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

describe('W6: sizes of the boundary weights and of their extensions', () => {
  const sizes = [3, 6, 12];
  const hs = sizes.map((n) => 1 / n);

  it('the surface weights have norms h^-1, h^0, h^1', () => {
    const norms = [[], [], []];
    for (const n of sizes) {
      const {complex, vertices} = surfaceOf(n);
      norms[0].push(Math.sqrt(vertexBoundaryWeight(
          complex, central(complex, 0, vertices)).normSquared()));
      norms[1].push(Math.sqrt(edgeBoundaryWeight(
          complex, central(complex, 1, vertices)).normSquared()));
      norms[2].push(Math.sqrt(faceBoundaryWeight(
          complex, central(complex, 2, vertices)).normSquared()));
    }
    [0, 1, 2].forEach((l) => {
      expect(slope(hs, norms[l])).to.be.closeTo(l - 1, 0.15);
    });
  });

  it('the bulk extensions have norms h^(l - 1/2)', function() {
    this.timeout(300000);
    const norms = [[], [], []];
    for (const n of [4, 6, 8]) {
      const {cube} = surfaceOf(n);
      const projector = new BoundaryProjector(
          cube.getVertices(), cube.getTetrahedra());
      const vertices = projector.complex.vertices;
      [0, 1, 2].forEach((l) => {
        const r = central(projector.complex, l, vertices);
        norms[l].push(Math.sqrt(projector.extensionNormSquared(l, r)));
      });
    }
    [0, 1, 2].forEach((l) => {
      expect(slope([1 / 4, 1 / 6, 1 / 8], norms[l]))
          .to.be.closeTo(l - 0.5, 0.15);
    });
  });
});

/** Smallest eigenvalue above the null space of K x = lambda M x. */
function smallestPositive(K, M) {
  const n = K.length;
  const flat = new Float64Array(n * n);
  M.forEach((row, i) => row.forEach((v, j) => (flat[i * n + j] = v)));
  const L = cholesky(flat, n);
  // A = L^-1 K L^-T.
  const solve = (b) => {
    const x = Array.from(b);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < i; k++) x[i] -= L[i * n + k] * x[k];
      x[i] /= L[i * n + i];
    }
    return x;
  };
  const columns = Array.from({length: n}, (_, j) => solve(K.map((r) => r[j])));
  const A = Array.from({length: n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const row = solve(columns.map((c) => c[i]));
    for (let j = 0; j < n; j++) A[i][j] = row[j];
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      A[i][j] = A[j][i] = 0.5 * (A[i][j] + A[j][i]);
    }
  }
  const eigenvalues = symmetricEigenvalues(A);
  const top = eigenvalues[n - 1];
  return eigenvalues.find((e) => e > 1e-8 * top);
}

/** Longest edge among the triangles. */
function longestEdge(complex, triangles) {
  let longest = 0;
  for (const t of triangles) {
    const p = complex.geometry(t).points;
    for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
      longest = Math.max(longest, Math.hypot(
          ...p[i].map((q, k) => q - p[j][k])));
    }
  }
  return longest;
}

describe('W7: discrete Poincare inequalities on boundary extended stars', () => {
  /** Poincare constants of the P1 and the Whitney spaces on one star. */
  function constants(complex, l, index) {
    const triangles = complex.extendedStar(l, index === undefined ? 0 : index);
    const h = longestEdge(complex, triangles);
    if (l === 0) {
      const vs = [...new Set(triangles.flatMap((t) => complex.triangles[t]))];
      const local = new Map(vs.map((v, i) => [v, i]));
      const n = vs.length;
      const K = Array.from({length: n}, () => new Array(n).fill(0));
      const M = Array.from({length: n}, () => new Array(n).fill(0));
      for (const t of triangles) {
        const {gradients, area} = complex.geometry(t);
        const ids = complex.triangles[t].map((v) => local.get(v));
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            K[ids[i]][ids[j]] += area * gradients[i].reduce(
                (s, q, d) => s + q * gradients[j][d], 0);
            M[ids[i]][ids[j]] += area / 12 * (i === j ? 2 : 1);
          }
        }
      }
      return 1 / (h * Math.sqrt(smallestPositive(K, M)));
    }
    // Whitney 1-forms on the star: curl-curl against the mass matrix.
    const es = [...new Set(triangles.flatMap((t) => complex.triangleEdges[t]))];
    const local = new Map(es.map((e, i) => [e, i]));
    const n = es.length;
    const K = Array.from({length: n}, () => new Array(n).fill(0));
    const M = Array.from({length: n}, () => new Array(n).fill(0));
    for (const t of triangles) {
      const {points, area} = complex.geometry(t);
      const ids = complex.triangleEdges[t].map((e) => local.get(e));
      const signs = complex.triangleEdges[t].map((e) => {
        const triangle = complex.triangles[t];
        const [lo, hi] = complex.edges[e];
        const at = triangle.indexOf(lo);
        return triangle[(at + 1) % 3] === hi ? 1 : -1;
      });
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          K[ids[i]][ids[j]] += signs[i] * signs[j] / area;
        }
      }
      const rule = [[2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6],
        [1 / 6, 1 / 6, 2 / 3]];
      for (const b of rule) {
        const x = [0, 1, 2].map(
            (k) => b[0] * points[0][k] + b[1] * points[1][k] +
              b[2] * points[2][k]);
        const w = complex.whitney(t, 1, x);
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            M[ids[i]][ids[j]] += area / 3 * w[i].reduce(
                (s, q, d) => s + q * w[j][d], 0);
          }
        }
      }
    }
    return 1 / (h * Math.sqrt(smallestPositive(K, M)));
  }

  for (const jitter of [0, 0.25]) {
    it(`the constants do not grow with refinement (in-plane jitter ${jitter})`,
        () => {
          const results = [];
          for (const n of [4, 8, 16]) {
            const {complex, vertices} = surfaceOf(n, jitter);
            const v = central(complex, 0, vertices);
            const e = central(complex, 1, vertices);
            results.push({
              n,
              vertex: constants(complex, 0, v),
              edge: constants(complex, 1, e),
            });
          }
          console.log('      ' + results.map((r) => `n=${r.n}: ${
            r.vertex.toFixed(3)} / ${r.edge.toFixed(3)}`).join('  '));
          const first = results[0];
          for (const r of results) {
            expect(r.vertex).to.be.at.most(1.15 * first.vertex);
            expect(r.edge).to.be.at.most(1.15 * first.edge);
            expect(r.vertex).to.be.below(10);
            expect(r.edge).to.be.below(10);
          }
        });
  }
});
