/**
 * Local weight functions of Ern, Guzman, Potu and Vohralik (arXiv:2502.03601)
 * for the lowest-order (p = 0) commuting projections with homogeneous
 * boundary conditions on the whole boundary of the domain (their Theorem 6.1).
 *
 * For every vertex, edge, face and cell sigma of the mesh that does not lie
 * on the boundary, the weight Z(sigma) is supported on the extended star of
 * sigma (all cells touching sigma) and satisfies
 *
 *   (Z(sigma), u) = dof_sigma(u)   for every u in the zero-trace Whitney space,
 *   -div  Z(edge) = sum over its vertices of  incidence * Z(vertex),
 *    curl Z(face) = sum over its edges of     incidence * Z(edge),
 *   -grad Z(cell) = sum over its faces of     incidence * Z(face).
 *
 * Each weight is a Whitney form on the Alfeld split of the mesh (every cell
 * is split into four by its barycenter) and is stored by its degrees of
 * freedom on the split entities, so that a weight on a small star embeds in a
 * larger star by key lookup.
 *
 * Each weight is built by two local solves. First a minimum-norm field eta
 * with the prescribed differential (zero normal or tangential trace on the
 * part of the star boundary that is interior to the domain). Then a potential
 * psi on the original mesh from a discrete local problem weighted by the cell
 * bubble mu, and Z = eta +/- d(mu d psi).
 */

import {
  SimplicialComplex,
  add,
  sub,
  scale,
  dot,
  cross,
  tetrahedronRule,
} from './simplicial-complex.js';
import {solveSemidefinite, minimumNormSolve} from './dense-linear-algebra.js';
import {
  SparseMatrix,
  solveConsistent,
  minimumNormSolveSparse,
} from './sparse-linear-algebra.js';
import {SingularError, ValidateError} from './errors.js';

/** Quadrature order that integrates products of two Whitney fields exactly. */
const MASS_ORDER = 3;

/** Largest number of cell rings tried when a star violates the assumptions. */
const MAX_RADIUS = 4;

const MACHINE_EPSILON = 1.1102230246251565e-16;

/** Pre-registered in validation/tolerances.json
 * (stableOperator.localSolveResidual). */
const RESIDUAL_FACTOR = 100;

/** Relative residual bound for the iterative solvers (see requireSmall). */
const ITERATIVE_RELATIVE_BOUND = 1e-8;

const EDGE_PAIRS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

const inner = (a, b) => (typeof a === 'number' ? a * b : dot(a, b));

export class LocalWeights {
  /**
   * @param {!Array<!Array<number>>} vertices
   * @param {!Array<!Array<number>>} tetrahedra
   * @param {{dense: (boolean|undefined),
   *   boundaryConditions: (boolean|undefined)}=} options -
   *   `boundaryConditions: false` computes the weights of the projection
   *   without boundary conditions (arXiv:2502.03601, Thm 5.1): every entity,
   *   boundary ones included, gets a weight, and all of the star boundary
   *   carries the zero-flux condition. The default is the zero-trace
   *   projection (Thm 6.1). `dense` selects the dense
   *   direct solvers, a slow reference used to check the default sparse
   *   conjugate-gradient solvers.
   */
  constructor(vertices, tetrahedra, options = {}) {
    this.dense = options.dense === true;
    this.boundaryConditions = options.boundaryConditions !== false;
    this.base = new SimplicialComplex(vertices, tetrahedra);
    const count = vertices.length;
    const splitVertices = vertices.concat(
        this.base.cells.map((_, t) => {
          const {points} = this.base.geometry(t);
          return scale(points.reduce(add), 0.25);
        }),
    );
    const splitCells = [];
    this.base.cells.forEach((v, t) => {
      for (let k = 0; k < 4; k++) {
        splitCells.push([...v.filter((_, i) => i !== k), count + t]);
      }
    });
    this.split = new SimplicialComplex(splitVertices, splitCells);
    this.vertexCells = vertices.map(() => []);
    this.base.cells.forEach((v, t) =>
      v.forEach((x) => this.vertexCells[x].push(t)),
    );
    this.boundaryVertices = new Set();
    this.boundaryEdges = new Set();
    this.base.faces.forEach((f, index) => {
      if (!this.base.isBoundaryFace(index)) return;
      f.forEach((v) => this.boundaryVertices.add(v));
      this.base.faceEdges[index].forEach((e) => this.boundaryEdges.add(e));
    });
    this.weights = [new Map(), new Map(), new Map(), new Map()];
    this.radii = [new Map(), new Map(), new Map(), new Map()];
  }

