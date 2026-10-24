/**
 * Reads a Gmsh mesh file (ASCII formats 2.x and 4.1) into the two arrays every
 * operator takes. Only first-order tetrahedra (element type 4) become cells;
 * points, lines and triangles are counted in `skipped`. Binary files, other
 * versions, hexahedra, prisms, pyramids and second-order tetrahedra raise a
 * `ValidateError`, as does any file whose tetrahedra do not make a valid mesh.
 * @param text - The contents of the `.msh` file.
 * @param options.orient - Reorder the vertices of negatively oriented
 *   tetrahedra so that all are positively oriented, as `Mesh` and `Projector`
 *   require (default true).
 * @returns The mesh and how many elements of each ignored kind the file held.
 * @throws ValidateError If the text cannot be used as a mesh.
 */
export function parseGmsh(
  text: string,
  options?: { orient?: boolean },
): {
  vertices: number[][];
  tetrahedra: number[][];
  skipped: Record<string, number>;
};
