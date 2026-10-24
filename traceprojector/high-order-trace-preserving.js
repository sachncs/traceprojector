/**
 * The trace-preserving projection of Ern, Guzman and Potu above the lowest
 * order:
 *
 *   Pi u = Pi_boundary u + zero_trace_pi (u - Pi_boundary u)
 *
 * where Pi_boundary (HighOrderBoundary) reproduces the discrete trace on the
 * boundary and is zero away from it, and zero_trace_pi is the locally bounded
 * commuting projection of Arnold and Guzman with a zero trace on the boundary
 * (HigherOrderProjector with boundaryConditions). For the 3-forms there is no
 * trace and Pi_boundary u is the mean on each cell.
 */

import {HighOrderBoundary} from './high-order-boundary.js';
import {HigherOrderProjector} from './higher-order-projector.js';
import {integrateTetrahedron} from './simplicial-complex.js';

const subtract = (a, b) => (typeof a === 'number' ? a - b :
  a.map((q, i) => q - b[i]));
const add = (a, b) => (typeof a === 'number' ? a + b :
  a.map((q, i) => q + b[i]));

export class HighOrderTracePreserving {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} cells Tetrahedra as four vertex indices.
   * @param {{degree: number, quadratureOrder: (number|undefined)}} options
   *     `degree` is p >= 1.
   */
  constructor(vertices, cells, options) {
    this.options = options;
    this.boundary = new HighOrderBoundary(vertices, cells, options);
    this.zero = new HigherOrderProjector(vertices, cells,
        {...options, boundaryConditions: true});
    this.complex = this.boundary.complex;
    this.cache = new WeakMap();
  }

  /**
   * Pi u in degree l, evaluated lazily: its value and its exterior
   * derivative at a point of a cell.
   * @param {function(number[]): (number|number[])} u The field.
   * @param {?function(number[]): (number|number[])} du Its derivative (the
   *     gradient, the curl or the divergence); not needed for l = 3.
   * @param {number} l Form degree.
   * @return {{value: function(number[], number): (number|number[]),
   *     derivative: function(number[], number): (number|number[])}}
   */
  local(u, du, l) {
    let perDegree = this.cache.get(u);
    if (!perDegree) {
      perDegree = new Map();
      this.cache.set(u, perDegree);
    }
    if (perDegree.has(l)) return perDegree.get(l);
    let boundary;
    if (l === 3) {
      const means = new Map();
      const mean = (c) => {
        if (!means.has(c)) {
          const {points, volume} = this.complex.geometry(c);
          means.set(c, integrateTetrahedron(points, u,
              this.options.quadratureOrder ?? 4) / volume);
        }
        return means.get(c);
      };
      boundary = {value: (x, c) => mean(c), derivative: () => 0};
    } else {
      boundary = this.boundary.lazyField(
          (x) => u(x), (x) => du(x), l);
    }
    // The weights say which cell each quadrature point is in.
    const residual = (x, c) => subtract(u(x), boundary.value(x, c));
    const zero = this.zero.local(residual, l);
    const result = {
      value: (x, c) => add(boundary.value(x, c), zero.value(x, c)),
      derivative: (x, c) => (l === 3 ? 0 :
        add(boundary.derivative(x, c), zero.derivative(x, c))),
    };
    perDegree.set(l, result);
    return result;
  }
}
