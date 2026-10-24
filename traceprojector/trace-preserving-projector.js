/**
 * The full projection of Ern, Guzman, Potu and Vohralik at lowest order:
 *
 *   Pi = mPi (I - Pi_boundary) + Pi_boundary
 *
 * where mPi is the zero-trace projection (ZeroTraceProjector) and
 * Pi_boundary the boundary operator (BoundaryProjector). It is a projection
 * onto the lowest-order Whitney forms, preserves the discrete trace on the
 * boundary and commutes with the exterior derivative, and each coefficient
 * depends only on a patch of cells around its entity.
 *
 * The input is a field `u(x)` and its derivative `du(x)`: the gradient of a
 * 0-form, the curl of a 1-form or the divergence of a 2-form (none for a
 * 3-form). Both must be defined throughout the domain.
 */

import {ProjectError, ValidateError} from './errors.js';
import {HighOrderTracePreserving} from './high-order-trace-preserving.js';
import {BoundaryProjector} from './boundary-projector.js';
import {ZeroTraceProjector} from './zero-trace-projector.js';
import {integrateTetrahedron} from './simplicial-complex.js';
import {validateMeshInput} from './mesh.js';

const add = (a, b) => (typeof a === 'number' ?
  a + b : a.map((q, i) => q + b[i]));

