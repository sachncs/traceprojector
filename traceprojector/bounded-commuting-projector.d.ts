import type {ZeroTraceProjector} from './zero-trace-projector.js';

/**
 * Locally L2-bounded projections onto the lowest-order Whitney spaces that
 * commute with the exterior derivative for every input, without boundary
 * conditions (arXiv:2502.03601, Thm 5.1, p = 0). The input needs only to be in
 * L2, on the boundary as well. Traces are not preserved.
 */
export class BoundedCommutingProjector extends ZeroTraceProjector {
  /**
   * @param vertices - Vertex coordinates.
   * @param tetrahedra - Four vertex numbers per tetrahedron.
   * @param options.quadratureOrder - Gauss points per direction (default 4).
   */
  constructor(
    vertices: number[][],
    tetrahedra: number[][],
    options?: { quadratureOrder?: number },
  );
}
