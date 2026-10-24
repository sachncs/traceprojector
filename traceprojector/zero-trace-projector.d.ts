/**
 * Locally L2-bounded commuting projections onto the lowest-order Whitney
 * spaces with zero trace on the whole boundary (arXiv:2502.03601, Thm 6.1,
 * p = 0). The coefficients are integrals of the input against local weight
 * functions, so the input needs only to be in L2.
 */
export class ZeroTraceProjector {
  /**
   * @param vertices - Vertex coordinates.
   * @param tetrahedra - Four vertex numbers per tetrahedron.
   * @param options.quadratureOrder - Gauss points per direction for the weight integrals (default 4).
   */
  constructor(
    vertices: number[][],
    tetrahedra: number[][],
    options?: { quadratureOrder?: number; boundaryConditions?: boolean },
  );

  /**
   * Coefficient of the Whitney form of an entity: the integral of the input
   * against the entity's weight.
   * @param u - Scalar (l = 0, 3) or vector (l = 1, 2) field.
   * @param l - Form degree.
   * @param index - Entity number in the projector's complex.
   */
  coefficient(u: (point: number[]) => number | number[], l: number, index: number): number;

  /**
   * Value of the projection at a point of a cell.
   * @param u - Scalar (l = 0, 3) or vector (l = 1, 2) field.
   * @param point - Cartesian point inside the cell.
   * @param cell - Cell number.
   * @param l - Form degree.
   */
  project(
    u: (point: number[]) => number | number[],
    point: number[],
    cell: number,
    l: number,
  ): number | number[];

  /**
   * Number of entities of form degree l in the projector's numbering: the
   * vertices (0), edges (1), faces (2) or cells (3). The entity numbers that
   * `coefficient` takes run from 0 to this count minus one.
   * @param l - Form degree, 0 to 3.
   */
  count(l: number): number;

  /**
   * The two vertices of an edge, in the numbering of the input mesh.
   * @param index - Edge number, from 0 to `count(1) - 1`.
   */
  edge(index: number): [number, number];
}
