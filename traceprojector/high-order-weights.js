/**
 * Local weight functions of any polynomial degree for the commuting
 * projections without boundary conditions (Ern, Guzman, Potu and Vohralik,
 * arXiv:2502.03601, Theorem 5.1 for general p; Arnold and Guzman 2021,
 * Section 6). With r = p + 1, the weight Z^l(sigma) of a vertex (l = 0), edge,
 * face or cell (l = 3) is supported on an extended star of sigma and
 *
 *   <Z^l(sigma), u> = phi_sigma(u)   for every u in P_r^- Lambda^l,
 *   -div  Z^1(e) = sum  iota Z^0(v),
 *    curl Z^2(f) = sum  iota Z^1(e),
 *   -grad Z^3(t) = sum  iota Z^2(f),
 *
 * where phi_sigma is the lowest-order degree of freedom (vertex value, edge
 * circulation, face flux, cell integral).
 *
 * Each weight is eta + P. The field eta is the minimum-norm solution of the
 * differential relation in the space of degree r on the Alfeld split of the
 * star, with zero trace on the boundary of the star; P comes from a potential
 * v of the same family as u on the original star, solving a problem weighted
 * by the cell bubble mu (one at the barycenter of a cell, zero on its faces):
 *   P = -div(mu grad v) (l = 0),  curl(mu curl v) (l = 1),
 *   -grad(mu div v)     (l = 2),  0 (l = 3).
 * Since mu vanishes on cell faces, <P, u> = <mu dv, du> for every u, so no
 * regularity of u beyond L2 is used when P is formed explicitly.
 */

import {SingularError, ValidateError} from './errors.js';
import {AgSpace} from './ag-space.js';
import {solveSemidefinite} from './dense-linear-algebra.js';
import {LocalWeights} from './local-weights.js';
import {tetrahedronRule} from './simplicial-complex.js';
import {
  SparseMatrix,
  minimumNormSolveDense,
} from './sparse-linear-algebra.js';
import {
  addForms,
  affine,
  curl,
  differential,
  divergence,
  evaluateForm,
  physicalForm,
  scaleForm,
  timesPolynomial,
  zeroLike,
} from './physical-forms.js';
import {Polynomial} from './polynomial-forms.js';

const dot = (a, b) => (typeof a === 'number' ? a * b :
  a.reduce((s, q, i) => s + q * b[i], 0));