  /** Whether the entity of degree l lies on the boundary of the domain. */
  isBoundary(l, index) {
    if (!this.boundaryConditions) return false;
    if (l === 0) return this.boundaryVertices.has(index);
    if (l === 1) return this.boundaryEdges.has(index);
    if (l === 2) return this.base.isBoundaryFace(index);
    return false;
  }

  /**
   * The weight of an entity: its degrees of freedom on the Alfeld split and
   * the split cells it is supported on. Null for entities on the boundary,
   * whose weight is zero.
   * @param {number} l - Degree 0 (vertex) to 3 (cell).
   * @param {number} index
   * @return {?{dofs: !Map<number, number>, cells: !Array<number>}}
   */
  weight(l, index) {
    const cache = this.weights[l];
    if (cache.has(index)) return cache.get(index);
    const result = this.isBoundary(l, index) ?
      null :
      this.computeWeight(l, index);
    cache.set(index, result);
    return result;
  }

  /**
   * Smallest star radius, not below that of the entity's boundary entities
   * (so their weights embed), whose star satisfies the topological
   * assumptions of the construction.
   * @param {number} l
   * @param {number} index
   * @return {number}
   * @throws {ValidateError} If no radius up to MAX_RADIUS is admissible.
   */
  radius(l, index) {
    const cache = this.radii[l];
    if (cache.has(index)) return cache.get(index);
    let radius = 1;
    if (l > 0) {
      for (const {entity} of this.base.boundary(l, index)) {
        if (!this.isBoundary(l - 1, entity)) {
          radius = Math.max(radius, this.radius(l - 1, entity));
        }
      }
    }
    while (
      radius <= MAX_RADIUS &&
      !this.isAdmissible(this.extendedStar(l, index, radius))
    ) {
      radius++;
    }
    if (radius > MAX_RADIUS) {
      throw new ValidateError(
          `no admissible extended star of up to ${MAX_RADIUS} rings around ` +
          `${['vertex', 'edge', 'face', 'cell'][l]} ${index}: its boundary patches are ` +
          'disconnected or its star is not a ball, so the mesh violates the assumptions of the construction',
      );
    }
    cache.set(index, radius);
    return radius;
  }

  /**
   * Whether the star is a ball whose boundary splits into one connected patch
   * on the domain boundary and one connected patch inside the domain (or has
   * no part on the domain boundary), as the construction assumes.
   * @private
   */
  isAdmissible(star) {
    const boundary = star.gammaFaces.concat(star.gammaCFaces);
    if (!this.isSphere(boundary)) return false;
    if (
      star.gammaFaces.length > 0 &&
      this.edgeComponents(star.gammaFaces) !== 1
    ) {
      return false;
    }
    return this.edgeComponents(star.gammaCFaces) === 1;
  }

  /** @private Whether a set of faces is one closed surface of Euler
   *     characteristic 2. */
  isSphere(faces) {
    if (this.edgeComponents(faces) !== 1) return false;
    const edgeUse = new Map();
    const vertices = new Set();
    for (const f of faces) {
      for (const e of this.base.faceEdges[f]) {
        edgeUse.set(e, (edgeUse.get(e) ?? 0) + 1);
      }
      for (const v of this.base.faces[f]) vertices.add(v);
    }
    for (const count of edgeUse.values()) if (count !== 2) return false;
    return vertices.size - edgeUse.size + faces.length === 2;
  }

