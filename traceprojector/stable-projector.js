/**
 * Commuting, discrete-trace preserving projection with a stable interior part.
 *
 *   Pi u = Pi_boundary u + Pi_zero(u - Pi_boundary u),
 *
 * the decomposition of Ern, Guzman and Potu (arXiv:2604.28103, Theorem 3.1).
 * Pi_zero is the locally L2-bounded zero-trace projection of
 * {@link ZeroTraceProjector}, so the interior coefficients need only u in L2:
 * an input that is unbounded at an interior mesh vertex is projected stably.
 *
 * Pi_boundary here uses the classical canonical degrees of freedom of the
 * entities on the boundary (vertex values, edge circulations, face fluxes).
 * It preserves traces and commutes with the exterior derivative on the
 * boundary, which is all the decomposition needs, but it requires those
 * degrees of freedom to exist. The paper's weight-based boundary operator,
 * which also tolerates rough boundary data, is not implemented. The input
 * must therefore have finite point values, edge integrals and face fluxes on
 * the boundary of the domain.
 */

import {ZeroTraceProjector} from './zero-trace-projector.js';
import {tetrahedronRule, dot} from './simplicial-complex.js';
import {ProjectError} from './errors.js';

/** Quadrature order for the overlap of weights and boundary Whitney forms
 * (degree 2). */
const OVERLAP_ORDER = 3;

export class StableProjector {
  /**
   * @param {!Array<!Array<number>>} vertices
   * @param {!Array<!Array<number>>} tetrahedra
   * @param {{quadratureOrder: (number|undefined), interior:
   *     (ZeroTraceProjector|undefined)}=} options -
   *   `quadratureOrder`: Gauss points per direction for the weight integrals
   *   and boundary degrees of freedom (default 4). `interior`: an existing
   *   zero-trace projector on the same mesh, to share its computed weights.
   */
  constructor(vertices, tetrahedra, options = {}) {
    this.interior =
      options.interior ?? new ZeroTraceProjector(vertices, tetrahedra, options);
    this.weights = this.interior.weights;
    this.complex = this.weights.base;
    this.quadratureOrder = this.interior.quadratureOrder;
    this.overlaps = [new Map(), new Map(), new Map(), new Map()];
    this.degreeCache = new WeakMap();
  }

  /**
   * Canonical degree of freedom of u on a boundary entity.
   * @private
   */
  boundaryDegreeOfFreedom(u, l, entity) {
    let perDegree = this.degreeCache.get(u);
    if (!perDegree) {
      perDegree = [new Map(), new Map(), new Map(), new Map()];
      this.degreeCache.set(u, perDegree);
    }
    const cache = perDegree[l];
    if (cache.has(entity)) return cache.get(entity);
    const value = this.complex.degreeOfFreedom(
        l,
        entity,
        u,
        this.quadratureOrder,
    );
    if (!Number.isFinite(value)) {
      throw new ProjectError(
          `the degree of freedom of boundary entity ${entity} (degree ${l}) is not finite; ` +
          'the stable projection needs finite point values, edge integrals and face fluxes on the boundary',
      );
    }
    cache.set(entity, value);
    return value;
  }

  /**
   * (Z(sigma), W_rho) for every boundary entity rho whose Whitney form meets
   * the support of the weight of the interior entity sigma.
   * @private
   */
  overlap(l, sigma) {
    const cache = this.overlaps[l];
    if (cache.has(sigma)) return cache.get(sigma);
    const weight = this.weights.weight(l, sigma);
    const totals = new Map();
    for (const s of weight.cells) {
      const c = s >> 2;
      const entities = this.complex.cellEntities(c, l);
      if (!entities.some((e) => this.weights.isBoundary(l, e))) continue;
      for (const {x, weight: w} of tetrahedronRule(
          this.weights.split.geometry(s).points,
          OVERLAP_ORDER,
      )) {
        const z = this.weights.evaluate(l, weight.dofs, s, x);
        const basis = this.complex.whitney(c, l, x);
        entities.forEach((e, k) => {
          if (!this.weights.isBoundary(l, e)) return;
          const value =
            w * (typeof z === 'number' ? z * basis[k] : dot(z, basis[k]));
          totals.set(e, (totals.get(e) ?? 0) + value);
        });
      }
    }
    const result = [...totals];
    cache.set(sigma, result);
    return result;
  }

  /**
   * Coefficient of the Whitney form of an entity in Pi u.
   * @param {function(!Array<number>): (number|!Array<number>)} u
   * @param {number} l
   * @param {number} entity
   * @return {number}
   */
  coefficient(u, l, entity) {
    if (this.weights.isBoundary(l, entity)) {
      return this.boundaryDegreeOfFreedom(u, l, entity);
    }
    let total = this.interior.coefficient(u, l, entity);
    for (const [boundaryEntity, value] of this.overlap(l, entity)) {
      total -= this.boundaryDegreeOfFreedom(u, l, boundaryEntity) * value;
    }
    return total;
  }

  /**
   * Value of Pi u at a point of a cell.
   * @param {function(!Array<number>): (number|!Array<number>)} u
   * @param {!Array<number>} point
   * @param {number} cell
   * @param {number} l - Form degree: 0 and 3 take a scalar field, 1 and 2 a
   *     vector field.
   * @return {(number|!Array<number>)}
   */
  project(u, point, cell, l) {
    const entities = this.complex.cellEntities(cell, l);
    const basis = this.complex.whitney(cell, l, point);
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0];
    entities.forEach((entity, k) => {
      const c = this.coefficient(u, l, entity);
      total =
        typeof total === 'number' ?
          total + c * basis[k] :
          [
            total[0] + c * basis[k][0],
            total[1] + c * basis[k][1],
            total[2] + c * basis[k][2],
          ];
    });
    return total;
  }
}
