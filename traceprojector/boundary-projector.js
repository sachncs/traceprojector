/**
 * The boundary operator of Ern, Guzman, Potu and Vohralik at lowest order:
 * Pi_boundary u = sum over boundary simplices r of alpha_r(u) W_r, where W_r is
 * the Whitney form of r and alpha_r pairs u with the extension Y_r of the
 * boundary weight into the bulk. Y_r lives on the Worsey-Farin split of the
 * mesh, takes the boundary weight as its boundary degrees of freedom and has
 * all other degrees of freedom zero, so alpha_r(w) = (tr w, zeta_r) on the
 * boundary for every piecewise polynomial w of the lowest-order complex.
 *
 * Fields are passed as `u(x, c)` with `c` the cell of the original mesh that
 * contains `x`, and their derivative as `du(x, c)`: the gradient for 0-forms,
 * the curl for 1-forms and the divergence for 2-forms.
 */

import {ValidateError} from './errors.js';
import {
  SimplicialComplex,
  tetrahedronRule,
} from './simplicial-complex.js';
import {boundarySurface} from './boundary-surface.js';
import {SurfaceComplex} from './surface-complex.js';
import {worseyFarinSplit} from './worsey-farin.js';
import {
  vertexBoundaryWeight,
  edgeBoundaryWeight,
  faceBoundaryWeight,
} from './boundary-weights.js';

const sub = (a, b) => a.map((q, i) => q - b[i]);
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => a.map((q) => q / Math.hypot(...a));
const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const CHILDREN = [[0, 1], [1, 2], [2, 0]];

