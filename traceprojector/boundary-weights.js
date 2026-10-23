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
  // Value at x inside child kk of triangle t; zero outside the extended star.
  const valueAt = (t, kk, x) => {
    const position = triangles.indexOf(t);
    return position < 0 ? [0, 0, 0] : zeta(3 * position + kk, x);
  };
  const normSquared = () => {
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const {points, area} = sub3.geometry(k);
      for (const {x, weight} of triangleRule(points)) {
        const z = zeta(k, x);
        sum += weight * area * dot(z, z);
      }
    }
    return sum;
  };
  return {
    triangles,
    pair,
    divergence,
    vertexWeights,
    valueAt,
    normSquared,
  };
}

/**
 * The lowest-order weight of a boundary face: the continuous piecewise-linear
 * function on the Alfeld split of the extended star of the face, zero on its
 * boundary, whose surface rotation is the signed sum of the weights of the
 * face's edges. It satisfies (zeta, 1 / |f'|)_f' = delta for every boundary
 * face f'.
 *
 * @param {!Object} complex A SurfaceComplex of the boundary triangles.
 * @param {number} f A boundary face.
 * @return {{triangles: number[], pair: function(function(number[]): number):
 *     number, edgeWeights: !Array<!Object>, rotationResidual: number}} The
 *     weight, with the largest deviation of its rotation from the edge
 *     weights it was built from.
 * @throws {SingularError} If no such function exists.
 */
export function faceBoundaryWeight(complex, f) {
  const triangles = complex.extendedStar(2, f);
  const edgeWeights = complex.triangleEdges[f].map(
      (e) => edgeBoundaryWeight(complex, e));
  const signs = complex.triangleEdges[f].map((e) => edgeSign(complex, f, e));
  const rhsField = (t, kk, x) => {
    const out = [0, 0, 0];
    edgeWeights.forEach((weight, i) => {
      weight.valueAt(t, kk, x).forEach((q, d) => (out[d] += signs[i] * q));
    });
    return out;
  };
  const split = alfeldSplit(complex.vertices, triangles.map(
      (t) => complex.triangles[t]));
  const sub3 = new complex.constructor(split.vertices, split.triangles);
  const count = split.triangles.length;
  const normalOf = (k) => {
    const {points} = sub3.geometry(k);
    return unit(crossProduct(sub(points[1], points[0]),
        sub(points[2], points[0])));
  };
  const onBoundary = new Set();
  sub3.edges.forEach(([p, q], j) => {
    if (sub3.edgeTriangles[j].length === 1) {
      onBoundary.add(p);
      onBoundary.add(q);
    }
  });
  const nodes = [...new Set(split.triangles.flat())]
      .filter((v) => !onBoundary.has(v));
  const local = new Map(nodes.map((v, i) => [v, i]));
  const n = nodes.length;
  const stiffness = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  for (let k = 0; k < count; k++) {
    const {points, area, gradients} = sub3.geometry(k);
    const normal = normalOf(k);
    const child = split.triangles[k];
    const t = triangles[split.parent[k]];
    for (let i = 0; i < 3; i++) {
      if (!local.has(child[i])) continue;
      for (let j = 0; j < 3; j++) {
        if (!local.has(child[j])) continue;
        stiffness[local.get(child[i]) * n + local.get(child[j])] +=
          area * dot(gradients[i], gradients[j]);
      }
      const rotated = crossProduct(gradients[i], normal);
      for (const {x, weight} of triangleRule(points)) {
        rhs[local.get(child[i])] +=
          weight * area * dot(rhsField(t, k % 3, x), rotated);
      }
    }
  }
  const solved = solveSemidefinite(stiffness, n, rhs);
  const value = (v) => (local.has(v) ? solved.x[local.get(v)] : 0);

  // Deviation of the rotation of the function from the edge weights.
  let deviation = 0;
  for (let k = 0; k < count; k++) {
    const {points, gradients} = sub3.geometry(k);
    const normal = normalOf(k);
    const gradient = [0, 0, 0];
    split.triangles[k].forEach((v, i) => {
      gradients[i].forEach((q, d) => (gradient[d] += value(v) * q));
    });
    const rotation = crossProduct(gradient, normal);
    for (const {x} of triangleRule(points)) {
      const wanted = rhsField(triangles[split.parent[k]], k % 3, x);
      deviation = Math.max(deviation, Math.hypot(...sub(rotation, wanted)));
    }
  }
  const scale = Math.max(...edgeWeights.map((w) => Math.hypot(
      ...w.valueAt(triangles[0], 0, complex.geometry(triangles[0]).points[0]))),
  1);
  if (deviation > 1e-8 * scale) {
    throw new SingularError('the rotation of the face weight is inconsistent');
  }
  const pair = (field) => {
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const {points, area} = sub3.geometry(k);
      for (const {x, weight} of triangleRule(points)) {
        const lambda = sub3.barycentric(k, x);
        const height = split.triangles[k].reduce(
            (s, v, i) => s + value(v) * lambda[i], 0);
        sum += weight * area * height * field(x);
      }
    }
    return sum;
  };
  // Value at x inside child kk of triangle t; zero outside the extended star.
  const valueAt = (t, kk, x) => {
    const position = triangles.indexOf(t);
    if (position < 0) return 0;
    const k = 3 * position + kk;
    const lambda = sub3.barycentric(k, x);
    return split.triangles[k].reduce((s, v, i) => s + value(v) * lambda[i], 0);
  };
  const normSquared = () => {
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const {points, area} = sub3.geometry(k);
      for (const {x, weight} of triangleRule(points)) {
        const z = valueAt(triangles[split.parent[k]], k % 3, x);
        sum += weight * area * z * z;
      }
    }
    return sum;
  };
  return {
    triangles,
    pair,
    edgeWeights,
    rotationResidual: deviation,
    valueAt,
    normSquared,
  };
}
