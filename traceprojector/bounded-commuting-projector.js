/**
 * Locally L2-bounded projections onto the lowest-order Whitney spaces that
 * commute with the exterior derivative for every input, without any boundary
 * condition (Ern, Guzman, Potu and Vohralik, arXiv:2502.03601, Theorem 5.1
 * with p = 0):
 *
 *   Pi u = sum over all entities sigma of  (Z(sigma), u) W_sigma .
 *
 * The coefficients are integrals of the input against local weights, so the
 * input needs only to be in L2; no point value, edge integral or face flux is
 * taken, on the boundary either. The projection does not preserve traces: a
 * field with a polynomial trace is not reproduced on the boundary. It is the
 * zero-trace projection with the boundary condition removed, so it shares its
 * implementation.
 */

import {ZeroTraceProjector} from './zero-trace-projector.js';

export class BoundedCommutingProjector extends ZeroTraceProjector {
  /**
   * @param {!Array<!Array<number>>} vertices
   * @param {!Array<!Array<number>>} tetrahedra
   * @param {{quadratureOrder: (number|undefined)}=} options - Gauss points per
   *   direction for the weight integrals (default 4).
   */
  constructor(vertices, tetrahedra, options = {}) {
    super(vertices, tetrahedra, {...options, boundaryConditions: false});
  }
}
