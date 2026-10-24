/**
 * The boundary of a tetrahedral mesh as an oriented triangle surface, and its
 * Alfeld split. Triangles are oriented so that the area vector
 * (b - a) x (c - a) / 2 points out of the domain.
 */

import {ValidateError} from './errors.js';

const FACE_TRIPLES = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2],
];

const sub = (a, b) => a.map((q, i) => q - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * @param {number[][]} vertices Vertex coordinates.
 * @param {number[][]} cells Tetrahedra as four vertex indices.
 * @return {{vertices: number[], triangles: number[][], cell: number[]}}
 *     The boundary vertex indices (sorted), the outward-oriented boundary
 *     triangles in the numbering of `vertices`, and the cell each one
 *     belongs to.
 */
export function boundarySurface(vertices, cells) {
  if (!Array.isArray(vertices) || !Array.isArray(cells)) {
    throw new ValidateError('boundarySurface needs vertices and cells');
  }
  const seen = new Map();
  cells.forEach((cell, c) => {
    for (const [i, j, k] of FACE_TRIPLES) {
      const face = [cell[i], cell[j], cell[k]];
      const key = [...face].sort((p, q) => p - q).join('_');
      const entry = seen.get(key);
      if (entry) entry.count++;
      else seen.set(key, {face, cell: c, count: 1});
    }
  });
  const triangles = [];
  const owner = [];
  const used = new Set();
  for (const {face, cell: c, count} of seen.values()) {
    if (count !== 1) continue;
    const [a, b, d] = face;
    const normal = cross(sub(vertices[b], vertices[a]),
        sub(vertices[d], vertices[a]));
    const opposite = cells[c].find((v) => !face.includes(v));
    const inward = sub(vertices[opposite], vertices[a]);
    triangles.push(dot(normal, inward) > 0 ? [a, d, b] : [a, b, d]);
    owner.push(c);
    face.forEach((v) => used.add(v));
  }
  return {
    vertices: [...used].sort((p, q) => p - q),
    triangles,
    cell: owner,
  };
}

/**
 * Alfeld split of a triangle surface: each triangle gets its barycentre and is
 * cut into three children, each keeping the orientation of its parent.
 *
 * @param {number[][]} vertices Vertex coordinates.
 * @param {number[][]} triangles Triangles as three vertex indices.
 * @return {{vertices: number[][], triangles: number[][], parent: number[]}}
 *     The new vertices follow the old ones, one per triangle.
 */
export function alfeldSplit(vertices, triangles) {
  const out = vertices.map((v) => v.slice());
  const children = [];
  const parent = [];
  triangles.forEach((t, p) => {
    const g = out.length;
    out.push([0, 1, 2].map((k) => (
      vertices[t[0]][k] + vertices[t[1]][k] + vertices[t[2]][k]) / 3));
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      children.push([g, t[i], t[j]]);
      parent.push(p);
    }
  });
  return {vertices: out, triangles: children, parent};
}
