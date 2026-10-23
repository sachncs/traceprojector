/**
 * Canonical (Arnold-Falk-Winther) interpolation onto the polynomial spaces
 * P_r^- Lambda^k of any degree r = p + 1: Lagrange (l = 0), Nedelec of the
 * first kind (l = 1), Raviart-Thomas (l = 2) and discontinuous (l = 3)
 * elements. It is a projection, preserves the boundary trace and commutes
 * with the exterior derivative; the degrees of freedom are moments of the
 * pull-back of the input to each edge, face and cell, so the input must be
 * regular enough for them to exist and the operator is not L2-stable.
 */
export class CanonicalProjector {
  /**
   * @param vertices - Vertex coordinates.
   * @param tetrahedra - Four vertex numbers per tetrahedron.
   * @param options.degree - Polynomial degree p of the library's convention
   *   (default 0, the Whitney space).
   * @param options.quadratureOrder - Gauss points per direction.
   */
  constructor(
    vertices: number[][],
    tetrahedra: number[][],
    options?: { degree?: number; quadratureOrder?: number },
  );

  /** Number of degrees of freedom in form degree l. */
  size(l: number): number;

  /**
   * All canonical degrees of freedom of the input.
   * @param u - Scalar field for l = 0, 3 and vector field for l = 1, 2.
   * @param l - Form degree.
   */
  coefficients(u: (point: number[]) => number | number[], l: number): Float64Array;

  /**
   * Value of the interpolant with the given coefficients at a point of a cell.
   * @param coefficients - From `coefficients`.
   */
  evaluate(coefficients: Float64Array, point: number[], cell: number, l: number): number | number[];

  /**
   * Value of the exterior derivative of the interpolant: the gradient (l = 0),
   * the curl (l = 1) or the divergence (l = 2).
   */
  derivative(coefficients: Float64Array, point: number[], cell: number, l: number): number | number[];

  /** Value of the interpolant of u at a point of a cell. */
  project(u: (point: number[]) => number | number[], point: number[], cell: number, l: number): number | number[];
}