  /** @private Number of components of a set of faces, connected through shared
   *     edges. */
  edgeComponents(faces) {
    const parent = new Map(faces.map((f) => [f, f]));
    const find = (x) => {
      while (parent.get(x) !== x) x = parent.get(x);
      return x;
    };
    const owner = new Map();
    for (const f of faces) {
      for (const e of this.base.faceEdges[f]) {
        if (owner.has(e)) parent.set(find(f), find(owner.get(e)));
        else owner.set(e, f);
      }
    }
    return new Set(faces.map(find)).size;
  }

  /**
   * Integral of the weight times a field over the weight's support.
   * @param {number} l
   * @param {number} index
   * @param {function(!Array<number>): (number|!Array<number>)} u
   * @param {number=} order - Gauss points per direction.
   * @return {number}
   */
  pair(l, index, u, order = 4) {
    const w = this.weight(l, index);
    if (!w) return 0;
    let sum = 0;
    for (const s of w.cells) {
      for (const {x, weight} of tetrahedronRule(
          this.split.geometry(s).points,
          order,
      )) {
        sum += weight * inner(this.evaluate(l, w.dofs, s, x), u(x, s >> 2));
      }
    }
    return sum;
  }

  /** Value of a weight with the given degrees of freedom in split cell s at x.
   * */
  evaluate(l, dofs, s, x) {
    if (l === 0) return dofs.get(s) ?? 0;
    const entities = this.split.cellEntities(s, 3 - l);
    const basis = this.split.whitney(s, 3 - l, x);
    if (l === 3) {
      return entities.reduce(
          (sum, e, k) => sum + (dofs.get(e) ?? 0) * basis[k],
          0,
      );
    }
    let value = [0, 0, 0];
    entities.forEach((e, k) => {
      const coefficient = dofs.get(e);
      if (coefficient) value = add(value, scale(basis[k], coefficient));
    });
    return value;
  }

  /** @private */
  computeWeight(l, index) {
    const star = this.extendedStar(l, index, this.radius(l, index));
    const eta = this.solveEta(l, index, star);
    if (l === 3) return {dofs: eta, cells: star.splitCells};
    const psi = this.solvePsi(l, index, star, eta);
    return this.assemble(l, star, eta, psi);
  }

  /**
   * The radius-fold extended star of an entity: all cells within `radius`
   * rings of cells touching it, with the parts of its boundary that lie on the
   * domain boundary (gamma) and in the interior of the domain (gammaC).
   * @private
   */
  extendedStar(l, index, radius = 1) {
    const vertices =
      l === 0 ?
        [index] :
        l === 1 ?
          this.base.edges[index] :
          l === 2 ?
            this.base.faces[index] :
            this.base.cells[index];
    let set = new Set();
    for (const v of vertices) for (const c of this.vertexCells[v]) set.add(c);
    for (let ring = 1; ring < radius; ring++) {
      const next = new Set(set);
      for (const c of set) {
        for (const v of this.base.cells[c]) {
          for (const x of this.vertexCells[v]) next.add(x);
        }
      }
      set = next;
    }
    const cells = [...set].sort((a, b) => a - b);
    const gamma = [];
    const gammaC = [];
    let volume = 0;
    for (const c of cells) {
      volume += this.base.geometry(c).volume;
      for (const f of this.base.cellFaces[c]) {
        const inside = this.base.faceCells[f].filter((x) => set.has(x)).length;
        if (inside !== 1) continue;
        const onDomainBoundary =
          this.boundaryConditions && this.base.isBoundaryFace(f);
        (onDomainBoundary ? gamma : gammaC).push(f);
      }
    }
    return {
      cells,
      cellSet: set,
      splitCells: cells.flatMap((c) => [
        4 * c,
        4 * c + 1,
        4 * c + 2,
        4 * c + 3,
      ]),
      volume,
      gamma: this.closure(gamma),
      gammaC: this.closure(gammaC),
      gammaFaces: gamma,
      gammaCFaces: gammaC,
    };
  }

  /** @private Vertices, edges and faces of a set of base faces. */
  closure(faces) {
    const vertices = new Set();
    const edges = new Set();
    const faceSet = new Set(faces);
    for (const f of faces) {
      this.base.faces[f].forEach((v) => vertices.add(v));
      this.base.faceEdges[f].forEach((e) => edges.add(e));
    }
    return {vertices, edges, faces: faceSet};
  }

