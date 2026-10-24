/**
 * Locally L2-bounded commuting projections onto P_r^- Lambda^k of any degree
 * r = p + 1 (Arnold and Guzman, ESAIM M2AN 55, 2021, eq. 5.2):
 *
 *   pi_r u = P_r u + Q_r (u - P_r u).
 *
 * P_r u = sum_sigma <Z_r(sigma), u> W_sigma is the projection onto the
 * lowest-order (Whitney) forms built from the weights of `HighOrderWeights`.
 * Q_r projects onto M_r, the forms of P_r^- Lambda^k whose lowest-order
 * degrees of freedom vanish:
 *
 *   Q_r u = sum over (tau, g) of <u, U(tau, g)> E_tau g,
 *
 * where g runs over the orthonormal bubbles of each sub-simplex tau (see
 * `ag-element.js`), E_tau g is the basis function of the corresponding degree
 * of freedom, and U(tau, g) is supported on the star of tau:
 *   closed g:    U = mu beta, with <mu beta, w> = <g, tr_tau w>_tau for all w
 *                in M_r on the star, i.e. beta solves the mu-weighted mass
 *                system with the unit vector of (tau, g) as right-hand side;
 *   coclosed g:  U = delta(mu beta'), with beta' the same for (tau, dg).
 * Only L2 information about u is used.
 */

import {SingularError, ValidateError} from './errors.js';
import {AgSpace} from './ag-space.js';
import {cholesky, choleskySolveInPlace} from './dense-linear-algebra.js';
import {HighOrderWeights} from './high-order-weights.js';
import {tetrahedronRule} from './simplicial-complex.js';
import {
  addForms,
  differential,
  divergence,
  curl,
  evaluateForm,
  scaleForm,
  timesPolynomial,
  zeroLike,
} from './physical-forms.js';

const dot = (a, b) => (typeof a === 'number' ? a * b :
  a.reduce((s, q, i) => s + q * b[i], 0));