export class BoundaryProjector {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} cells Tetrahedra as four vertex indices.
   * @param {{quadratureOrder: (number|undefined)}=} options
   */
  constructor(vertices, cells, options = {}) {
    if (!Array.isArray(vertices) || !Array.isArray(cells)) {
      throw new ValidateError('BoundaryProjector needs vertices and cells');
    }
    this.order = options.quadratureOrder ?? 4;
    this.orig = new SimplicialComplex(vertices, cells);
    const surface = boundarySurface(vertices, cells);
    this.complex = new SurfaceComplex(vertices, surface.triangles);
    this.split = worseyFarinSplit(vertices, cells);
    this.fine = new SimplicialComplex(this.split.vertices, this.split.cells);
    // Hand-rolled indices over the fine mesh.
    this.edgeCells = new Map();
    this.vertexCells = new Map();
    this.fine.cells.forEach((cell, c) => {
      this.fine.cellEdges[c].forEach((e) => {
        if (!this.edgeCells.has(e)) this.edgeCells.set(e, []);
        this.edgeCells.get(e).push(c);
      });
      cell.forEach((v) => {
        if (!this.vertexCells.has(v)) this.vertexCells.set(v, []);
        this.vertexCells.get(v).push(c);
      });
    });
    this.weights = [new Map(), new Map(), new Map()];
    this.subFaces = this.indexSubFaces();
  }

  /**
   * The boundary faces of the fine mesh: each child (t, k) of boundary
   * triangle t has the fine face [g, t_i, t_j], its fine cell and its
   * orientation sign against the outward normal.
   * @private
   */
  indexSubFaces() {
    const out = new Map();
    this.complex.triangles.forEach((triangle, t) => {
      const key = [...triangle].sort((a, b) => a - b).join('_');
      const g = this.split.faceVertex.get(key);
      CHILDREN.forEach(([i, j], k) => {
        const face = this.fine.faceIndex(g, triangle[i], triangle[j]);
        const cell = this.fine.faceCells[face][0];
        const [a, b, d] = this.fine.faces[face]
            .map((v) => this.fine.vertices[v]);
        const normal = cross(sub(b, a), sub(d, a));
        const centre = [0, 1, 2].map((m) => (a[m] + b[m] + d[m]) / 3 -
          this.fine.geometry(cell).points.reduce((s, p) => s + p[m], 0) / 4);
        out.set(`${t}_${k}`, {
          face,
          cell,
          sign: dot(normal, centre) > 0 ? 1 : -1,
          area: Math.hypot(...normal) / 2,
          points: [g, triangle[i], triangle[j]],
        });
      });
    });
    return out;
  }

  weight(l, r) {
    if (!this.weights[l].has(r)) {
      const build = [vertexBoundaryWeight, edgeBoundaryWeight,
        faceBoundaryWeight][l];
      this.weights[l].set(r, build(this.complex, r));
    }
    return this.weights[l].get(r);
  }

  /** The integral of the weight over a child, from its centroid value. */
  childFlux(valueAt, t, k) {
    const {points, area} = this.subFaces.get(`${t}_${k}`).geometry ??
      this.childGeometry(t, k);
    const centre = [0, 1, 2].map((m) => (points[0][m] + points[1][m] +
      points[2][m]) / 3);
    return valueAt(centre) * area;
  }

  /** @private */
  childGeometry(t, k) {
    const entry = this.subFaces.get(`${t}_${k}`);
    const points = entry.points.map((v) => this.fine.vertices[v]);
    entry.geometry = {points, area: entry.area};
    return entry.geometry;
  }

  /**
   * alpha_r^0(w) = (w, div Y) + (grad w, Y) for a boundary vertex r, with Y
   * in RT0 of the fine mesh whose boundary fluxes are the vertex weight.
   * @param {number} r A boundary vertex.
   * @param {function(number[], number): number} u The function.
   * @param {function(number[], number): number[]} gradient Its gradient.
   * @return {number}
   */
  alpha0(r, u, gradient) {
    const weight = this.weight(0, r);
    let sum = 0;
    for (const t of weight.triangles) {
      for (let k = 0; k < 3; k++) {
        const entry = this.subFaces.get(`${t}_${k}`);
        const flux = entry.sign * weight.valueOf(t, k) * entry.area;
        if (flux === 0) continue;
        const c = entry.cell;
        const {volume, points} = this.fine.geometry(c);
        const index = this.fine.cellFaces[c].indexOf(entry.face);
        const divergence = this.fine.cellFaceSigns[c][index] * flux / volume;
        const parent = this.split.parent[c];
        for (const {x, weight: q} of tetrahedronRule(points, this.order)) {
          const y = this.fine.whitney(c, 2, x)[index].map((s) => s * flux);
          sum += q * (u(x, parent) * divergence + dot(gradient(x, parent), y));
        }
      }
    }
    return sum;
  }

  /** Outward unit normal of boundary triangle t. */
  normal(t) {
    const [a, b, c] = this.complex.triangles[t].map(
        (v) => this.complex.vertices[v]);
    return unit(cross(sub(b, a), sub(c, a)));
  }

  /**
   * alpha_r^1(w) = (w, curl Y) - (curl w, Y) for a boundary edge r, with Y in
   * N0 of the fine mesh whose boundary circulations are those of the rotated
   * edge weight.
   * @param {number} r A boundary edge (index in the surface complex).
   * @param {function(number[], number): number[]} u The field.
   * @param {function(number[], number): number[]} curl Its curl.
   * @return {number}
   */
  alpha1(r, u, curl) {
    const weight = this.weight(1, r);
    const dof = new Map();
    for (const t of weight.triangles) {
      const normal = this.normal(t);
      for (let k = 0; k < 3; k++) {
        const {points} = this.subFaces.get(`${t}_${k}`);
        for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
          const [lo, hi] = [points[i], points[j]].sort((a, b) => a - b);
          const edge = this.fine.edgeIndex(lo, hi);
          if (dof.has(edge)) continue;
          const p = this.fine.vertices[lo];
          const q = this.fine.vertices[hi];
          const mid = [0, 1, 2].map((m) => (p[m] + q[m]) / 2);
          const field = cross(weight.valueAt(t, k, mid), normal);
          dof.set(edge, dot(field, sub(q, p)));
        }
      }
    }
    const cellsTouched = new Set();
    for (const edge of dof.keys()) {
      this.edgeCells.get(edge).forEach((c) => cellsTouched.add(c));
    }
    let sum = 0;
    for (const c of cellsTouched) {
      const {points, gradients} = this.fine.geometry(c);
      const edges = this.fine.cellEdges[c];
      const curlY = [0, 0, 0];
      edges.forEach((e, m) => {
        const value = dof.get(e) ?? 0;
        if (value === 0) return;
        const [i, j] = EDGE_PAIRS[m];
        cross(gradients[i], gradients[j]).forEach(
            (q, d) => (curlY[d] += 2 * value * q));
      });
      const parent = this.split.parent[c];
      for (const {x, weight: q} of tetrahedronRule(points, this.order)) {
        const basis = this.fine.whitney(c, 1, x);
        const y = [0, 0, 0];
        edges.forEach((e, m) => {
          const value = dof.get(e) ?? 0;
          basis[m].forEach((s, d) => (y[d] += value * s));
        });
        sum += q * (dot(u(x, parent), curlY) - dot(curl(x, parent), y));
      }
    }
    return sum;
  }

  /**
   * alpha_r^2(w) = (w, grad Y) + (div w, Y) for a boundary face r, with Y
   * continuous piecewise linear on the fine mesh, equal to the face weight
   * at the boundary vertices and zero at the interior ones.
   * @param {number} r A boundary face (index in the surface complex).
   * @param {function(number[], number): number[]} u The field.
   * @param {function(number[], number): number} divergence Its divergence.
   * @return {number}
   */
  alpha2(r, u, divergence) {
    const weight = this.weight(2, r);
    const nodal = new Map();
    for (const t of weight.triangles) {
      for (let k = 0; k < 3; k++) {
        const {points} = this.subFaces.get(`${t}_${k}`);
        for (const v of points) {
          if (!nodal.has(v)) {
            nodal.set(v, weight.valueAt(t, k, this.fine.vertices[v]));
          }
        }
      }
    }
    const cellsTouched = new Set();
    for (const v of nodal.keys()) {
      this.vertexCells.get(v).forEach((c) => cellsTouched.add(c));
    }
    let sum = 0;
    for (const c of cellsTouched) {
      const {points, gradients} = this.fine.geometry(c);
      const corners = this.fine.cells[c];
      const gradientY = [0, 0, 0];
      corners.forEach((v, i) => {
        const value = nodal.get(v) ?? 0;
        gradients[i].forEach((q, d) => (gradientY[d] += value * q));
      });
      const parent = this.split.parent[c];
      for (const {x, weight: q} of tetrahedronRule(points, this.order)) {
        const lambda = this.fine.barycentric(c, x);
        const y = corners.reduce(
            (acc, v, i) => acc + (nodal.get(v) ?? 0) * lambda[i], 0);
        sum += q * (dot(u(x, parent), gradientY) +
          divergence(x, parent) * y);
      }
    }
    return this.faceOrientation(r) * sum;
  }

  /**
   * +1 if the canonical normal of the mesh face (increasing vertex numbers)
   * points out of the domain, else -1.
   */
  faceOrientation(r) {
    const sorted = [...this.complex.triangles[r]].sort((a, b) => a - b)
        .map((v) => this.complex.vertices[v]);
    const canonical = cross(
        sub(sorted[1], sorted[0]), sub(sorted[2], sorted[0]));
    return dot(canonical, this.normal(r)) > 0 ? 1 : -1;
  }
}
