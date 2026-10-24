/**
 * The finite element space P_r^- Lambda^k on a tetrahedral mesh (or a patch of
 * cells) with the degrees of freedom of Arnold and Guzman: on every
 * sub-simplex tau the pairings <<tr_tau w, g>>_tau against the orthonormal
 * bubbles g (and the lowest-order dof: vertex value, edge circulation, face
 * flux, cell integral). Basis functions are the dual basis, mapped to each
 * cell by the Piola transform.
 */

import {ValidateError} from './errors.js';
import {CanonicalProjector} from './canonical-projector.js';
import {agBasis, bubbleFamily} from './ag-element.js';
import {differential} from './polynomial-forms.js';
import {pullback, referenceRule} from './reference-element.js';

const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);

export class AgSpace extends CanonicalProjector {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} tetrahedra Cells as four vertex indices.
   * @param {{degree: (number|undefined), quadratureOrder:
   *     (number|undefined)}=} options `degree` p; the polynomial degree of
   *     the spaces is r = p + 1.
   */
  constructor(vertices, tetrahedra, options = {}) {
    super(vertices, tetrahedra, options);
    this.referenceDerivatives = new Map();
  }

  element(l) {
    return agBasis(this.r, l);
  }

  /**
   * What each global dof of degree l is: the dimension and number of its
   * entity and its kind (`point`, `volume`, `closed`, `coclosed`).
   * @return {!Array<{dimension: number, entity: number, kind: string}>}
   */
  dofInfo(l) {
    const {perEntity, offsets, size} = this.layout(l);
    const {entries, carriers: list, offsets: first} = this.element(l);
    const out = new Array(size);
    this.complex.cells.forEach((_, c) => {
      list.forEach((carrier, ci) => {
        const m = carrier.dimension;
        const entity = this.entityOf(c, carrier);
        for (let t = 0; t < perEntity[m]; t++) {
          const dof = offsets[m] + perEntity[m] * entity + t;
          out[dof] = {
            dimension: m,
            entity,
            kind: entries[first[ci] + t].kind,
          };
        }
      });
    });
    return out;
  }

  /**
   * All degrees of freedom of a field.
   * @param {function(number[], number): (number|number[])} u The field at a
   *     point of a cell (the second argument is the cell number).
   * @param {number} l Form degree.
   * @param {?function(number[], number): (number|number[])=} du Its derivative
   *     (gradient, curl or divergence); needed unless l = 3 or r = 1.
   * @return {Float64Array}
   */
  coefficients(u, l, du = null) {
    const {perEntity, offsets, size} = this.layout(l);
    const {entries, carriers: list, offsets: first} = this.element(l);
    const out = new Float64Array(size);
    const done = new Uint8Array(size);
    this.complex.cells.forEach((_, c) => {
      const {points} = this.complex.geometry(c);
      list.forEach((carrier, ci) => {
        const m = carrier.dimension;
        const base = offsets[m] + perEntity[m] * this.entityOf(c, carrier);
        if (done[base]) return;
        done[base] = 1;
        const corners = carrier.vertices.map((v) => points[v]);
        if (m === 0) {
          out[base] = u(corners[0], c);
          return;
        }
        const family = bubbleFamily(this.r, m)[l];
        const rule = referenceRule(m, this.r + 3);
        const pull = pullback(l, corners);
        const pullD = l + 1 <= m ? pullback(l + 1, corners) : null;
        for (let t = 0; t < perEntity[m]; t++) {
          const item = family[entries[first[ci] + t].index];
          let sum = 0;
          for (const {s, weight} of rule) {
            if (item.kind === 'coclosed') {
              if (!du) {
                throw new ValidateError('the derivative of u is needed');
              }
              sum += weight * dot(
                  pullD(s, (x) => du(x, c)), item.derivative(s));
            } else {
              sum += weight * dot(
                  pull(s, (x) => u(x, c)), item.value(s));
            }
          }
          out[base + t] = sum;
        }
      });
    });
    return out;
  }

  /**
   * The reference matrix of the exterior derivative on a cell: entry (j, i) is
   * the coefficient of basis function j of degree l + 1 in the derivative of
   * basis function i of degree l. The same matrix serves every cell because
   * the degrees of freedom are defined through pull-backs.
   * @return {!Array<!Float64Array>}
   */
  referenceDerivative(l) {
    if (this.referenceDerivatives.has(l)) {
      return this.referenceDerivatives.get(l);
    }
    const from = this.element(l);
    const to = agBasis(this.r, l + 1);
    const derivatives = from.basis.map((psi) => {
      const w = differential(psi, l);
      return {w, dw: l + 1 < 3 ? differential(w, l + 1) : null};
    });
    const rows = to.functionals.map((functional) => Float64Array.from(
        derivatives, ({w, dw}) => functional(w, dw)));
    this.referenceDerivatives.set(l, rows);
    return rows;
  }
}