export class HighOrderWeights {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} tetrahedra Cells as four vertex indices.
   * @param {{degree: (number|undefined), quadratureOrder:
   *     (number|undefined)}=} options `degree` is p; r = p + 1.
   */
  constructor(vertices, tetrahedra, options = {}) {
    const p = options.degree ?? 0;
    if (!Number.isInteger(p) || p < 0) {
      throw new ValidateError('degree must be a nonnegative integer');
    }
    this.degree = p;
    this.r = p + 1;
    this.order = options.quadratureOrder ?? 2 * this.r + 2;
    this.topology = new LocalWeights(vertices, tetrahedra, {
      boundaryConditions: false,
    });
    this.base = this.topology.base;
    this.weights = [new Map(), new Map(), new Map(), new Map()];
    this.formCache = new WeakMap();
  }

  /** The weight of an entity of degree l, computed on first use. */
  weight(l, index) {
    const cache = this.weights[l];
    if (!cache.has(index)) cache.set(index, this.compute(l, index));
    return cache.get(index);
  }

  /**
   * Integral of the weight against a field over the weight's support.
   * @param {number} l
   * @param {number} index
   * @param {function(number[], number): (number|number[])} u The field at a
   *     point of a base cell (second argument: the cell number).
   * @return {number}
   */
  pair(l, index, u) {
    const z = this.weight(l, index);
    let sum = 0;
    for (const {cell, points, form} of z.pieces) {
      for (const {x, weight} of tetrahedronRule(points, this.order)) {
        sum += weight * dot(evaluateForm(form, x), u(x, cell));
      }
    }
    return sum;
  }

  // ---------------------------------------------------------------------
  // Patches.

  /** A compact tetrahedral mesh of some cells, with the base numbers. */
  patch(cells, split) {
    const ids = new Map();
    const coordinates = [];
    const vertex = (key, point) => {
      if (!ids.has(key)) {
        ids.set(key, coordinates.length);
        coordinates.push(point);
      }
      return ids.get(key);
    };
    const tets = [];
    const centroids = [];
    for (const c of cells) {
      const corners = this.base.cells[c];
      const points = this.base.geometry(c).points;
      if (!split) {
        tets.push(corners.map((v, i) => vertex(`v${v}`, points[i])));
        continue;
      }
      const centre = vertex(`c${c}`, points[0].map(
          (_, d) => points.reduce((s, q) => s + q[d], 0) / 4));
      centroids.push(centre);
      const ring = corners.map((v, i) => vertex(`v${v}`, points[i]));
      for (let k = 0; k < 4; k++) {
        tets.push([...ring.filter((_, i) => i !== k), centre]);
      }
    }
    return {vertices: coordinates, tetrahedra: tets, centroids};
  }

  /** Physical forms of every local basis function of a cell, cached. */
  basisForms(space, c, l) {
    if (!this.formCache.has(space)) this.formCache.set(space, new Map());
    const cache = this.formCache.get(space);
    const id = `${c}:${l}`;
    if (!cache.has(id)) {
      const frame = space.frame(c);
      cache.set(id, space.element(l).basis.map(
          (psi) => physicalForm(psi, l, frame)));
    }
    return cache.get(id);
  }

  // ---------------------------------------------------------------------

  /** @private */
  compute(l, sigma) {
    const radius = this.topology.radius(l, sigma);
    const star = this.topology.extendedStar(l, sigma, radius);
    const cells = star.cells;
    const split = this.patch(cells, true);
    const splitSpace = new AgSpace(
        split.vertices, split.tetrahedra, {degree: this.degree});
    const volume = cells.reduce(
        (s, c) => s + this.base.geometry(c).volume, 0);
    // One piece per sub-cell: (base cell, index of the dropped vertex).
    const subCell = (s) => ({cell: cells[s >> 2], k: s & 3});

    // 1. eta.
    let eta;
    if (l === 0) {
      eta = split.tetrahedra.map(
          () => Polynomial.monomial([0, 0, 0], 1 / volume));
    } else {
      eta = this.solveEta(l, sigma, cells, splitSpace);
    }
    // 2. The potential part.
    let extra = null;
    if (l <= 2) {
      extra = this.solvePotential(
          l, sigma, cells, splitSpace, subCell, eta, split.centroids);
    }
    const pieces = split.tetrahedra.map((_, s) => {
      const {cell} = subCell(s);
      const form = extra ? addForms(eta[s], extra[s]) : eta[s];
      return {
        cell,
        k: s & 3,
        points: splitSpace.complex.geometry(s).points,
        form,
      };
    });
    return {l, index: sigma, cells, pieces};
  }

  /** The pieces of Z^{l-1}(tau) summed over the boundary of sigma. */
  targetForms(l, sigma, cells, splitSpace) {
    const index = new Map(cells.map((c, i) => [c, i]));
    const zero = splitSpace.complex.cells.map(() => null);
    for (const {entity, sign} of this.base.boundary(l, sigma)) {
      const z = this.weight(l - 1, entity);
      for (const piece of z.pieces) {
        if (!index.has(piece.cell)) {
          throw new SingularError('a boundary weight leaves the star');
        }
        const s = 4 * index.get(piece.cell) + piece.k;
        const scaled = scaleForm(piece.form, sign);
        zero[s] = zero[s] ? addForms(zero[s], scaled) : scaled;
      }
    }
    return zero;
  }

  /** @private Minimum-norm eta for l = 1, 2, 3. */
  solveEta(l, sigma, cells, space) {
    const from = 3 - l;
    const to = 4 - l;
    const target = this.targetForms(l, sigma, cells, space);
    const toFormOf = (s) => target[s] ?? (
      to === 0 || to === 3 ? Polynomial.zero() :
        [Polynomial.zero(), Polynomial.zero(), Polynomial.zero()]);
    const targetFn = (x, s) => evaluateForm(toFormOf(s), x);
    const derivativeFn = to < 3 ? (x, s) => evaluateForm(
        differential(toFormOf(s), to), x) : null;
    const rhs = space.coefficients(targetFn, to, derivativeFn);
    const sign = [0, -1, 1, -1][l];
    // Constraint matrix: coefficients of d(psi_a) in the basis of degree to.
    const reference = space.referenceDerivative(from);
    const fromSize = space.size(from);
    const rows = Array.from({length: space.size(to)}, () => new Map());
    space.complex.cells.forEach((_, c) => {
      const columns = space.cellDofs(c, from);
      const targets = space.cellDofs(c, to);
      columns.forEach((a, i) => {
        targets.forEach((b, j) => {
          const value = reference[j][i];
          if (value !== 0) rows[b].set(a, value);
        });
      });
    });
    const onBoundary = this.boundaryDofs(space, from);
    const free = [];
    const position = new Int32Array(fromSize).fill(-1);
    for (let a = 0; a < fromSize; a++) {
      if (!onBoundary[a]) {
        position[a] = free.length;
        free.push(a);
      }
    }
    const constraints = new SparseMatrix(rows.length, free.length, rows.map(
        (row) => {
          const entries = new Map();
          for (const [a, v] of row) {
            if (position[a] >= 0) entries.set(position[a], v);
          }
          return entries;
        }));
    const mass = this.massMatrix(space, from, free, position);
    const target0 = Float64Array.from(rhs, (q) => sign * q);
    const solved = minimumNormSolveDense(constraints, mass, target0);
    if (!(solved.residual <= 1e-9 * Math.max(solved.scale, 1))) {
      throw new SingularError(
          `no field with the required differential in the star of ` +
          `entity ${sigma} of degree ${l} (residual ${solved.residual})`);
    }
    const coefficients = new Float64Array(fromSize);
    free.forEach((a, i) => (coefficients[a] = solved.x[i]));
    // Physical polynomial forms of eta on every sub-cell.
    return space.complex.cells.map((_, s) => {
      const forms = this.basisForms(space, s, from);
      const dofs = space.cellDofs(s, from);
      let total = zeroLike(forms[0]);
      dofs.forEach((a, i) => {
        if (coefficients[a] !== 0) {
          total = addForms(total, scaleForm(forms[i], coefficients[a]));
        }
      });
      return total;
    });
  }

  /** Whether each dof of degree l lies on the boundary of the patch. */
  boundaryDofs(space, l) {
    const complex = space.complex;
    const faces = new Set();
    const edges = new Set();
    const vertices = new Set();
    complex.faces.forEach((face, f) => {
      if (complex.faceCells[f].length !== 1) return;
      faces.add(f);
      complex.faceEdges[f].forEach((e) => edges.add(e));
      face.forEach((v) => vertices.add(v));
    });
    const sets = [vertices, edges, faces];
    const info = space.dofInfo(l);
    return info.map(({dimension, entity}) => dimension < 3 &&
      sets[dimension].has(entity));
  }

  /** Sparse L2 mass matrix of the free dofs of degree l. */
  massMatrix(space, l, free, position) {
    const entries = free.map(() => new Map());
    space.complex.cells.forEach((_, c) => {
      const forms = this.basisForms(space, c, l);
      const dofs = space.cellDofs(c, l);
      const rule = tetrahedronRule(space.complex.geometry(c).points,
          2 * this.r + 1);
      const values = forms.map((f) => rule.map(({x}) => evaluateForm(f, x)));
      dofs.forEach((a, i) => {
        if (position[a] < 0) return;
        dofs.forEach((b, j) => {
          if (position[b] < 0) return;
          let sum = 0;
          rule.forEach(({weight}, q) => {
            sum += weight * dot(values[i][q], values[j][q]);
          });
          const row = entries[position[a]];
          row.set(position[b], (row.get(position[b]) ?? 0) + sum);
        });
      });
    });
    return new SparseMatrix(free.length, free.length, entries);
  }

  /** @private The potential and the resulting P on every sub-cell. */
  solvePotential(l, sigma, cells, splitSpace, subCell, eta, centroids) {
    const base = this.patch(cells, false);
    const space = new AgSpace(base.vertices, base.tetrahedra,
        {degree: this.degree});
    const size = space.size(l);
    // mu on a sub-cell: the barycentric coordinate of the centroid.
    const mu = splitSpace.complex.cells.map((corners, s) => {
      const {gradients, points} = splitSpace.complex.geometry(s);
      const at = corners.indexOf(centroids[s >> 2]);
      const g = gradients[at];
      // lambda_i(x) = g_i . (x - p0) + [i = 0]
      return affine((at === 0 ? 1 : 0) -
        g.reduce((acc, q, i) => acc + q * points[0][i], 0), g);
    });
    const rule = (s) => tetrahedronRule(
        splitSpace.complex.geometry(s).points, 2 * this.r + 5);
    const entries = Array.from({length: size}, () => new Map());
    const rhs = new Float64Array(size);
    const derivativeForms = new Map();
    const dForms = (c) => {
      if (!derivativeForms.has(c)) {
        derivativeForms.set(c, this.basisForms(space, c, l)
            .map((f) => differential(f, l)));
      }
      return derivativeForms.get(c);
    };
    splitSpace.complex.cells.forEach((_, s) => {
      const {cell} = subCell(s);
      const c = cells.indexOf(cell);
      const forms = this.basisForms(space, c, l);
      const derived = dForms(c);
      const dofs = space.cellDofs(c, l);
      const points = rule(s);
      const dv = derived.map((f) => points.map(({x}) => evaluateForm(f, x)));
      const v = forms.map((f) => points.map(({x}) => evaluateForm(f, x)));
      const weights = points.map(({x, weight}) => weight * mu[s].evaluate(x));
      const etaValues = points.map(({x}) => evaluateForm(eta[s], x));
      dofs.forEach((a, i) => {
        points.forEach(({weight}, q) => {
          rhs[a] -= weight * dot(etaValues[q], v[i][q]);
        });
        dofs.forEach((b, j) => {
          let sum = 0;
          points.forEach((_, q) => {
            sum += weights[q] * dot(dv[i][q], dv[j][q]);
          });
          entries[a].set(b, (entries[a].get(b) ?? 0) + sum);
        });
      });
    });
    // phi_sigma(psi_a): the lowest-order degree of freedom of the basis
    // functions, read from one cell that contains sigma.
    const owner = cells.findIndex((c) => this.entityInCell(l, sigma, c));
    const ownerCell = cells[owner];
    const forms = this.basisForms(space, owner, l);
    const ownerDofs = space.cellDofs(owner, l);
    ownerDofs.forEach((a, i) => {
      rhs[a] += this.lowestDegreeOfFreedom(l, sigma, ownerCell,
          (x) => evaluateForm(forms[i], x));
    });
    const dense = new Float64Array(size * size);
    entries.forEach(
        (row, a) => row.forEach((v, b) => (dense[a * size + b] = v)));
    const direct = solveSemidefinite(dense, size, rhs, 1e-13);
    const solved = {x: direct.x, relativeResidual: direct.residual /
      Math.max(Math.hypot(...rhs), 1e-300)};
    if (!(solved.relativeResidual < 1e-8)) {
      throw new SingularError(
          `the potential problem of entity ${sigma} of degree ${l} is ` +
          `inconsistent (relative residual ${solved.relativeResidual})`);
    }
    // P on every sub-cell.
    return splitSpace.complex.cells.map((_, s) => {
      const {cell} = subCell(s);
      const c = cells.indexOf(cell);
      const forms = this.basisForms(space, c, l);
      const dofs = space.cellDofs(c, l);
      let v = zeroLike(forms[0]);
      dofs.forEach((a, i) => {
        if (solved.x[a] !== 0) {
          v = addForms(v, scaleForm(forms[i], solved.x[a]));
        }
      });
      const dv = differential(v, l);
      const weighted = timesPolynomial(dv, mu[s]);
      if (l === 0) return scaleForm(divergence(weighted), -1);
      if (l === 1) return curl(weighted);
      return scaleForm(differential(weighted, 0), -1);
    });
  }

  /** Whether the entity of degree l is an entity of base cell c. */
  entityInCell(l, sigma, c) {
    if (l === 0) return this.base.cells[c].includes(sigma);
    if (l === 1) return this.base.cellEdges[c].includes(sigma);
    if (l === 2) return this.base.cellFaces[c].includes(sigma);
    return c === sigma;
  }

  /** The lowest-order degree of freedom of a field given in cell c. */
  lowestDegreeOfFreedom(l, sigma, c, field) {
    if (!this.entityInCell(l, sigma, c)) return 0;
    return this.base.degreeOfFreedom(l, sigma, field, this.r + 3);
  }
}
