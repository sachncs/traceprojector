import type {ZeroTraceProjector} from './zero-trace-projector.js';

/**
 * Commuting, discrete-trace preserving projection with a stable interior
 * part: `Pi u = Pi_boundary u + Pi_zero (u - Pi_boundary u)`.
 *
 * The interior part is the locally L2-bounded zero-trace projection of
 * {@link ZeroTraceProjector}, so inputs that are unbounded at an interior
 * mesh vertex are projected stably. The boundary part uses canonical degrees
 * of freedom (point values, edge integrals, face fluxes), so the input must
 * have finite such values on the boundary; the paper's weight-based boundary
 * operator, which tolerates rough boundary data, is not implemented. The
 * projection commutes with the exterior derivative for fields with a
 * piecewise polynomial trace.
 */
export class StableProjector {
  /**
   * @param vertices - Vertex coordinates.
   * @param tetrahedra - Four vertex numbers per tetrahedron.
   * @param options.quadratureOrder - Gauss points per direction (default 4).
   * @param options.interior - An existing zero-trace projector on the same mesh, to share its weights.
   */
  constructor(
    vertices: number[][],
    tetrahedra: number[][],
    options?: { quadratureOrder?: number; interior?: ZeroTraceProjector },
  );

  /** Coefficient of the Whitney form of an entity in the projection of `u`. */
  coefficient(u: (point: number[]) => number | number[], l: number, entity: number): number;

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
}
