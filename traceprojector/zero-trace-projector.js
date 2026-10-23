/**
 * Locally L2-bounded commuting projections onto the lowest-order Whitney
 * spaces with zero trace on the whole boundary (Ern, Guzman, Potu and
 * Vohralik, arXiv:2502.03601, Theorem 6.1 with p = 0):
 *
 *   Pi u = sum over interior entities sigma of  (Z(sigma), u) W_sigma .
 *
 * The coefficients are integrals of the input against the local weights, so
 * the operator needs only u in L2: no point values, edge integrals or face
 * fluxes of u are taken.
 */

import { LocalWeights } from './local-weights.js'
import { ProjectError } from './errors.js'

export class ZeroTraceProjector {
  /**
   * @param {!Array<!Array<number>>} vertices
   * @param {!Array<!Array<number>>} tetrahedra
   * @param {{quadratureOrder: (number|undefined)}=} options - Gauss points per
   *   direction for the weight integrals (default 4).
   */
  constructor (vertices, tetrahedra, options = {}) {
    this.weights = new LocalWeights(vertices, tetrahedra)
    this.quadratureOrder = options.quadratureOrder ?? 4
    this.coefficientCache = new WeakMap()
  }

  /**
   * Coefficient of the Whitney form of an entity: (Z(sigma), u).
   * @param {function(!Array<number>): (number|!Array<number>)} u
   * @param {number} l - Form degree.
   * @param {number} index - Entity number in the projector's complex.
   * @return {number}
   */
  coefficient (u, l, index) {
    let perDegree = this.coefficientCache.get(u)
    if (!perDegree) {
      perDegree = [new Map(), new Map(), new Map(), new Map()]
      this.coefficientCache.set(u, perDegree)
    }
    const cache = perDegree[l]
    if (cache.has(index)) return cache.get(index)
    const value = this.weights.pair(l, index, u, this.quadratureOrder)
    if (!Number.isFinite(value)) {
      throw new ProjectError(`coefficient of degree ${l} entity ${index} is not finite`)
    }
    cache.set(index, value)
    return value
  }

  /**
   * Value of Pi u at a point of a cell.
   * @param {function(!Array<number>): (number|!Array<number>)} u
   * @param {!Array<number>} point
   * @param {number} cell - Cell number.
   * @param {number} l - Form degree: 0 and 3 take a scalar field, 1 and 2 a vector field.
   * @return {(number|!Array<number>)}
   */
  project (u, point, cell, l) {
    const complex = this.weights.base
    const entities = complex.cellEntities(cell, l)
    const basis = complex.whitney(cell, l, point)
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0]
    entities.forEach((entity, k) => {
      if (this.weights.isBoundary(l, entity)) return
      const c = this.coefficient(u, l, entity)
      total = typeof total === 'number'
        ? total + c * basis[k]
        : [total[0] + c * basis[k][0], total[1] + c * basis[k][1], total[2] + c * basis[k][2]]
    })
    return total
  }
}