export class TracePreservingProjector {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} tetrahedra Tetrahedra as four vertex indices.
   * @param {{quadratureOrder: (number|undefined)}=} options
   */
  constructor(vertices, tetrahedra, options = {}) {
    validateMeshInput(vertices, tetrahedra, {allowFlipped: true});
    this.degree = options.degree ?? 0;
    if (!Number.isInteger(this.degree) || this.degree < 0) {
      throw new ValidateError('degree must be a nonnegative integer');
    }
    if (this.degree > 0) {
      // Above the lowest order the operator works field by field (see
      // HighOrderTracePreserving); there are no Whitney coefficients.
      this.high = new HighOrderTracePreserving(vertices, tetrahedra, {
        degree: this.degree,
        quadratureOrder: options.quadratureOrder,
      });
      this.complex = this.high.complex;
      return;
    }
    this.zero = new ZeroTraceProjector(vertices, tetrahedra, options);
    this.boundary = new BoundaryProjector(vertices, tetrahedra, options);
    this.complex = this.boundary.orig;
    this.order = options.quadratureOrder ?? 4;
    this.cache = new WeakMap();
    this.single = new WeakMap();
  }

  /**
   * Pi u in degree l as a lazy field: its value and its exterior derivative
   * at a point of a cell. Works at every degree; above the lowest order it is
   * the only way to evaluate the operator.
   * @return {{value: function(number[], number): (number|number[]),
   *     derivative: function(number[], number): (number|number[])}}
   */
  local(u, du, l) {
    if (this.high) return this.high.local(u, du, l);
    return {
      value: (x, c) => this.project(u, du, x, c, l),
      derivative: () => {
        throw new ValidateError('derivative needs degree > 0');
      },
    };
  }

  /** @private */
  requireWhitney() {
    if (this.high) {
      throw new ValidateError(
          'coefficients are defined at degree 0 only; use local() or project()');
    }
  }

  /** Boundary entities of degree l as `{entity, alpha(u, du)}` records. */
  boundaryEntities(l) {
    const {complex, orig} = this.boundary;
    if (l === 0) {
      const seen = new Set(complex.triangles.flat());
      return [...seen].map((r) => ({
        entity: r,
        alpha: (u, du) => this.boundary.alpha0(r, u, du),
      }));
    }
    if (l === 1) {
      return complex.edges.map((pair, r) => ({
        entity: orig.edgeIndex(...pair),
        alpha: (u, du) => this.boundary.alpha1(r, u, du),
      }));
    }
    return complex.triangles.map((triangle, r) => ({
      entity: orig.faceIndex(...triangle),
      alpha: (u, du) => this.boundary.alpha2(r, u, du),
    }));
  }

  /**
   * The coefficients of Pi_boundary u on the boundary entities of degree l,
   * computed on first use.
   * @return {{get: function(number): (number|undefined)}} Entity number to
   *     coefficient; undefined for an entity that is not on the boundary.
   */
  boundaryCoefficients(u, du, l) {
    const known = new Map();
    if (l === 3) {
      return {
        get: (c) => {
          if (!known.has(c)) {
            const {points} = this.complex.geometry(c);
            known.set(c, integrateTetrahedron(points, u, this.order));
          }
          return known.get(c);
        },
      };
    }
    const records = new Map(this.boundaryEntities(l).map(
        (record) => [record.entity, record]));
    return {
      get: (entity) => {
        if (!records.has(entity)) return undefined;
        if (!known.has(entity)) {
          known.set(entity, records.get(entity).alpha(u, du));
        }
        return known.get(entity);
      },
    };
  }

  /** Value of the boundary operator's output at x in a cell. */
  boundaryValue(coefficients, l, x, c) {
    const basis = this.complex.whitney(c, l, x);
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0];
    this.complex.cellEntities(c, l).forEach((entity, k) => {
      const coefficient = coefficients.get(entity);
      if (!coefficient) return;
      total = add(total, typeof total === 'number' ?
        coefficient * basis[k] : basis[k].map((q) => coefficient * q));
    });
    return total;
  }

  /** The field u - Pi_boundary u, for the zero-trace projection. */
  residual(u, coefficients, l) {
    return (x, c) => {
      const part = this.boundaryValue(coefficients, l, x, c);
      const value = u(x);
      return typeof value === 'number' ?
        value - part : value.map((q, i) => q - part[i]);
    };
  }

  /**
   * All Whitney coefficients of Pi u in degree l.
   * @param {function(number[]): (number|number[])} u
   * @param {?function(number[]): (number|number[])} du
   * @param {number} l
   * @return {Float64Array} Coefficient of each entity of degree l.
   */
  coefficients(u, du, l) {
    this.requireWhitney();
    let perDegree = this.cache.get(u);
    if (!perDegree) {
      perDegree = new Map();
      this.cache.set(u, perDegree);
    }
    if (perDegree.has(l)) return perDegree.get(l);
    const boundary = this.boundaryCoefficients(u, du, l);
    const residual = this.residual(u, boundary, l);
    const count = [
      this.complex.vertices.length,
      this.complex.edges.length,
      this.complex.faces.length,
      this.complex.cells.length,
    ][l];
    const out = new Float64Array(count);
    for (let entity = 0; entity < count; entity++) {
      const own = boundary.get(entity);
      out[entity] = own !== undefined ?
        own :
        this.zero.coefficient(residual, l, entity);
      if (!Number.isFinite(out[entity])) {
        throw new ProjectError(
            `coefficient of degree ${l} entity ${entity} is not finite`);
      }
    }
    perDegree.set(l, out);
    return out;
  }

  /**
   * One Whitney coefficient of Pi u, computed without the others.
   * @return {number}
   */
  coefficient(u, du, l, entity) {
    this.requireWhitney();
    let perDegree = this.single.get(u);
    if (!perDegree) {
      perDegree = new Map();
      this.single.set(u, perDegree);
    }
    if (!perDegree.has(l)) {
      const boundary = this.boundaryCoefficients(u, du, l);
      perDegree.set(l, {
        boundary,
        residual: this.residual(u, boundary, l),
      });
    }
    const {boundary, residual} = perDegree.get(l);
    const own = boundary.get(entity);
    return own !== undefined ? own : this.zero.coefficient(residual, l, entity);
  }

  /**
   * Value of Pi u at a point of a cell.
   * @return {number|number[]}
   */
  project(u, du, point, cell, l) {
    if (this.high) return this.high.local(u, du, l).value(point, cell);
    const coefficients = this.coefficients(u, du, l);
    const basis = this.complex.whitney(cell, l, point);
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0];
    this.complex.cellEntities(cell, l).forEach((entity, k) => {
      total = add(total, typeof total === 'number' ?
        coefficients[entity] * basis[k] :
        basis[k].map((q) => coefficients[entity] * q));
    });
    return total;
  }
}
