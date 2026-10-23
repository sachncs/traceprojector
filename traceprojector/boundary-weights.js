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
import {solveSemidefinite} from './dense-linear-algebra.js';
import {alfeldSplit} from './boundary-surface.js';

const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);

/** Three-point rule exact for quadratics on a triangle (points, weights). */
function triangleRule(points) {
  const mid = [[0, 1], [1, 2], [0, 2]].map(([i, j]) =>
    [0, 1, 2].map((k) => (points[i][k] + points[j][k]) / 2));
  return mid.map((x) => ({x, weight: 1 / 3}));
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
  return {triangles, pair, integral: () => pair(() => 1), normSquared};
}
