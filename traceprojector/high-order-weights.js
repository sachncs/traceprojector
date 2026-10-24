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
  forwardSubstitute,
  minimumNormSolveDense,
} from './sparse-linear-algebra.js';
import {
  minimumNormSolveBanded,
  solveSemidefiniteBanded,
} from './banded-linear-algebra.js';
import {cholesky} from './dense-linear-algebra.js';
import {symmetricEigenvalues} from './small-linear-algebra.js';
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
  translateForm,
  zeroLike,
} from './physical-forms.js';
import {Polynomial, monomialValues} from './polynomial-forms.js';

const dot = (a, b) => (typeof a === 'number' ? a * b :
  a.reduce((s, q, i) => s + q * b[i], 0));

/**
 * Values of forms at quadrature points as one flat array per form, so that
 * inner products are plain loops.
 * @param {!Array<function(number[]): (number|number[])>} forms
 * @param {!Array<{x: !Array<number>}>} points
 * @return {{values: !Array<!Float64Array>, size: number}}
 */
function sampled(forms, points) {
  let top = 0;
  for (const form of forms) {
    for (const p of Array.isArray(form) ? form : [form]) {
      top = Math.max(top, p.degree);
    }
  }
  // The monomials of each point once, shared by all forms.
  const rows = points.map(({x}) => monomialValues(x, top));
  let size = 1;
  const values = forms.map((form) => {
    const components = Array.isArray(form) ? form : [form];
    size = components.length;
    const flat = new Float64Array(rows.length * size);
    rows.forEach((row, q) => {
      for (let k = 0; k < size; k++) {
        flat[q * size + k] = components[k].dot(row);
      }
    });
    return flat;
  });
  return {values, size};
}

