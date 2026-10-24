/**
 * Canonical (Arnold-Falk-Winther) interpolation onto P_r^- Lambda^k of any
 * degree r = p + 1 >= 1: Lagrange (l = 0), Nedelec of the first kind (l = 1),
 * Raviart-Thomas (l = 2) and discontinuous (l = 3) elements on a tetrahedral
 * mesh. The degrees of freedom are moments of the pull-back of the input to
 * each edge, face and cell, so the input needs enough regularity for them to
 * exist, and the interpolation is not stable in L2 (see StableProjector for
 * the lowest-order locally bounded operator). It is a projection, preserves
 * the trace on the boundary and commutes with the exterior derivative.
 */

import {ValidateError, ProjectError} from './errors.js';
import {SimplicialComplex} from './simplicial-complex.js';
import {moments, referenceBasis} from './reference-element.js';
import {differential} from './polynomial-forms.js';
import {validateMeshInput} from './mesh.js';

const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const FACE_TRIPLES = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]];

const sub = (a, b) => a.map((q, i) => q - b[i]);
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const matrixVector = (rows, v) => rows.map((row) => dot(row, v));

// Keyed by the element (the canonical and the Arnold-Guzman bases differ).
const derivativeCache = new WeakMap();

export class CanonicalProjector {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} tetrahedra Tetrahedra as four vertex indices.
   * @param {{degree: (number|undefined), quadratureOrder:
   *     (number|undefined)}=} options `degree` is the polynomial degree p of
   *     the library's convention (p = 0 is the Whitney space).
   */
  constructor(vertices, tetrahedra, options = {}) {
    // AgSpace builds this class on patches of cells whose orientation is of
    // no consequence to it; only a caller's own mesh is checked.
    if (!options.trusted) {
      validateMeshInput(vertices, tetrahedra, {allowFlipped: true});
    }
    const p = options.degree ?? 0;
    if (!Number.isInteger(p) || p < 0) {
      throw new ValidateError('degree must be a nonnegative integer');
    }
    this.r = p + 1;
    this.complex = new SimplicialComplex(vertices, tetrahedra);
    this.order = options.quadratureOrder ?? this.r + 3;
    this.layouts = new Map();
  }

  /** The reference element of degree l: dual basis and dof carriers. */
  element(l) {
    return referenceBasis(this.r, l);
  }

  /** The cell's map x = p0 + J s, with the inverse transpose and det J. */
  frame(c) {
    const {points} = this.complex.geometry(c);
    const columns = [1, 2, 3].map((i) => sub(points[i], points[0]));
    const det = dot(columns[0], cross(columns[1], columns[2]));
    // Rows of J^{-1} are the cross products of the other columns over det.
    const inverse = [
      cross(columns[1], columns[2]),
      cross(columns[2], columns[0]),
      cross(columns[0], columns[1]),
    ].map((row) => row.map((q) => q / det));
    return {points, columns, det, inverse};
  }

  /** Global dof numbering of degree l: block offsets per entity dimension. */
  layout(l) {
    if (this.layouts.has(l)) return this.layouts.get(l);
    const {carriers: list, offsets: first} = this.element(l);
    const perEntity = [0, 1, 2, 3].map((m) => {
      const at = list.findIndex((c) => c.dimension === m);
      return at < 0 ? 0 : first[at + 1] - first[at];
    });
    const counts = [
      this.complex.vertices.length,
      this.complex.edges.length,
      this.complex.faces.length,
      this.complex.cells.length,
    ];
    const offsets = [0];
    for (let m = 0; m < 4; m++) {
      offsets.push(offsets[m] + perEntity[m] * counts[m]);
    }
    const out = {perEntity, offsets, size: offsets[4]};
    this.layouts.set(l, out);
    return out;
  }

  /** Number of degrees of freedom in degree l. */
  size(l) {
    return this.layout(l).size;
  }

  /** The entity of a carrier in cell c: its dimension and global number. */
  entityOf(c, carrier) {
    const {vertices, dimension: m} = carrier;
    if (m === 0) return this.complex.cells[c][vertices[0]];
    if (m === 1) {
      return this.complex.cellEdges[c][EDGE_PAIRS.findIndex(
          (pair) => pair[0] === vertices[0] && pair[1] === vertices[1])];
    }
    if (m === 2) {
      return this.complex.cellFaces[c][FACE_TRIPLES.findIndex(
          (triple) => triple.every((v, i) => v === vertices[i]))];
    }
    return c;
  }

  /** Global dof numbers of cell c in the order of the reference basis. */
  cellDofs(c, l) {
    const {perEntity, offsets} = this.layout(l);
    const {carriers: list} = this.element(l);
    const out = [];
    for (const carrier of list) {
      const m = carrier.dimension;
      const base = offsets[m] + perEntity[m] * this.entityOf(c, carrier);
      for (let t = 0; t < perEntity[m]; t++) out.push(base + t);
    }
    return out;
  }

  /**
   * All canonical degrees of freedom of the input.
   * @param {function(number[]): (number|number[])} u Scalar field for
   *     l = 0, 3 and vector field for l = 1, 2.
   * @param {number} l Form degree.
   * @return {Float64Array}
   */
  coefficients(u, l) {
    const {perEntity, offsets, size} = this.layout(l);
    const out = new Float64Array(size);
    const {carriers: list} = this.element(l);
    const done = new Uint8Array(size);
    this.complex.cells.forEach((_, c) => {
      const {points} = this.complex.geometry(c);
      for (const carrier of list) {
        const m = carrier.dimension;
        const base = offsets[m] + perEntity[m] * this.entityOf(c, carrier);
        if (done[base]) continue;
        moments(l, carrier, points, u, this.order).forEach((value, t) => {
          if (!Number.isFinite(value)) {
            throw new ProjectError('a degree of freedom is not finite');
          }
          out[base + t] = value;
        });
        done[base] = 1;
      }
    });
    return out;
  }

  /** The reference point of x in cell c. */
  referencePoint(c, x) {
    const {points, inverse} = this.frame(c);
    return matrixVector(inverse, sub(x, points[0]));
  }

  /**
   * Value of sum_i coefficients[i] psi_i at a point of a cell.
   * @param {Float64Array} coefficients From `coefficients`.
   * @param {number[]} point
   * @param {number} c Cell.
   * @param {number} l Form degree.
   * @return {number|number[]}
   */
  evaluate(coefficients, point, c, l) {
    const {basis} = this.element(l);
    const dofs = this.cellDofs(c, l);
    const s = this.referencePoint(c, point);
    const {columns, det, inverse} = this.frame(c);
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0];
    basis.forEach((psi, i) => {
      const weight = coefficients[dofs[i]];
      if (weight === 0) return;
      const reference = Array.isArray(psi) ?
        psi.map((p) => p.evaluate(s)) : psi.evaluate(s);
      let mapped;
      if (l === 0) {
        mapped = reference;
      } else if (l === 1) {
        // J^{-T} psi: components are dot products with the columns of J^{-1}.
        mapped = [0, 1, 2].map((a) => dot(
            inverse.map((row) => row[a]), reference));
      } else if (l === 2) {
        mapped = [0, 1, 2].map((a) => columns.reduce(
            (acc, col, j) => acc + col[a] * reference[j], 0) / det);
      } else {
        mapped = reference / det;
      }
      total = typeof total === 'number' ?
        total + weight * mapped :
        total.map((q, a) => q + weight * mapped[a]);
    });
    return total;
  }

  /**
   * Value of the exterior derivative of the interpolant: the gradient (l = 0),
   * the curl (l = 1) or the divergence (l = 2).
   */
  derivative(coefficients, point, c, l) {
    const derivatives = this.derivativeBasis(l);
    const dofs = this.cellDofs(c, l);
    const s = this.referencePoint(c, point);
    const {columns, det, inverse} = this.frame(c);
    let total = l === 2 ? 0 : [0, 0, 0];
    derivatives.forEach((d, i) => {
      const weight = coefficients[dofs[i]];
      if (weight === 0) return;
      let mapped;
      if (l === 0) {
        const grad = d.map((p) => p.evaluate(s));
        mapped = [0, 1, 2].map((a) => dot(inverse.map((row) => row[a]), grad));
      } else if (l === 1) {
        const curl = d.map((p) => p.evaluate(s));
        mapped = [0, 1, 2].map((a) => columns.reduce(
            (acc, col, j) => acc + col[a] * curl[j], 0) / det);
      } else {
        mapped = d.evaluate(s) / det;
      }
      total = typeof total === 'number' ?
        total + weight * mapped :
        total.map((q, a) => q + weight * mapped[a]);
    });
    return total;
  }

  /**
   * The exterior derivatives of the reference basis functions of degree l
   * (gradient, curl or divergence), differentiated once per element.
   * @private
   */
  derivativeBasis(l) {
    const element = this.element(l);
    let out = derivativeCache.get(element);
    if (!out) {
      out = element.basis.map((psi) => differential(psi, l));
      derivativeCache.set(element, out);
    }
    return out;
  }

  /**
   * Value of the interpolant of u at a point of a cell.
   * @return {number|number[]}
   */
  project(u, point, cell, l) {
    return this.evaluate(this.coefficients(u, l), point, cell, l);
  }
}
