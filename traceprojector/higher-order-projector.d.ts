/**
 * Locally L2-bounded commuting projections onto the finite element spaces of
 * degree p + 1 (Lagrange, Nedelec, Raviart-Thomas, discontinuous), after
 * Arnold and Guzman (ESAIM M2AN 55, 2021): pi = P + Q (I - P), with P the
 * lowest-order projection built from local weight functions and Q the
 * correction onto the forms without lowest-order degrees of freedom. It is a
 * projection, commutes with the exterior derivative for every L2 input with
 * an L2 derivative, and each coefficient depends only on the input near its
 * entity. The weights are sparse local solves (a few seconds each at p = 1),
 * and the mesh must be fine enough that its extended stars are balls. It does
 * not preserve nonzero boundary traces; with `boundaryConditions` it maps into
 * the forms with zero trace.
 */
export class HigherOrderProjector {
  /**
   * @param vertices - Vertex coordinates.
   * @param tetrahedra - Four vertex numbers per tetrahedron.
   * @param options.degree - Polynomial degree p (default 0; the spaces have
   *   degree p + 1).
   * @param options.quadratureOrder - Gauss points per direction.
   * @param options.boundaryConditions - Zero trace on the boundary of the
   *   domain: the weights of boundary entities vanish (default false).
   */
  constructor(
    vertices: number[][],
    tetrahedra: number[][],
    options?: {
      degree?: number;
      quadratureOrder?: number;
      boundaryConditions?: boolean;
    },
  );

  /**
   * Lazy evaluation of the projection of a field: only the coefficients that a
   * cell needs are computed.
   * @param u - Scalar field for l = 0, 3 and vector field for l = 1, 2.
   * @param l - Form degree.
   * @returns Functions giving the value of the projection, and of its exterior
   *   derivative (gradient, curl or divergence), at a point of a cell.
   */
  local(
    u: (point: number[]) => number | number[],
    l: number,
  ): {
    value: (point: number[], cell: number) => number | number[];
    derivative: (point: number[], cell: number) => number | number[];
  };

  /**
   * All coefficients of the projection: those on the Whitney forms and those
   * of the correction on the basis of the space of degree l.
   */
  coefficients(
    u: (point: number[]) => number | number[],
    l: number,
  ): { lowest: Float64Array; correction: Float64Array };

  /** Value of the projection with the given coefficients at a point of a cell. */
  evaluate(
    coefficients: { lowest: Float64Array; correction: Float64Array },
    point: number[],
    cell: number,
    l: number,
  ): number | number[];
}