/** sum over points of weight * <a, b>, for flat sampled values. */
function inner(a, b, weights, size) {
  let sum = 0;
  if (size === 1) {
    for (let q = 0; q < weights.length; q++) sum += weights[q] * a[q] * b[q];
  } else {
    for (let q = 0; q < weights.length; q++) {
      const o = q * size;
      sum += weights[q] * (a[o] * b[o] + a[o + 1] * b[o + 1] +
        a[o + 2] * b[o + 2]);
    }
  }
  return sum;
}

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
    // Gauss points per direction that integrate the products of two basis
    // functions of degree r with a bubble exactly.
    this.exactOrder = this.r + 3;
    this.boundaryConditions = options.boundaryConditions === true;
    // Test hook: also solve every minimum-norm problem densely and keep the
    // discrepancy in `checks`.
    this.crossCheck = options.crossCheck === true;
    this.checks = [];
    // One record per minimum-norm solve: size, time, certificate.
    this.stats = [];
    // Element matrices by the geometry of their cell: a cell shared by the
    // stars of many entities has its matrices computed once.
    this.blocks = new Map();
    this.blockDoubles = 0;
    this.blockLimit = options.blockCacheDoubles ?? 16 * 1024 * 1024;
    this.formBank = new Map();
    this.formBankLimit = options.formBankEntries ?? 1024;
    this.blockHits = 0;
    this.blockMisses = 0;
    this.topology = new LocalWeights(vertices, tetrahedra, {
      boundaryConditions: this.boundaryConditions,
    });
    this.base = this.topology.base;
    this.weights = [new Map(), new Map(), new Map(), new Map()];
    // Weights already computed, by the translation class of their star.
    this.classes = new Map();
    this.translated = 0;
    this.formCache = new WeakMap();
  }

  /** The weight of an entity of degree l, computed on first use. */
  weight(l, index) {
    const cache = this.weights[l];
    if (cache.has(index)) return cache.get(index);
    if (this.topology.isBoundary(l, index)) {
      const zero = {l, index, cells: [], pieces: []};
      cache.set(index, zero);
      return zero;
    }
    const signature = this.signature(l, index);
    const known = this.classes.get(signature.key);
    let z;
    if (known) {
      z = this.translate(known, signature);
      this.translated++;
    } else {
      z = this.compute(l, index);
      this.classes.set(signature.key, {z, signature});
    }
    cache.set(index, z);
    return z;
  }

  /**
   * The translation class of an entity: its star, as sets of vertex
   * coordinates relative to the star's lexicographically smallest vertex, and
   * the entity's own vertices in increasing number. Two entities with the
   * same key have weights that are translates of each other.
   */
  signature(l, index) {
    const star = this.topology.extendedStar(
        l, index, this.topology.radius(l, index));
    const point = (v) => this.base.vertices[v];
    const all = [...new Set(star.cells.flatMap((c) => this.base.cells[c]))];
    let origin = point(all[0]);
    for (const v of all) {
      const q = point(v);
      if (q[0] < origin[0] - 1e-12 || (Math.abs(q[0] - origin[0]) <= 1e-12 &&
          (q[1] < origin[1] - 1e-12 || (Math.abs(q[1] - origin[1]) <= 1e-12 &&
            q[2] < origin[2] - 1e-12)))) {
        origin = q;
      }
    }
    const relative = (v) => point(v).map((q, i) => (q - origin[i]).toFixed(9))
        .join(',');
    const boundaryOf = (c) => (this.boundaryConditions ?
      this.base.cellFaces[c].filter((f) => this.base.isBoundaryFace(f))
          .map((f) => this.base.faces[f].map(relative).sort().join('|'))
          .sort().join('/') : '');
    const cellKey = (c) => this.base.cells[c].map(relative).sort().join('|') +
      '!' + boundaryOf(c);
    const own = l === 0 ? [index] : l === 1 ? this.base.edges[index] :
      l === 2 ? this.base.faces[index] : this.base.cells[index];
    const key = `${l}#${own.map(relative).join('|')}#${
      star.cells.map(cellKey).sort().join(';')}`;
    return {key, origin, cells: star.cells, cellKey};
  }

  /** The weight of a class representative, moved to another entity. */
  translate({z, signature: from}, to) {
    const shift = to.origin.map((q, i) => q - from.origin[i]);
    const byKey = new Map(to.cells.map((c) => [to.cellKey(c), c]));
    const vertexAt = (c, target) => this.base.cells[c].findIndex((v) =>
      this.base.vertices[v].every((q, i) => Math.abs(q - target[i]) < 1e-9));
    const pieces = z.pieces.map((piece) => {
      const fromCell = piece.cell;
      const cell = byKey.get(from.cellKey(fromCell));
      const dropped = this.base.vertices[
          this.base.cells[fromCell][piece.k]].map((q, i) => q + shift[i]);
      const k = vertexAt(cell, dropped);
      return {
        cell,
        k,
        points: piece.points.map((q) => q.map((v, i) => v + shift[i])),
        form: translateForm(piece.form, shift),
      };
    });
    return {l: z.l, index: undefined, cells: to.cells, pieces};
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
    const baseVertex = [];
    const vertex = (key, point) => {
      if (!ids.has(key)) {
        ids.set(key, coordinates.length);
        coordinates.push(point);
        baseVertex.push(key[0] === 'v' ? Number(key.slice(1)) : -1);
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
    return {vertices: coordinates, tetrahedra: tets, centroids, baseVertex};
  }

  /**
   * Physical forms of every local basis function of a cell. They depend on
   * the element and the corner coordinates only, so they are shared by every
   * space and every weight that meets the cell (in a bounded bank, oldest
   * evicted first).
   */
  basisForms(space, c, l) {
    if (!this.formCache.has(space)) this.formCache.set(space, new Map());
    const cache = this.formCache.get(space);
    const id = `${c}:${l}`;
    if (!cache.has(id)) {
      const frame = space.frame(c);
      const key = `${this.r}|${l}|${frame.points.map((p) => p.join(','))
          .join(';')}`;
      let forms = this.formBank.get(key);
      if (forms) {
        this.formBank.delete(key);
      } else {
        forms = space.element(l).basis.map(
            (psi) => physicalForm(psi, l, frame));
        if (this.formBank.size >= this.formBankLimit) {
          this.formBank.delete(this.formBank.keys().next().value);
        }
      }
      this.formBank.set(key, forms);
      cache.set(id, forms);
    }
    return cache.get(id);
  }

  // ---------------------------------------------------------------------
  // Patches.

  /** A compact tetrahedral mesh of some cells, with the base numbers. */
  patch(cells, split) {
    const ids = new Map();
    const coordinates = [];
    const baseVertex = [];
    const vertex = (key, point) => {
      if (!ids.has(key)) {
        ids.set(key, coordinates.length);
        coordinates.push(point);
        baseVertex.push(key[0] === 'v' ? Number(key.slice(1)) : -1);
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
    return {vertices: coordinates, tetrahedra: tets, centroids, baseVertex};
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
      eta = this.solveEta(l, sigma, cells, splitSpace, split, star);
    }
    // 2. The potential part.
    let extra = null;
    if (l <= 2) {
      extra = this.solvePotential(
          l, sigma, cells, splitSpace, subCell, eta, split.centroids, star);
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
  solveEta(l, sigma, cells, space, patch, star) {
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
    const onBoundary = this.closureDofs(space, from, patch, star.gammaCFaces);
    const {free, position} = this.freeDofs(space, from, onBoundary);
    const constraints = this.differentialMatrix(space, from, free, position);
    const mass = this.massMatrix(space, from, free, position);
    const target0 = Float64Array.from(rhs, (q) => sign * q);
    // The banded solve is exact up to rounding and far cheaper; the dense
    // solve is the fallback for a system the banded one cannot factor or
    // converge on.
    let solved;
    const started = performance.now();
    let method = 'banded';
    try {
      solved = minimumNormSolveBanded(constraints, mass, target0);
    } catch (error) {
      solved = null;
    }
    if (!solved || !(solved.residual <= 1e-9 * Math.max(solved.scale, 1) &&
        solved.stationarity <= 1e-8)) {
      solved = minimumNormSolveDense(constraints, mass, target0);
      method = 'dense';
    }
    this.stats.push({
      l,
      method,
      unknowns: free.length,
      constraints: constraints.rows,
      milliseconds: performance.now() - started,
      iterations: solved.iterations ?? 0,
      entries: solved.entries ?? 0,
      residual: solved.residual / Math.max(solved.scale, 1e-300),
      stationarity: solved.stationarity ?? 0,
      dualityGap: solved.dualityGap ?? 0,
    });
    if (this.crossCheck) {
      this.recordCrossCheck(l, constraints, mass, target0,
          solved);
    }
    if (!(solved.residual <= 1e-9 * Math.max(solved.scale, 1))) {
      throw new SingularError(
          `no field with the required differential in the star of ` +
          `entity ${sigma} of degree ${l} (residual ${solved.residual})`);
    }
    const coefficients = new Float64Array(space.size(from));
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

  /**
   * Diagnostic for Assumption 2.4 of Arnold and Guzman: the constant of the
   * right inverse of d on the extended star of an entity, with vanishing
   * trace on the whole boundary of the star, in the discrete space of the
   * projector. It is
   *
   *   C = sup { |rho| : d rho = u, rho = 0 on the boundary } / (diam |u|)
   *
   * over u = d x in the range of d, which is 1 / (diam sqrt(mu)) for the
   * smallest nonzero eigenvalue mu of  B^T M_to B x = mu M_from x.
   * Dense: for stars of a few hundred unknowns.
   *
   * @param {number} l Degree of the entity.
   * @param {number} sigma The entity.
   * @param {number} from Degree k of rho, 0 to 2.
   * @return {{constant: number, unknowns: number, diameter: number,
   *     kernel: number}}
   */
  extensionConstant(l, sigma, from) {
    const star = this.topology.extendedStar(
        l, sigma, this.topology.radius(l, sigma));
    const patch = this.patch(star.cells, false);
    const space = new AgSpace(
        patch.vertices, patch.tetrahedra, {degree: this.degree});
    const boundaryFaces = [...star.gammaFaces, ...star.gammaCFaces];
    const outside = (k) => this.closureDofs(space, k, patch, boundaryFaces);
    const {free, position} = this.freeDofs(space, from, outside(from));
    const target = this.freeDofs(space, from + 1, outside(from + 1));
    const n = free.length;
    if (n === 0) return {constant: 0, unknowns: 0, diameter: 0, kernel: 0};
    const b = this.differentialMatrix(space, from, free, position);
    const massFrom = this.massMatrix(space, from, free, position);
    const massTo = this.massMatrix(
        space, from + 1, target.free, target.position);
    // B^T M_to B, with B restricted to the free target rows.
    const dense = (matrix) => {
      const out = new Float64Array(matrix.rows * matrix.columns);
      for (let i = 0; i < matrix.rows; i++) {
        for (let k = matrix.offsets[i]; k < matrix.offsets[i + 1]; k++) {
          out[i * matrix.columns + matrix.indices[k]] += matrix.values[k];
        }
      }
      return out;
    };
    const bDense = dense(b);
    const rowsTo = b.rows;
    const mt = dense(massTo);
    const m = massTo.rows;
    const bFree = new Float64Array(m * n);
    for (let a = 0; a < rowsTo; a++) {
      const p = target.position[a];
      if (p >= 0) bFree.set(bDense.subarray(a * n, (a + 1) * n), p * n);
    }
    const mb = new Float64Array(m * n);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        const v = mt[i * m + j];
        if (v === 0) continue;
        for (let c = 0; c < n; c++) mb[i * n + c] += v * bFree[j * n + c];
      }
    }
    const gram = Array.from({length: n}, () => new Array(n).fill(0));
    for (let i = 0; i < m; i++) {
      for (let a = 0; a < n; a++) {
        const v = bFree[i * n + a];
        if (v === 0) continue;
        for (let c = 0; c < n; c++) gram[a][c] += v * mb[i * n + c];
      }
    }
    // A = L^-1 gram L^-T for M_from = L L^T.
    const factor = cholesky(dense(massFrom), n);
    const forward = (vector) => {
      forwardSubstitute(factor, n, vector);
      return vector;
    };
    const columns = gram.map((row) => forward(Float64Array.from(row)));
    const a = Array.from({length: n}, (_, i) => forward(
        Float64Array.from(columns, (c) => c[i])));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const avg = 0.5 * (a[i][j] + a[j][i]);
        a[i][j] = avg;
        a[j][i] = avg;
      }
    }
    const values = symmetricEigenvalues(a);
    const top = values[values.length - 1];
    const threshold = 1e-9 * top;
    const kernel = values.filter((v) => v <= threshold).length;
    const mu = values.find((v) => v > threshold);
    let diameter = 0;
    for (const p of patch.vertices) {
      for (const q of patch.vertices) {
        diameter = Math.max(diameter, Math.hypot(
            p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
    }
    return {
      constant: 1 / (diameter * Math.sqrt(mu)),
      unknowns: n,
      diameter,
      kernel,
    };
  }

  /**
   * @private Compares a minimum-norm solution with the dense one and keeps
   * the discrepancy in `this.checks` (only when `crossCheck` is set). Both
   * solutions satisfy the constraints; the minimizer has the smaller energy
   * x'Mx, and the banded solver's own certificate (stationarity and duality
   * gap) says how close to the minimizer it is.
   */
  recordCrossCheck(l, constraints, mass, rhs, solved) {
    const dense = minimumNormSolveDense(constraints, mass, rhs);
    const diff = Float64Array.from(solved.x, (q, i) => q - dense.x[i]);
    const energy = (v) => {
      const mv = mass.multiply(v);
      return Math.sqrt(v.reduce((acc, q, i) => acc + q * mv[i], 0));
    };
    let largest = 0;
    let scale = 0;
    diff.forEach((q, i) => {
      largest = Math.max(largest, Math.abs(q));
      scale = Math.max(scale, Math.abs(dense.x[i]));
    });
    this.checks.push({
      l,
      unknowns: mass.rows,
      constraints: constraints.rows,
      relativeMax: largest / Math.max(scale, 1e-300),
      relativeEnergy: energy(diff) / Math.max(energy(dense.x), 1e-300),
      energyRatio: energy(solved.x) / Math.max(energy(dense.x), 1e-300),
      residual: solved.residual / Math.max(solved.scale, 1e-300),
      denseResidual: dense.residual / Math.max(dense.scale, 1e-300),
      stationarity: solved.stationarity,
      dualityGap: solved.dualityGap,
      iterations: solved.iterations,
    });
  }

  /** @private The dofs of degree l that are not excluded, and their place. */
  freeDofs(space, l, excluded) {
    const size = space.size(l);
    const free = [];
    const position = new Int32Array(size).fill(-1);
    for (let a = 0; a < size; a++) {
      if (!excluded[a]) {
        position[a] = free.length;
        free.push(a);
      }
    }
    return {free, position};
  }

  /**
   * The matrix of d from the free dofs of degree `from` to all dofs of
   * degree from + 1.
   * @private
   */
  differentialMatrix(space, from, free, position) {
    const to = from + 1;
    const reference = space.referenceDerivative(from);
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
    return new SparseMatrix(rows.length, free.length, rows.map((row) => {
      const entries = new Map();
      for (const [a, v] of row) {
        if (position[a] >= 0) entries.set(position[a], v);
      }
      return entries;
    }));
  }

  /**
   * Whether each dof of degree l of a patch space lies on the closure of
   * some base faces.
   * @param {!AgSpace} space The patch space.
   * @param {number} l
   * @param {{baseVertex: number[]}} patch The patch, for the base numbers.
   * @param {number[]} faces Base faces.
   * @return {boolean[]}
   */
  closureDofs(space, l, patch, faces) {
    const sets = this.topology.closure(faces);
    const bv = patch.baseVertex;
    const complex = space.complex;
    const baseEdge = (e) => {
      const [a, b] = complex.edges[e].map((v) => bv[v]);
      return a < 0 || b < 0 ? -1 : this.base.edgeIndex(a, b);
    };
    const baseFace = (f) => {
      const ids = complex.faces[f].map((v) => bv[v]);
      return ids.some((q) => q < 0) ? -1 : this.base.faceIndex(...ids);
    };
    return space.dofInfo(l).map(({dimension, entity}) => (
      dimension === 0 ? sets.vertices.has(bv[entity]) :
      dimension === 1 ? sets.edges.has(baseEdge(entity)) :
      dimension === 2 ? sets.faces.has(baseFace(entity)) : false));
  }

  /**
   * An element matrix, from the cache or computed. The key is the kind of
   * matrix, the degrees and the corner coordinates in cell order, so equal
   * geometry gives equal matrices (to the last bit).
   * @private
   */
  block(kind, l, points, compute) {
    const key = `${kind}|${this.r}|${l}|${points.map((p) => p.join(',')).join(';')}`;
    const found = this.blocks.get(key);
    if (found) {
      this.blockHits++;
      this.blocks.delete(key);
      this.blocks.set(key, found);
      return found;
    }
    this.blockMisses++;
    const block = compute();
    this.blocks.set(key, block);
    this.blockDoubles += block.length;
    for (const [oldest, value] of this.blocks) {
      if (this.blockDoubles <= this.blockLimit || oldest === key) break;
      this.blocks.delete(oldest);
      this.blockDoubles -= value.length;
    }
    return block;
  }

  /** Sparse L2 mass matrix of the free dofs of degree l. */
  massMatrix(space, l, free, position) {
    const entries = free.map(() => new Map());
    space.complex.cells.forEach((_, c) => {
      const cellPoints = space.complex.geometry(c).points;
      const dofs = space.cellDofs(c, l);
      const n = dofs.length;
      const block = this.block('mass', l, cellPoints, () => {
        const forms = this.basisForms(space, c, l);
        const rule = tetrahedronRule(cellPoints, this.exactOrder);
        const {values, size} = sampled(forms, rule);
        const weights = Float64Array.from(rule, ({weight}) => weight);
        const out = new Float64Array(n * n);
        for (let i = 0; i < n; i++) {
          for (let j = i; j < n; j++) {
            const sum = inner(values[i], values[j], weights, size);
            out[i * n + j] = sum;
            out[j * n + i] = sum;
          }
        }
        return out;
      });
      dofs.forEach((a, i) => {
        if (position[a] < 0) return;
        const row = entries[position[a]];
        dofs.forEach((b, j) => {
          if (position[b] < 0) return;
          row.set(position[b], (row.get(position[b]) ?? 0) + block[i * n + j]);
        });
      });
    });
    return new SparseMatrix(free.length, free.length, entries);
  }

  /** @private The potential and the resulting P on every sub-cell. */
  solvePotential(
      l, sigma, cells, splitSpace, subCell, eta, centroids, star) {
    const base = this.patch(cells, false);
    const space = new AgSpace(base.vertices, base.tetrahedra,
        {degree: this.degree});
    const size = space.size(l);
    const excluded = this.closureDofs(space, l, base, star.gammaFaces);
    const mu = this.bubbleWeights(splitSpace, centroids);
    const rule = (s) => tetrahedronRule(
        splitSpace.complex.geometry(s).points, this.exactOrder);
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
    // The stiffness of mu d psi_a . d psi_b depends on the cell alone (mu is
    // the bump of its own centroid), so it is cached per cell.
    const stiffness = new Map();
    const cellStiffness = (c) => {
      if (!stiffness.has(c)) {
        const cellPoints = space.complex.geometry(c).points;
        const n = space.cellDofs(c, l).length;
        stiffness.set(c, this.block('potential', l, cellPoints, () => {
          const out = new Float64Array(n * n);
          const derived = dForms(c);
          for (let k = 0; k < 4; k++) {
            const s = 4 * c + k;
            const points = rule(s);
            const weights = Float64Array.from(
                points, ({x, weight}) => weight * mu[s].evaluate(x));
            const dv = sampled(derived, points);
            for (let i = 0; i < n; i++) {
              for (let j = i; j < n; j++) {
                const sum = inner(dv.values[i], dv.values[j], weights, dv.size);
                out[i * n + j] += sum;
                if (j !== i) out[j * n + i] += sum;
              }
            }
          }
          return out;
        }));
      }
      return stiffness.get(c);
    };
    for (let c = 0; c < cells.length; c++) {
      const block = cellStiffness(c);
      const dofs = space.cellDofs(c, l);
      const n = dofs.length;
      dofs.forEach((a, i) => {
        dofs.forEach((b, j) => {
          entries[a].set(b, (entries[a].get(b) ?? 0) + block[i * n + j]);
        });
      });
    }
    splitSpace.complex.cells.forEach((_, s) => {
      const {cell} = subCell(s);
      const c = cells.indexOf(cell);
      const forms = this.basisForms(space, c, l);
      const dofs = space.cellDofs(c, l);
      const points = rule(s);
      const quadrature = Float64Array.from(points, ({weight}) => weight);
      const v = sampled(forms, points);
      const etaValues = sampled([eta[s]], points).values[0];
      dofs.forEach((a, i) => {
        rhs[a] -= inner(etaValues, v.values[i], quadrature, v.size);
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
    // Unknowns: the dofs not excluded by the boundary condition.
    const free = [];
    const at = new Int32Array(size).fill(-1);
    for (let a = 0; a < size; a++) {
      if (!excluded[a]) {
        at[a] = free.length;
        free.push(a);
      }
    }
    const n = free.length;
    const reduced = Float64Array.from(free, (a) => rhs[a]);
    const reducedEntries = free.map((a) => {
      const row = new Map();
      entries[a].forEach((v, c) => {
        if (at[c] >= 0) row.set(at[c], v);
      });
      return row;
    });
    const matrix = new SparseMatrix(n, n, reducedEntries);
    let direct = null;
    try {
      direct = solveSemidefiniteBanded(matrix, reduced);
    } catch (error) {
      direct = null;
    }
    const scaleOf = Math.max(Math.hypot(...reduced), 1e-300);
    if (!direct || !(direct.residual / scaleOf < 1e-8)) {
      const dense = new Float64Array(n * n);
      reducedEntries.forEach((row, i) => row.forEach((v, c) => {
        dense[i * n + c] = v;
      }));
      direct = solveSemidefinite(dense, n, reduced, 1e-13);
    }
    const x = new Float64Array(size);
    free.forEach((a, i) => (x[a] = direct.x[i]));
    const solved = {x, relativeResidual: direct.residual / scaleOf};
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

  /**
   * The cell bubble mu on every sub-cell of a split patch: the barycentric
   * coordinate of the cell's centroid, one at the centroid and zero on the
   * faces of the original cell.
   */
  bubbleWeights(splitSpace, centroids) {
    return splitSpace.complex.cells.map((corners, s) => {
      const {gradients, points} = splitSpace.complex.geometry(s);
      const at = corners.indexOf(centroids[s >> 2]);
      const g = gradients[at];
      // lambda_i(x) = g_i . (x - p0) + [i = 0]
      return affine((at === 0 ? 1 : 0) -
        g.reduce((acc, q, i) => acc + q * points[0][i], 0), g);
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