  /**
   * Split entities of a degree that are excluded by the boundary condition on
   * a closure of base faces.
   * @private
   */
  excludedSplitEntities(degree, closure) {
    const out = new Set();
    if (degree === 0) closure.vertices.forEach((v) => out.add(v));
    if (degree === 1) {
      closure.edges.forEach((e) =>
        out.add(this.split.edgeIndex(...this.base.edges[e])),
      );
    }
    if (degree === 2) {
      closure.faces.forEach((f) =>
        out.add(this.split.faceIndex(...this.base.faces[f])),
      );
    }
    return out;
  }

  /**
   * Minimum-norm field eta with the prescribed differential. For degree 0 it
   * is the constant 1 / |ES| on every split cell. Returns a map from split
   * entities of degree 3 - l to values.
   * @private
   */
  solveEta(l, index, star) {
    if (l === 0) {
      return new Map(star.splitCells.map((s) => [s, 1 / star.volume]));
    }
    const degree = 3 - l;
    const excluded = this.excludedSplitEntities(degree, star.gammaC);
    const unknown = new Map();
    for (const s of star.splitCells) {
      for (const e of this.split.cellEntities(s, degree)) {
        if (!excluded.has(e) && !unknown.has(e)) unknown.set(e, unknown.size);
      }
    }
    const n = unknown.size;
    const massEntries = Array.from({length: n}, () => new Map());
    for (const s of star.splitCells) {
      const entities = this.split.cellEntities(s, degree);
      for (const {x, weight} of tetrahedronRule(
          this.split.geometry(s).points,
          MASS_ORDER,
      )) {
        const basis = this.split.whitney(s, degree, x);
        for (let i = 0; i < entities.length; i++) {
          const a = unknown.get(entities[i]);
          if (a === undefined) continue;
          for (let j = 0; j < entities.length; j++) {
            const b = unknown.get(entities[j]);
            if (b !== undefined) {
              accumulate(massEntries[a], b, weight * inner(basis[i], basis[j]));
            }
          }
        }
      }
    }

    // Right-hand side: sum of incidence * lower-degree weights, as split dofs.
    const lower = this.base
        .boundary(l, index)
        .map(({entity, sign}) => ({sign, weight: this.weight(l - 1, entity)}));
    const incoming = (key) =>
      lower.reduce(
          (sum, {sign, weight}) =>
            sum + (weight ? sign * (weight.dofs.get(key) ?? 0) : 0),
          0,
      );

    const rowEntities =
      l === 1 ?
        star.splitCells :
        [
          ...new Set(
              star.splitCells.flatMap((s) => this.split.cellEntities(s, 4 - l)),
          ),
        ];
    const rowEntries = [];
    const targets = [];
    let skipped = 0;
    let targetScale = 0;
    for (const r of rowEntities) {
      const row = new Map();
      for (const {entity, sign} of this.split.boundary(
        l === 1 ? 3 : l === 2 ? 2 : 1,
        r,
      )) {
        const column = unknown.get(entity);
        if (column !== undefined) accumulate(row, column, sign);
      }
      let target = incoming(r);
      if (l === 1) target = -target * this.split.geometry(r).volume;
      if (l === 3) target = -target;
      targetScale = Math.max(targetScale, Math.abs(target));
      if (row.size > 0) {
        rowEntries.push(row);
        targets.push(target);
      } else {
        skipped += target * target;
      }
    }
    const rhs = Float64Array.from(targets);
    let solved;
    if (this.dense) {
      const rows = rowEntries.map((entries) => {
        const row = new Float64Array(n);
        for (const [j, v] of entries) row[j] = v;
        return row;
      });
      const mass = new Float64Array(n * n);
      massEntries.forEach((entries, i) => {
        for (const [j, v] of entries) mass[i * n + j] = v;
      });
      solved = minimumNormSolve(rows, mass, n, rhs);
    } else {
      solved = minimumNormSolveSparse(
          new SparseMatrix(rowEntries.length, n, rowEntries),
          new SparseMatrix(n, n, massEntries),
          rhs,
      );
    }
    const {x, residual, scale: size, condition} = solved;
    this.requireSmall(
        `eta for degree ${l}`,
        Math.hypot(residual, Math.sqrt(skipped)),
        size + targetScale,
        condition,
    );
    const eta = new Map();
    for (const [entity, column] of unknown) eta.set(entity, x[column]);
    return eta;
  }

