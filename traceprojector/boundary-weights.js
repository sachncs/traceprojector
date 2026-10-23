/**
 * Lowest-order boundary weights on the boundary surface, after the weighted
 * Poisson construction of Ern, Guzman, Potu and Vohralik: for a boundary
 * vertex v the weight is eta - div(mu grad psi) on the extended star of v,
 * where eta is the normalized indicator of the star, mu the bubble that is one
 * at each triangle's barycentre and zero on its edges, and psi solves a
 * weighted Poisson problem. The weight integrates to one against the constant
 * and reproduces the nodal value of every continuous piecewise-linear
 * function on the surface.
 */

import {SingularError} from './errors.js';
import {minimumNormSolve, solveSemidefinite} from './dense-linear-algebra.js';
import {alfeldSplit} from './boundary-surface.js';

const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);

/**
 * Three-point rule exact for quadratics on a triangle. The points are interior,
 * so a field that jumps across edges is evaluated unambiguously.
 */
function triangleRule(points) {
  return [[2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]]
      .map((b) => ({
        x: [0, 1, 2].map((k) => b[0] * points[0][k] + b[1] * points[1][k] +
          b[2] * points[2][k]),
        weight: 1 / 3,
      }));
}

/**
 * @param {!Object} complex A SurfaceComplex of the boundary triangles.
 * @param {number} v A boundary vertex.
 * @return {{triangles: number[], pair: function(function(number[]): number):
 *     number, integral: function(): number,
 *     normSquared: function(): number}} The weight: the triangles of the
 *     extended star and the pairing of the weight with a field, which
 *     integrates over the barycentric sub-triangles.
 * @throws {SingularError} If the weighted problem is inconsistent, which means
 *     the extended star is not contractible.
 */
export function vertexBoundaryWeight(complex, v) {
  const triangles = complex.extendedStar(0, v);
  const corners = [...new Set(triangles.flatMap((t) => complex.triangles[t]))]
      .sort((a, b) => a - b);
  const local = new Map(corners.map((c, i) => [c, i]));
  const n = corners.length;
  const area = triangles.reduce((s, t) => s + complex.geometry(t).area, 0);

  // (mu grad psi, grad u) = (|f| / 3) grad psi . grad u on each triangle f,
  // since the bubble mu has mean one third.
  const stiffness = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  rhs[local.get(v)] += 1;
  for (const t of triangles) {
    const {gradients, area: a} = complex.geometry(t);
    const ids = complex.triangles[t].map((c) => local.get(c));
    for (let i = 0; i < 3; i++) {
      rhs[ids[i]] -= a / 3 / area;
      for (let j = 0; j < 3; j++) {
        stiffness[ids[i] * n + ids[j]] +=
          (a / 3) * dot(gradients[i], gradients[j]);
      }
    }
  }
  const solved = solveSemidefinite(stiffness, n, rhs);
  if (solved.residual > 1e-8) {
    throw new SingularError('the extended star of the vertex is not contractible');
  }

  const split = alfeldSplit(complex.vertices, triangles.map(
      (t) => complex.triangles[t]));
  const wholeOfChildren = new complex.constructor(
      split.vertices, split.triangles);
  const values = split.triangles.map((_, k) => {
    const t = triangles[split.parent[k]];
    const {gradients} = complex.geometry(t);
    const gradPsi = [0, 0, 0];
    complex.triangles[t].forEach((c, i) => {
      const psi = solved.x[local.get(c)];
      gradients[i].forEach((q, d) => (gradPsi[d] += psi * q));
    });
    // The bubble is the first barycentric coordinate of each child [g, a, b].
    const gradMu = wholeOfChildren.geometry(k).gradients[0];
    return 1 / area - dot(gradMu, gradPsi);
  });

  const pair = (field) => {
    let sum = 0;
    split.triangles.forEach((child, k) => {
      const {points, area: a} = wholeOfChildren.geometry(k);
      for (const {x, weight} of triangleRule(points)) {
        sum += values[k] * field(x) * weight * a;
      }
    });
    return sum;
  };
  const normSquared = () => {
    let sum = 0;
    split.triangles.forEach((_, k) => {
      sum += values[k] ** 2 * wholeOfChildren.geometry(k).area;
    });
    return sum;
  };
  const valueOf = (t, k) => {
    const position = triangles.indexOf(t);
    return position < 0 ? 0 : values[3 * position + k];
  };
  return {
    triangles,
    pair,
    integral: () => pair(() => 1),
    normSquared,
    valueOf,
  };
}

const sub = (a, b) => a.map((q, i) => q - b[i]);
const crossProduct = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => a.map((q) => q / Math.hypot(...a));

/** +1 if the edge points along the triangle's orientation, else -1. */
function edgeSign(complex, t, e) {
  const triangle = complex.triangles[t];
  const [lo, hi] = complex.edges[e];
  const at = triangle.indexOf(lo);
  return triangle[(at + 1) % 3] === hi ? 1 : -1;
}

/**
 * The lowest-order weight of a boundary edge: the normal-flux field
 * eta - rot(mu curl psi) on the extended star of the edge, with
 * div = -(zeta_b - zeta_a) for the weights of the edge's end vertices, and
 * (zeta, W_e') = delta for every boundary Whitney 1-form W_e'.
 *
 * @param {!Object} complex A SurfaceComplex of the boundary triangles.
 * @param {number} e A boundary edge.
 * @return {{triangles: number[], pair: function(function(number[]):
 *     number[]): number, divergence: function(number, number): number,
 *     vertexWeights: !Array<!Object>}} The weight: the triangles of the
 *     extended star, its pairing with a vector field, its divergence on child
 *     k of triangle t, and the end-vertex weights it was built from.
 * @throws {SingularError} If the extended star is not contractible.
 */
