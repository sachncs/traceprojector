/**
 * Worsey-Farin split of a tetrahedral mesh: every cell receives its centroid,
 * every face its barycentre, and each cell is cut into twelve children, one per
 * edge of each face, spanned by the cell centroid, the face barycentre and the
 * edge. Used by the boundary operator to extend functions given on the
 * boundary into the bulk.
 */

import {ValidateError} from './errors.js';

const FACE_TRIPLES = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2],
];

const centroid = (points) =>
  [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);

const signedVolume = (a, b, c, d) => {
  const u = b.map((q, i) => q - a[i]);
  const v = c.map((q, i) => q - a[i]);
  const w = d.map((q, i) => q - a[i]);
  return u[0] * (v[1] * w[2] - v[2] * w[1]) -
    u[1] * (v[0] * w[2] - v[2] * w[0]) +
    u[2] * (v[0] * w[1] - v[1] * w[0]);
};

/**
 * @param {number[][]} vertices Vertex coordinates.
 * @param {number[][]} cells Tetrahedra as four vertex indices.
 * @return {{vertices: number[][], cells: number[][], parent: number[],
 *     cellVertex: number[], faceVertex: Map<string, number>}} The split mesh.
 *     The original vertices come first, then one vertex per cell, then one per
 *     face; `parent[i]` is the cell that child `i` came from, and
 *     `faceVertex` maps a face's sorted vertex key `a_b_c` to its new vertex.
 *     Children have positive orientation.
 */
export function worseyFarinSplit(vertices, cells) {
  if (!Array.isArray(vertices) || !Array.isArray(cells)) {
    throw new ValidateError('worseyFarinSplit needs vertices and cells');
  }
  const out = vertices.map((v) => v.slice());
  const cellVertex = [];
  const faceVertex = new Map();
  const children = [];
  const parent = [];
  for (const cell of cells) {
    cellVertex.push(out.length);
    out.push(centroid(cell.map((i) => vertices[i])));
  }
  cells.forEach((cell, c) => {
    for (const [i, j, k] of FACE_TRIPLES) {
      const face = [cell[i], cell[j], cell[k]];
      const key = [...face].sort((p, q) => p - q).join('_');
      let g = faceVertex.get(key);
      if (g === undefined) {
        g = out.length;
        faceVertex.set(key, g);
        out.push(centroid(face.map((v) => vertices[v])));
      }
      for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
        const child = [cellVertex[c], g, face[a], face[b]];
        if (signedVolume(...child.map((v) => out[v])) < 0) {
          [child[2], child[3]] = [child[3], child[2]];
        }
        children.push(child);
        parent.push(c);
      }
    }
  });
  return {vertices: out, cells: children, parent, cellVertex, faceVertex};
}