  /**
   * Potential psi on the original mesh: the discrete local problem
   *   (mu d psi, d u) = dof_sigma(u) - (eta, u)
   * for all u in the zero-trace space of the star. Only d psi is used, so the
   * null space of d is irrelevant.
   * @private
   */
  solvePsi(l, index, star, eta) {
    const excluded =
      l === 0 ?
        star.gamma.vertices :
        l === 1 ?
          star.gamma.edges :
          star.gamma.faces;
    const unknown = new Map();
    for (const c of star.cells) {
      for (const e of this.base.cellEntities(c, l)) {
        if (!excluded.has(e) && !unknown.has(e)) unknown.set(e, unknown.size);
      }
    }
    const n = unknown.size;
    const stiffnessEntries = Array.from({length: n}, () => new Map());
    for (const c of star.cells) {
      const entities = this.base.cellEntities(c, l);
      const weight = this.base.geometry(c).volume / 4;
      const derivatives = this.derivatives(c, l);
      for (let i = 0; i < entities.length; i++) {
        const a = unknown.get(entities[i]);
        if (a === undefined) continue;
        for (let j = 0; j < entities.length; j++) {
          const b = unknown.get(entities[j]);
          if (b !== undefined) {
            accumulate(
                stiffnessEntries[a],
                b,
                weight * inner(derivatives[i], derivatives[j]),
            );
          }
        }
      }
    }
    const rhs = new Float64Array(n);
    const own = unknown.get(index);
    if (own !== undefined) rhs[own] += 1;
    for (const s of star.splitCells) {
      const c = s >> 2;
      const entities = this.base.cellEntities(c, l);
      for (const {x, weight} of tetrahedronRule(
          this.split.geometry(s).points,
          MASS_ORDER,
      )) {
        const field = l === 0 ? eta.get(s) : this.evaluateEta(l, eta, s, x);
        const basis = this.base.whitney(c, l, x);
        for (let k = 0; k < entities.length; k++) {
          const row = unknown.get(entities[k]);
          if (row !== undefined) rhs[row] -= weight * inner(field, basis[k]);
        }
      }
    }
    let x;
    let residual;
    let condition = null;
    let size;
    if (this.dense) {
      const stiffness = new Float64Array(n * n);
      stiffnessEntries.forEach((entries, i) => {
        for (const [j, v] of entries) stiffness[i * n + j] = v;
      });
      ({x, residual, condition} = solveSemidefinite(stiffness, n, rhs));
      size = norm(rhs) + norm(stiffness) * norm(x);
    } else {
      const stiffness = new SparseMatrix(n, n, stiffnessEntries);
      const diagonal = stiffness.diagonal();
      const inverseDiagonal = diagonal.every((d) => d > 0) ?
        diagonal.map((d) => 1 / d) :
        undefined;
      x = solveConsistent((v, out) => stiffness.multiply(v, out), rhs, {
        maxIterations: 20 * n + 100,
        inverseDiagonal,
      }).x;
      const check = stiffness.multiply(x);
      residual = Math.hypot(...check.map((value, i) => value - rhs[i]));
      size = norm(rhs);
    }
    this.requireSmall(`psi for degree ${l}`, residual, size, condition);
    const psi = new Map();
    for (const [entity, column] of unknown) psi.set(entity, x[column]);
    return psi;
  }

  /** Value of the minimum-norm field eta (degree >= 1) in split cell s at x. */
  evaluateEta(l, eta, s, x) {
    return this.evaluate(l, eta, s, x);
  }