export class HigherOrderProjector {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} tetrahedra Cells as four vertex indices.
   * @param {{degree: (number|undefined), quadratureOrder:
   *     (number|undefined)}=} options `degree` is p; r = p + 1.
   */
  constructor(vertices, tetrahedra, options = {}) {
    this.weights = new HighOrderWeights(vertices, tetrahedra, options);
    this.boundaryConditions = this.weights.boundaryConditions;
    this.degree = this.weights.degree;
    this.r = this.weights.r;
    this.base = this.weights.base;
    this.space = new AgSpace(vertices, tetrahedra, {degree: this.degree});
    this.order = options.quadratureOrder ?? 2 * this.r + 5;
    this.cache = new Map();
    if (this.space.complex.cells.length !== this.base.cells.length) {
      throw new ValidateError('inconsistent meshes');
    }
  }

  /** Cells that contain the entity of dimension m. */
  starCells(m, entity) {
    const complex = this.base;
    return complex.cells.map((_, c) => c).filter((c) => [
      complex.cells[c].includes(entity),
      complex.cellEdges[c].includes(entity),
      complex.cellFaces[c].includes(entity),
      c === entity,
    ][m]);
  }

  /** Number of entities of dimension m. */
  entityCount(m) {
    return [this.base.vertices.length, this.base.edges.length,
      this.base.faces.length, this.base.cells.length][m];
  }

  // ---------------------------------------------------------------------
  // P_r.

  /** The coefficients of P_r u on the Whitney forms of degree l. */
  lowestCoefficients(u, l) {
    const out = new Float64Array(this.entityCount(l));
    for (let sigma = 0; sigma < out.length; sigma++) {
      out[sigma] = this.weights.pair(l, sigma, (x) => u(x));
    }
    return out;
  }

  /** Value of the Whitney combination at a point of a cell. */
  evaluateLowest(coefficients, x, c, l) {
    const basis = this.base.whitney(c, l, x);
    const entities = this.base.cellEntities(c, l);
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0];
    entities.forEach((entity, i) => {
      const w = coefficients[entity];
      if (w === 0) return;
      total = typeof total === 'number' ? total + w * basis[i] :
        total.map((q, a) => q + w * basis[i][a]);
    });
    return total;
  }

  // ---------------------------------------------------------------------
  // Q_r.

  /** The U-forms of the bubble dofs of one entity, built on first use. */
  bubbleForms(l, m, entity) {
    const id = `${l}:${m}:${entity}`;
    if (!this.cache.has(id)) {
      this.cache.set(id, this.buildBubbleForms(
          l, m, entity));
    }
    return this.cache.get(id);
  }

  /** @private */
  buildBubbleForms(l, m, entity) {
    if (this.boundaryConditions && m < 3 &&
        this.weights.topology.isBoundary(m, entity)) {
      return [];
    }
    const cells = this.starCells(m, entity);
    const first = cells[0];
    const patch = this.weights.patch(cells, false);
    const split = this.weights.patch(cells, true);
    const patchSpace = new AgSpace(
        patch.vertices, patch.tetrahedra, {degree: this.degree});
    const splitSpace = new AgSpace(
        split.vertices, split.tetrahedra, {degree: this.degree});
    const boundaryFaces = [...new Set(cells.flatMap(
        (c) => this.base.cellFaces[c]))]
        .filter((f) => this.base.isBoundaryFace(f));
    const mu = this.weights.bubbleWeights(splitSpace, split.centroids);
    const subCells = splitSpace.complex.cells.length;
    const rules = Array.from({length: subCells}, (_, s) => tetrahedronRule(
        splitSpace.complex.geometry(s).points, this.weights.exactOrder));

    // The mu-weighted mass system on the star, restricted to M_r.
    const systems = new Map();
    const system = (degree) => {
      if (systems.has(degree)) return systems.get(degree);
      const info = patchSpace.dofInfo(degree);
      const index = new Int32Array(info.length).fill(-1);
      const members = [];
      const outside = this.boundaryConditions ? this.weights.closureDofs(
          patchSpace, degree, patch, boundaryFaces) : [];
      info.forEach(({kind}, a) => {
        if ((kind === 'closed' || kind === 'coclosed') && !outside[a]) {
          index[a] = members.length;
          members.push(a);
        }
      });
      const n = members.length;
      const matrix = new Float64Array(n * n);
      for (let s = 0; s < subCells; s++) {
        const c = s >> 2;
        const forms = this.weights.basisForms(patchSpace, c, degree);
        const dofs = patchSpace.cellDofs(c, degree);
        const values = forms.map((f) => rules[s].map(
            ({x}) => evaluateForm(f, x)));
        const weights = rules[s].map(({x, weight}) =>
          weight * mu[s].evaluate(x));
        dofs.forEach((a, i) => {
          if (index[a] < 0) return;
          dofs.forEach((b, j) => {
            if (index[b] < 0) return;
            let sum = 0;
            weights.forEach((w, q) => {
              sum += w * dot(values[i][q], values[j][q]);
            });
            matrix[index[a] * n + index[b]] += sum;
          });
        });
      }
      let factor;
      try {
        factor = cholesky(matrix, n);
      } catch (e) {
        throw new SingularError(
            `the bubble system of entity ${entity} (dimension ${m}, degree ` +
            `${degree}) is not positive definite`);
      }
      const out = {index, members, factor, n};
      systems.set(degree, out);
      return out;
    };

    // beta as a polynomial form on every sub-cell, for the unit vector of the
    // patch dof `dof` of degree `degree`.
    const betaForms = (degree, dof) => {
      const {index, members, factor, n} = system(degree);
      const rhs = new Float64Array(n);
      if (index[dof] < 0) throw new SingularError('not a bubble dof');
      rhs[index[dof]] = 1;
      choleskySolveInPlace(factor, n, rhs);
      const coefficients = new Float64Array(patchSpace.size(degree));
      members.forEach((a, i) => (coefficients[a] = rhs[i]));
      const out = [];
      for (let s = 0; s < subCells; s++) {
        const c = s >> 2;
        const forms = this.weights.basisForms(patchSpace, c, degree);
        const dofs = patchSpace.cellDofs(c, degree);
        let total = zeroLike(forms[0]);
        dofs.forEach((a, i) => {
          if (coefficients[a] !== 0) {
            total = addForms(total, scaleForm(forms[i], coefficients[a]));
          }
        });
        out.push(total);
      }
      return out;
    };

    // The carrier of the entity in the first cell, for degrees l and l + 1.
    const carrierOf = (degree) => {
      const {carriers, offsets, entries} = this.space.element(degree);
      const ci = carriers.findIndex((carrier) => carrier.dimension === m &&
        this.space.entityOf(first, carrier) === entity);
      if (ci < 0) return null;
      return {first: offsets[ci], last: offsets[ci + 1], entries};
    };
    const here = carrierOf(l);
    if (!here) return [];
    const above = l < 3 ? carrierOf(l + 1) : null;
    const globalDofs = this.space.cellDofs(first, l);
    const patchDofs = patchSpace.cellDofs(0, l);
    const patchAbove = l < 3 ? patchSpace.cellDofs(0, l + 1) : null;
    const closedAbove = above ? Array.from(
        {length: above.last - above.first}, (_, i) => above.first + i)
        .filter((i) => above.entries[i].kind === 'closed') : [];

    const items = [];
    let coclosedOrdinal = 0;
    for (let e = here.first; e < here.last; e++) {
      const kind = here.entries[e].kind;
      if (kind !== 'closed' && kind !== 'coclosed') continue;
      let forms;
      if (kind === 'closed') {
        const beta = betaForms(l, patchDofs[e]);
        forms = beta.map((b, s) => timesPolynomial(b, mu[s]));
      } else {
        const target = closedAbove[coclosedOrdinal++];
        if (target === undefined) {
          throw new SingularError('missing closed bubble of next degree');
        }
        const beta = betaForms(l + 1, patchAbove[target]);
        forms = beta.map((b, s) => {
          const weighted = timesPolynomial(b, mu[s]);
          if (l === 0) return scaleForm(divergence(weighted), -1);
          if (l === 1) return curl(weighted);
          return scaleForm(differential(weighted, 0), -1);
        });
      }
      items.push({
        dof: globalDofs[e],
        kind,
        pieces: forms.map((form, s) => ({
          cell: cells[s >> 2],
          points: splitSpace.complex.geometry(s).points,
          form,
        })),
      });
    }
    return items;
  }

  /** The coefficients of Q_r w on the basis of the space of degree l. */
  correctionCoefficients(w, l) {
    const out = new Float64Array(this.space.size(l));
    const lowest = Math.max(l, 1);
    for (let m = lowest; m <= 3; m++) {
      for (let entity = 0; entity < this.entityCount(m); entity++) {
        for (const item of this.bubbleForms(l, m, entity)) {
          let sum = 0;
          for (const {cell, points, form} of item.pieces) {
            for (const {x, weight} of tetrahedronRule(points, this.order)) {
              sum += weight * dot(evaluateForm(form, x), w(x, cell));
            }
          }
          out[item.dof] = sum;
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------

  /**
   * The coefficients of pi_r u: those of P_r u on the Whitney forms and those
   * of Q_r (u - P_r u) on the basis of P_r^- Lambda^l.
   * @param {function(number[]): (number|number[])} u An L2 field.
   * @param {number} l Form degree.
   * @return {{lowest: Float64Array, correction: Float64Array}}
   */
  coefficients(u, l) {
    const lowest = this.lowestCoefficients(u, l);
    const residual = (x, c) => {
      const part = this.evaluateLowest(lowest, x, c, l);
      const value = u(x);
      return typeof value === 'number' ? value - part :
        value.map((q, i) => q - part[i]);
    };
    return {lowest, correction: this.correctionCoefficients(residual, l)};
  }

  /** Value of pi_r u at a point of a cell, from its coefficients. */
  evaluate({lowest, correction}, x, c, l) {
    const a = this.evaluateLowest(lowest, x, c, l);
    const b = this.space.evaluate(correction, x, c, l);
    return typeof a === 'number' ? a + b : a.map((q, i) => q + b[i]);
  }

  /**
   * Lazy, cell-by-cell evaluation of pi_r u: only the coefficients that a
   * cell needs are computed, so a value at one point costs the weights and
   * bubble forms of the entities around that cell, not of the whole mesh.
   * @param {function(number[]): (number|number[])} u An L2 field.
   * @param {number} l Form degree.
   * @return {{value: function(number[], number): (number|number[]),
   *     derivative: function(number[], number): (number|number[])}} Value of
   *     pi_r u, and of its exterior derivative (gradient, curl or divergence),
   *     at a point of a cell.
   */
  local(u, l) {
    const lowest = new Map();
    const lowestOf = (sigma) => {
      if (!lowest.has(sigma)) {
        lowest.set(sigma, this.weights.pair(l, sigma, (x) => u(x)));
      }
      return lowest.get(sigma);
    };
    const entities = (c, degree) => this.base.cellEntities(c, degree);
    const whitney = (x, c) => {
      const basis = this.base.whitney(c, l, x);
      let total = l === 0 || l === 3 ? 0 : [0, 0, 0];
      entities(c, l).forEach((sigma, i) => {
        const w = lowestOf(sigma);
        total = typeof total === 'number' ? total + w * basis[i] :
          total.map((q, a) => q + w * basis[i][a]);
      });
      return total;
    };
    const residual = (x, c) => {
      const part = whitney(x, c);
      const value = u(x);
      return typeof value === 'number' ? value - part :
        value.map((q, i) => q - part[i]);
    };
    const corrections = new Map();
    const correctionOf = (dof, m, entity) => {
      if (!corrections.has(dof)) {
        const item = this.bubbleForms(l, m, entity).find((i) => i.dof === dof);
        if (!item) {
          corrections.set(dof, 0);
          return 0;
        }
        let sum = 0;
        for (const {cell, points, form} of item.pieces) {
          for (const {x, weight} of tetrahedronRule(points, this.order)) {
            sum += weight * dot(evaluateForm(form, x), residual(x, cell));
          }
        }
        corrections.set(dof, sum);
      }
      return corrections.get(dof);
    };
    const scratch = new Float64Array(this.space.size(l));
    const cellCorrection = (c) => {
      const {entries, carriers, offsets} = this.space.element(l);
      const dofs = this.space.cellDofs(c, l);
      const touched = [];
      carriers.forEach((carrier, ci) => {
        const m = carrier.dimension;
        const entity = this.space.entityOf(c, carrier);
        for (let e = offsets[ci]; e < offsets[ci + 1]; e++) {
          const kind = entries[e].kind;
          if (kind === 'closed' || kind === 'coclosed') {
            scratch[dofs[e]] = correctionOf(dofs[e], m, entity);
            touched.push(dofs[e]);
          }
        }
      });
      return touched;
    };
    const withCorrection = (c, evaluate) => {
      const touched = cellCorrection(c);
      const out = evaluate();
      touched.forEach((a) => (scratch[a] = 0));
      return out;
    };
    return {
      value: (x, c) => {
        const a = whitney(x, c);
        const b = withCorrection(
            c, () => this.space.evaluate(scratch, x, c, l));
        return typeof a === 'number' ? a + b : a.map((q, i) => q + b[i]);
      },
      derivative: (x, c) => {
        // d of the Whitney part: the coboundary of its coefficients.
        const upper = this.base.cellEntities(c, l + 1);
        const basis = this.base.whitney(c, l + 1, x);
        let total = l === 2 ? 0 : [0, 0, 0];
        upper.forEach((entity, i) => {
          let w = 0;
          for (const {entity: sigma, sign} of this.base.boundary(l + 1,
              entity)) {
            w += sign * lowestOf(sigma);
          }
          total = typeof total === 'number' ? total + w * basis[i] :
            total.map((q, a) => q + w * basis[i][a]);
        });
        const b = withCorrection(c, () => this.space.derivative(
            scratch, x, c, l));
        return typeof total === 'number' ? total + b : total.map(
            (q, i) => q + b[i]);
      },
    };
  }
}
