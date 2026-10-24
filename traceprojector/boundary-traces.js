/**
 * Traces on the boundary of the finite element spaces of Arnold and Guzman:
 * the boundary faces of a mesh with their Alfeld sub-triangles and the bump
 * mu of Ern, Guzman, Potu and Vohralik, the traces of basis functions as
 * polynomial fields on each face, the surface differential operators on such
 * fields, and the integrals over the sub-triangles. This is the toolkit the
 * higher-order boundary weights are built from.
 *
 * A trace of degree l is a scalar field for l = 0 (the value), a tangential
 * vector field for l = 1 and a scalar for l = 2 (the component along the
 * outward normal). Polynomial fields are stored as polynomials on R^3, which
 * restricted to the plane of a face are the field on that face.
 */

import {Polynomial} from './polynomial-forms.js';
import {affine, physicalForm} from './physical-forms.js';
import {referenceRule} from './reference-element.js';

const sub = (a, b) => a.map((q, i) => q - b[i]);
const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const FACE_TRIPLES = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]];
/** Sub-triangle k of a face [a, b, c] with barycentre g is [g, v_i, v_j]. */
export const CHILDREN = [[0, 1], [1, 2], [2, 0]];

/** n . F for a polynomial triple F and a numeric vector n. */
const normalComponent = (form, n) => form.reduce(
    (acc, p, i) => acc.add(p.scale(n[i])), Polynomial.zero());

/** The tangential part F - n (n . F) of a polynomial triple. */
const tangentialPart = (form, n) => {
  const along = normalComponent(form, n);
  return form.map((p, i) => p.add(along.scale(-n[i])));
};

/** The trace of a degree-l polynomial form on a face with unit normal n. */
export function faceTrace(l, form, n) {
  if (l === 0) return form;
  if (l === 1) return tangentialPart(form, n);
  return normalComponent(form, n);
}

/** The tangential gradient of a scalar polynomial. */
export function sgrad(s, n) {
  return tangentialPart([0, 1, 2].map((i) => s.derivative(i)), n);
}

/** The surface divergence of a tangential polynomial field. */
export function sdiv(field, n) {
  let out = Polynomial.zero();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const weight = (i === j ? 1 : 0) - n[i] * n[j];
      if (weight !== 0) out = out.add(field[i].derivative(j).scale(weight));
    }
  }
  return out;
}

/** The surface curl n . curl F of a tangential polynomial field. */
export function scurl(field, n) {
  const curl = [
    field[2].derivative(1).add(field[1].derivative(2).scale(-1)),
    field[0].derivative(2).add(field[2].derivative(0).scale(-1)),
    field[1].derivative(0).add(field[0].derivative(1).scale(-1)),
  ];
  return normalComponent(curl, n);
}

/** The surface rotation of a scalar: sgrad s x n. */
export function srot(s, n) {
  const g = sgrad(s, n);
  return [
    g[1].scale(n[2]).add(g[2].scale(-n[1])),
    g[2].scale(n[0]).add(g[0].scale(-n[2])),
    g[0].scale(n[1]).add(g[1].scale(-n[0])),
  ];
}

/** Value of a polynomial scalar or triple at a point. */
export const valueOf = (form, x) => (Array.isArray(form) ?
  form.map((p) => p.evaluate(x)) : form.evaluate(x));

export class BoundaryTraces {
  /**
   * @param {!Object} space An AgSpace on the whole mesh.
   * @param {number=} order Gauss points per direction on a sub-triangle.
   */
  constructor(space, order = 2 * space.r + 4) {
    this.space = space;
    this.complex = space.complex;
    this.order = order;
    this.rule = referenceRule(2, order);
    this.formCache = new Map();
    this.whitneyCache = new Map();
    this.localIndex = new Map();
    this.faces = new Map();
    this.complex.faces.forEach((vertices, f) => {
      if (this.complex.faceCells[f].length !== 1) return;
      this.faces.set(f, this.describe(f, vertices));
    });
  }

