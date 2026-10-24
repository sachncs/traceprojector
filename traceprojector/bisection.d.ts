/**
 * Conforming adaptive refinement by longest-edge bisection (Rivara): bisects
 * the marked cells, first bisecting any neighbour around the longest edge that
 * has a different longest edge, so no hanging node is created.
 * @param vertices - Vertex coordinates.
 * @param tetrahedra - Four vertex numbers per tetrahedron.
 * @param marked - Cells to bisect.
 * @returns The refined mesh (original vertices first) and, for every new cell,
 *   the cell of the input it came from.
 */
export function refineTetrahedra(
  vertices: number[][],
  tetrahedra: number[][],
  marked: number[],
): { vertices: number[][]; tetrahedra: number[][]; parent: number[] };