  /**
   * Differential of the Whitney basis of degree l in base cell c, constant
   * on the cell: gradient (l=0), curl (l=1) or divergence (l=2).
   * @private
   */
  derivatives(c, l) {
    const {gradients, volume} = this.base.geometry(c);
    if (l === 0) return gradients;
    if (l === 1) {
      return EDGE_PAIRS.map(([i, j]) =>
        scale(cross(gradients[i], gradients[j]), 2),
      );
    }
    return this.base.cellFaceSigns[c].map((sign) => sign / volume);
  }

  /**
   * Weight Z = eta +/- d(mu d psi), expressed in degrees of freedom on the
   * split. Here d(mu d psi) is piecewise constant, with mu the barycentric
   * coordinate of the barycenter in each sub-cell.
   * @private
   */
  assemble(l, star, eta, psi) {
    const dofs = new Map();
    const bump = (s) => this.split.geometry(s).gradients[3];
    const potentialDerivative = (c) => {
      const entities = this.base.cellEntities(c, l);
      const derivatives = this.derivatives(c, l);
      let total = l === 2 ? 0 : [0, 0, 0];
      entities.forEach((e, k) => {
        const value = psi.get(e);
        if (!value) return;
        total =
          l === 2 ?
            total + value * derivatives[k] :
            add(total, scale(derivatives[k], value));
      });
      return total;
    };
    if (l === 0) {
      for (const s of star.splitCells) {
        dofs.set(s, eta.get(s) - dot(potentialDerivative(s >> 2), bump(s)));
      }
    } else if (l === 1) {
      const seen = new Map();
      for (const s of star.splitCells) {
        const field = cross(bump(s), potentialDerivative(s >> 2));
        for (const f of this.split.cellFaces[s]) {
          const [a, b, d] = this.split.faces[f].map(
              (v) => this.split.vertices[v],
          );
          // |n| is twice the area, so the flux of a constant field is half of
          // field . n.
          const flux = 0.5 * dot(field, cross(sub(b, a), sub(d, a)));
          const previous = seen.get(f);
          if (previous === undefined) {
            seen.set(f, flux);
          } else if (
            Math.abs(previous - flux) >
            1e-9 * (Math.abs(flux) + Math.abs(previous) + 1)
          ) {
            throw new SingularError(
                'normal flux of d(mu curl psi) is discontinuous across a split face',
            );
          }
        }
      }
      for (const [f, flux] of seen) dofs.set(f, (eta.get(f) ?? 0) + flux);
    } else {
      const divergence = new Map();
      for (const c of star.cells) divergence.set(c, potentialDerivative(c));
      const edgeSet = new Set(
          star.splitCells.flatMap((s) => this.split.cellEdges[s]),
      );
      const count = this.base.vertices.length;
      for (const e of edgeSet) {
        const [, y] = this.split.edges[e];
        const lift = y >= count ? divergence.get(y - count) : 0;
        dofs.set(e, (eta.get(e) ?? 0) - lift);
      }
    }
    return {dofs, cells: star.splitCells};
  }

  /**
   * Guard against inconsistent local problems. With a dense solve the bound
   * is the pre-registered 100 * eps * condition * size; the iterative solvers
   * give no condition estimate, so they are held to a fixed relative 1e-8,
   * which is far above roundoff and far below the O(1) residual of a star
   * that violates the construction's assumptions.
   * @private
   */
  requireSmall(label, residual, size, condition) {
    const bound =
      condition === null || condition === undefined ?
        ITERATIVE_RELATIVE_BOUND * Math.max(size, 1e-300) :
        RESIDUAL_FACTOR *
          MACHINE_EPSILON *
          condition *
          Math.max(size, 1e-300);
    if (!(residual <= bound)) {
      throw new SingularError(
          `local problem for ${label} is inconsistent (residual ${residual.toExponential(2)} > ` +
          `${bound.toExponential(2)}); the extended star probably violates the contractibility ` +
          'assumption of the construction, as on a very coarse mesh',
      );
    }
  }
}

/** Adds a value to a sparse row held as a column-to-value map. */
function accumulate(row, column, value) {
  row.set(column, (row.get(column) ?? 0) + value);
}

function norm(v) {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}