  /** @private The geometry of a boundary face and its sub-triangles. */
  describe(f, vertices) {
    const c = this.complex.faceCells[f][0];
    const points = vertices.map((v) => this.complex.vertices[v]);
    const raw = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    const centroid = this.complex.geometry(c).points.reduce(
        (s, p) => s.map((q, i) => q + p[i] / 4), [0, 0, 0]);
    const outward = dot(raw, sub(points[0], centroid)) > 0 ? 1 : -1;
    const length = Math.hypot(...raw);
    const normal = raw.map((q) => outward * q / length);
    const centre = [0, 1, 2].map(
        (m) => (points[0][m] + points[1][m] + points[2][m]) / 3);
    const pieces = CHILDREN.map(([i, j], k) => {
      const corners = [centre, points[i], points[j]];
      const edge1 = sub(corners[1], corners[0]);
      const edge2 = sub(corners[2], corners[0]);
      const area = Math.hypot(...cross(edge1, edge2)) / 2;
      // Barycentric coordinate of the centre: 1 at g, 0 on the opposite edge.
      const opposite = sub(corners[2], corners[1]);
      const inPlane = cross(normal, opposite);
      const gradient = inPlane.map(
          (q) => q / dot(inPlane, sub(corners[0], corners[1])));
      return {
        k,
        corners,
        area,
        mu: affine(-dot(gradient, corners[1]), gradient),
      };
    });
    return {
      f,
      cell: c,
      vertices,
      points,
      normal,
      centre,
      area: Math.hypot(...raw) / 2,
      pieces,
    };
  }

  /** Physical polynomial forms of the AG basis of a cell. */
  basisForms(c, l) {
    const id = `${c}:${l}`;
    if (!this.formCache.has(id)) {
      const frame = this.space.frame(c);
      this.formCache.set(id, this.space.element(l).basis.map(
          (psi) => physicalForm(psi, l, frame)));
    }
    return this.formCache.get(id);
  }

  /** Polynomial Whitney forms of a cell, in the order of cellEntities. */
  whitneyForms(c, l) {
    const id = `${c}:${l}`;
    if (this.whitneyCache.has(id)) return this.whitneyCache.get(id);
    const {gradients, points} = this.complex.geometry(c);
    const lambda = gradients.map((g, i) => affine(
        (i === 0 ? 1 : 0) - dot(g, points[0]), g));
    let out;
    if (l === 0) {
      out = lambda;
    } else if (l === 1) {
      out = EDGE_PAIRS.map(([i, j]) => [0, 1, 2].map((d) => lambda[i]
          .scale(gradients[j][d]).add(lambda[j].scale(-gradients[i][d]))));
    } else {
      out = FACE_TRIPLES.map(([i, j, k]) => {
        const a = cross(gradients[j], gradients[k]);
        const b = cross(gradients[k], gradients[i]);
        const e = cross(gradients[i], gradients[j]);
        return [0, 1, 2].map((d) => lambda[i].scale(2 * a[d])
            .add(lambda[j].scale(2 * b[d])).add(lambda[k].scale(2 * e[d])));
      });
    }
    this.whitneyCache.set(id, out);
    return out;
  }

  /**
   * The trace on a boundary face of the AG basis function of global dof `dof`
   * of degree l, or null if it vanishes there.
   */
  basisTrace(l, dof, face) {
    const c = face.cell;
    const key = `${c}:${l}`;
    if (!this.localIndex.has(key)) {
      this.localIndex.set(key, new Map(
          this.space.cellDofs(c, l).map((d, i) => [d, i])));
    }
    const i = this.localIndex.get(key).get(dof);
    if (i === undefined) return null;
    return faceTrace(l, this.basisForms(c, l)[i], face.normal);
  }

  /** The trace on a boundary face of the Whitney form of entity `entity`. */
  whitneyTrace(l, entity, face) {
    const c = face.cell;
    const i = this.complex.cellEntities(c, l).indexOf(entity);
    if (i < 0) return null;
    return faceTrace(l, this.whitneyForms(c, l)[i], face.normal);
  }

  /** Quadrature points and weights on sub-triangle k of a face. */
  pieceRule(face, k) {
    const {corners, area} = face.pieces[k];
    const [p0, p1, p2] = corners;
    return this.rule.map(({s, weight}) => ({
      x: [0, 1, 2].map((m) => p0[m] + s[0] * (p1[m] - p0[m]) +
        s[1] * (p2[m] - p0[m])),
      weight: 2 * area * weight,
    }));
  }

  /**
   * The integral over the given faces of a . b, weighted by mu when asked;
   * `a(face)` and `b(face)` give the polynomial field on a face or null.
   * Fields given per sub-triangle are functions `(k) => field`.
   */
  integrate(faces, a, b, weighted = true) {
    let sum = 0;
    for (const face of faces) {
      const fa = a(face);
      const fb = b(face);
      if (!fa || !fb) continue;
      face.pieces.forEach((piece, k) => {
        const ga = typeof fa === 'function' ? fa(k) : fa;
        const gb = typeof fb === 'function' ? fb(k) : fb;
        if (!ga || !gb) return;
        for (const {x, weight} of this.pieceRule(face, k)) {
          const va = valueOf(ga, x);
          const vb = valueOf(gb, x);
          const product = Array.isArray(va) ? dot(va, vb) : va * vb;
          sum += weight * product * (weighted ? piece.mu.evaluate(x) : 1);
        }
      });
    }
    return sum;
  }
}
