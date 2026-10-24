/**
 * The full lowest-order projection of Ern, Guzman, Potu and Vohralik:
 * Pi = mPi (I - Pi_boundary) + Pi_boundary. It is a projection onto the
 * lowest-order Whitney forms, preserves the discrete trace on the boundary and
 * commutes with the exterior derivative for fields whose trace is a
 * lowest-order trace; each coefficient depends on a patch of cells around its
 * entity. Validation-scale: it needs a mesh fine enough that the extended
 * stars are balls, and takes minutes on a 4 x 4 x 4 cube.
 */
export class TracePreservingProjector {
  /**
   * @param vertices - Vertex coordinates.
   * @param tetrahedra - Four vertex numbers per tetrahedron.
   * @param options.quadratureOrder - Gauss points per direction (default 4).
   */
  constructor(
    vertices: number[][],
    tetrahedra: number[][],
    options?: { quadratureOrder?: number; degree?: number },
  );

  /**
   * Pi u as a lazy field: its value and its exterior derivative at a point of
   * a cell. At degree > 0 this is how the operator is evaluated.
   */
  local(
    u: (point: number[]) => number | number[],
    du: ((point: number[]) => number | number[]) | null,
    l: number,
  ): {
    value: (point: number[], cell: number) => number | number[];
    derivative: (point: number[], cell: number) => number | number[];
  };

  /**
   * All Whitney coefficients of the projection in degree l.
   * @param u - Scalar (l = 0, 3) or vector (l = 1, 2) field.
   * @param du - Its derivative: the gradient (l = 0), the curl (l = 1) or the
   *   divergence (l = 2); unused for l = 3.
   * @param l - Form degree.
   */
  coefficients(
    u: (point: number[]) => number | number[],
    du: ((point: number[]) => number | number[]) | null,
    l: number,
  ): Float64Array;

  /**
   * One Whitney coefficient of the projection, computed without the others.
   * @param entity - Entity number in the projector's complex.
   */
  coefficient(
    u: (point: number[]) => number | number[],
    du: ((point: number[]) => number | number[]) | null,
    l: number,
    entity: number,
  ): number;

  /**
   * Value of the projection at a point of a cell.
   * @param cell - Cell number.
   * @param l - Form degree.
   */
  project(
    u: (point: number[]) => number | number[],
    du: ((point: number[]) => number | number[]) | null,
    point: number[],
    cell: number,
    l: number,
  ): number | number[];
}