export function edgeBoundaryWeight(complex, e) {
  const [a, b] = complex.edges[e];
  const triangles = complex.extendedStar(1, e);
  const vertexWeights = [a, b].map((v) => vertexBoundaryWeight(complex, v));
  const split = alfeldSplit(complex.vertices, triangles.map(
      (t) => complex.triangles[t]));
  const sub3 = new complex.constructor(split.vertices, split.triangles);
  const count = split.triangles.length;
  const parentOf = (k) => triangles[split.parent[k]];
  const normalOf = (k) => unit(crossProduct(
      sub(sub3.geometry(k).points[1], sub3.geometry(k).points[0]),
      sub(sub3.geometry(k).points[2], sub3.geometry(k).points[0])));

  // Free unknowns: the flux across each sub-edge with a child on both sides;
  // the others lie on the boundary of the star, where the flux is zero.
  const free = new Map();
  sub3.edges.forEach((_, j) => {
    if (sub3.edgeTriangles[j].length === 2) free.set(j, free.size);
  });
  const n = free.size;
  const rows = [];
  const target = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const row = new Float64Array(n);
    sub3.triangleEdges[k].forEach((j) => {
      if (free.has(j)) row[free.get(j)] = edgeSign(sub3, k, j);
    });
    rows.push(row);
    const kk = k % 3;
    const t = parentOf(k);
    target[k] = sub3.geometry(k).area *
      (vertexWeights[1].valueOf(t, kk) - vertexWeights[0].valueOf(t, kk));
  }
  const mass = new Float64Array(n * n);
  for (let k = 0; k < count; k++) {
    const {points, area} = sub3.geometry(k);
    const edges = sub3.triangleEdges[k];
    for (const {x, weight} of triangleRule(points)) {
      const w = sub3.whitney(k, 1, x);
      edges.forEach((j, p) => {
        edges.forEach((l, q) => {
          if (free.has(j) && free.has(l)) {
            mass[free.get(j) * n + free.get(l)] +=
              weight * area * dot(w[p], w[q]);
          }
        });
      });
    }
  }
  const flux = minimumNormSolve(rows, mass, n, target);
  if (flux.residual > 1e-8 * Math.max(flux.scale, 1)) {
    throw new SingularError('no flux field with the required divergence');
  }
  const eta = (k, x) => {
    const w = sub3.whitney(k, 1, x);
    const out = [0, 0, 0];
    const normal = normalOf(k);
    sub3.triangleEdges[k].forEach((j, p) => {
      if (!free.has(j)) return;
      const rotated = crossProduct(normal, w[p]);
      rotated.forEach((q, d) => (out[d] += flux.x[free.get(j)] * q));
    });
    return out;
  };

  // Weighted curl problem for psi in the Whitney 1-forms of the original
  // triangles (kernel: gradients).
  const edgeIds = [...new Set(
      triangles.flatMap((t) => complex.triangleEdges[t]))];
  const local = new Map(edgeIds.map((id, i) => [id, i]));
  const m = edgeIds.length;
  const stiffness = new Float64Array(m * m);
  const rhs = new Float64Array(m);
  rhs[local.get(e)] += 1;
  for (const t of triangles) {
    const {area} = complex.geometry(t);
    const ids = complex.triangleEdges[t];
    ids.forEach((i) => ids.forEach((j) => {
      stiffness[local.get(i) * m + local.get(j)] +=
        edgeSign(complex, t, i) * edgeSign(complex, t, j) / (3 * area);
    }));
  }
  for (let k = 0; k < count; k++) {
    const t = parentOf(k);
    const {points, area} = sub3.geometry(k);
    for (const {x, weight} of triangleRule(points)) {
      const w = complex.whitney(t, 1, x);
      const value = eta(k, x);
      complex.triangleEdges[t].forEach((id, p) => {
        rhs[local.get(id)] -= weight * area * dot(value, w[p]);
      });
    }
  }
  const psi = solveSemidefinite(stiffness, m, rhs);
  if (psi.residual > 1e-8) {
    throw new SingularError('the extended star of the edge is not contractible');
  }
  const curlPsi = triangles.map((t) => complex.triangleEdges[t].reduce(
      (sum, id) => sum + psi.x[local.get(id)] * edgeSign(complex, t, id) /
        complex.geometry(t).area, 0));

  const zeta = (k, x) => {
    const gradMu = sub3.geometry(k).gradients[0];
    const normal = normalOf(k);
    const rotated = crossProduct(gradMu, normal);
    const out = eta(k, x);
    return out.map((q, d) => q + curlPsi[split.parent[k]] * rotated[d]);
  };
  const pair = (field) => {
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const {points, area} = sub3.geometry(k);
      for (const {x, weight} of triangleRule(points)) {
        sum += weight * area * dot(zeta(k, x), field(x));
      }
    }
    return sum;
  };
  const divergence = (t, kk) => {
    const k = 3 * triangles.indexOf(t) + kk;
    let sum = 0;
    sub3.triangleEdges[k].forEach((j) => {
      if (free.has(j)) sum -= edgeSign(sub3, k, j) * flux.x[free.get(j)];
    });
    return sum / sub3.geometry(k).area;
  };
  return {triangles, pair, divergence, vertexWeights};
}
