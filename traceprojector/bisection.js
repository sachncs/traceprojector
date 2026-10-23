/**
 * Conforming adaptive refinement of a tetrahedral mesh by longest-edge
 * bisection (Rivara). To bisect a cell, every cell around its longest edge is
 * first brought to the same longest edge (by bisecting the others first), and
 * then all of them are split at the edge midpoint, so no hanging node is ever
 * created. A split replaces one end of the edge by the midpoint, which halves
 * the signed volume and keeps the orientation.
 */

import {ValidateError} from './errors.js';

const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

/**
 * @param {number[][]} vertices Vertex coordinates.
 * @param {number[][]} tetrahedra Tetrahedra as four vertex indices.
 * @param {number[]} marked Cells to bisect.
 * @return {{vertices: number[][], tetrahedra: number[][], parent:
 *     number[]}} The refined mesh (original vertices first), and for every
 *     new cell the index of the cell of the input it came from.
 */
export function refineTetrahedra(vertices, tetrahedra, marked) {
  for (const m of marked) {
    if (!Number.isInteger(m) || m < 0 || m >= tetrahedra.length) {
      throw new ValidateError(`marked cell ${m} is not a cell of the mesh`);
    }
  }
  const coordinates = vertices.map((v) => v.slice());
  const cells = tetrahedra.map((t) => t.slice());
  const origin = tetrahedra.map((_, i) => i);
  const alive = new Array(cells.length).fill(true);
  const midpoints = new Map();

  const length = (a, b) => Math.hypot(
      ...coordinates[a].map((q, i) => q - coordinates[b][i]));

  /** The longest edge of a cell; ties go to the smaller vertex pair. */
  const longestEdge = (c) => {
    let best = null;
    for (const [i, j] of EDGES) {
      const [a, b] = [cells[c][i], cells[c][j]].sort((p, q) => p - q);
      const size = length(a, b);
      if (!best || size > best.size * (1 + 1e-12) ||
          (Math.abs(size - best.size) <= best.size * 1e-12 &&
            (a < best.a || (a === best.a && b < best.b)))) {
        best = {a, b, size};
      }
    }
    return best;
  };

  const around = (a, b) => {
    const out = [];
    cells.forEach((cell, c) => {
      if (alive[c] && cell.includes(a) && cell.includes(b)) out.push(c);
    });
    return out;
  };

  const bisect = (c) => {
    for (;;) {
      const {a, b} = longestEdge(c);
      const neighbours = around(a, b);
      const other = neighbours.find((n) => {
        const edge = longestEdge(n);
        return edge.a !== a || edge.b !== b;
      });
      if (other !== undefined) {
        bisect(other);
        if (!alive[c]) return;
        continue;
      }
      let m = midpoints.get(key(a, b));
      if (m === undefined) {
        m = coordinates.length;
        coordinates.push(
            coordinates[a].map((q, i) => (q + coordinates[b][i]) / 2));
        midpoints.set(key(a, b), m);
      }
      for (const n of neighbours) {
        alive[n] = false;
        for (const end of [a, b]) {
          cells.push(cells[n].map((v) => (v === end ? m : v)));
          origin.push(origin[n]);
          alive.push(true);
        }
      }
      return;
    }
  };

  for (const m of marked) {
    if (alive[m]) bisect(m);
  }
  const keep = cells.map((_, c) => c).filter((c) => alive[c]);
  return {
    vertices: coordinates,
    tetrahedra: keep.map((c) => cells[c]),
    parent: keep.map((c) => origin[c]),
  };
}
