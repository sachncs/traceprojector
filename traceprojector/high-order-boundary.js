/**
 * The higher-order boundary weights of Ern, Guzman and Potu (Section 7): for
 * every bubble degree of freedom (sigma, g) of a boundary edge or face
 * sigma, a weight zeta supported on the boundary faces containing sigma such
 * that
 *
 *   (zeta, tr w)_Gamma = ell(w)   for every w in the finite element space,
 *
 * where ell(w) is the coefficient of the basis function of (sigma, g) in the
 * expansion of w in the Whitney forms and the bubble basis functions. The
 * weights of closed bubbles are Riesz representers weighted by the bump mu;
 * those of the complementary bubbles are the surface rotation or divergence of
 * the weights of their differentials, which makes the traces commute with d.
 * Each weight is extended into the bulk by a form Y on the Worsey-Farin split
 * with the weight as its trace and no bulk degrees of freedom, so that
 *
 *   alpha(w) = (w, d* Y) -+ (d w, Y)
 *
 * is defined for every field w and equals (tr w, zeta) for the finite
 * element functions.
 */

import {AgSpace} from './ag-space.js';
import {BoundaryProjector} from './boundary-projector.js';
import {ValidateError} from './errors.js';
import {Polynomial, differential} from './polynomial-forms.js';
import {
  BoundaryTraces,
  faceTrace,
  scurl,
  sdiv,
  sgrad,
  srot,
  valueOf,
} from './boundary-traces.js';
import {solveSemidefinite} from './dense-linear-algebra.js';
import {tetrahedronRule} from './simplicial-complex.js';
import {worseyFarinSplit} from './worsey-farin.js';

const dot = (a, b) => a.reduce((s, q, i) => s + q * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const TOLERANCE = 1e-9;

/** field * affine, for a polynomial scalar or triple. */
const times = (field, scalar) => (Array.isArray(field) ?
  field.map((p) => p.multiply(scalar)) : field.multiply(scalar));
const plus = (a, b) => (Array.isArray(a) ? a.map((p, i) => p.add(b[i])) :
  a.add(b));
const scaled = (a, s) => (Array.isArray(a) ? a.map((p) => p.scale(s)) :
  a.scale(s));
const zeroLike = (l) => (l === 1 ? [0, 1, 2].map(() => Polynomial.zero()) :
  Polynomial.zero());
/** F x n for numeric n and a polynomial triple F. */
const crossWith = (n, F) => [
  F[2].scale(-n[1]).add(F[1].scale(n[2])),
  F[0].scale(-n[2]).add(F[2].scale(n[0])),
  F[1].scale(-n[0]).add(F[0].scale(n[1])),
];

export class HighOrderBoundary {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} cells Tetrahedra as four vertex indices.
   * @param {{degree: (number|undefined), extensionDegree: (number|undefined)}=}
   *     options `degree` is p >= 1; the extensions Y are forms of
   *     polynomial degree `extensionDegree` (default p + 3, enough to carry the
   *     trace of a weight, which has degree p + 2).
   */
  constructor(vertices, cells, options = {}) {
    const p = options.degree ?? 1;
    if (!Number.isInteger(p) || p < 1) {
      throw new ValidateError(
          'the higher-order boundary operator needs degree >= 1');
    }
    this.degree = p;
    this.vertices = vertices;
    this.cells = cells;
    this.extensionDegree = options.extensionDegree ?? p + 3;
    this.space = new AgSpace(vertices, cells, {degree: p});
    this.complex = this.space.complex;
    this.traces = new BoundaryTraces(this.space);
    this.lowest = new BoundaryProjector(vertices, cells, {
      quadratureOrder: options.quadratureOrder,
    });
    this.lowestLists = new Map();
    this.corrections = new Map();
    this.catalogs = new Map();
    this.weights = new Map();
    this.extensions = new Map();
    this.spaces = new Map();
  }

  /**
   * The bubble degrees of freedom of degree l on boundary edges and faces.
   * @param {number} l
   * @return {!Array<{dof: number, dimension: number, entity: number, kind:
   *     string, partner: (number|undefined), faces: !Array<!Object>}>}
   */
  catalog(l) {
    if (this.catalogs.has(l)) return this.catalogs.get(l);
    const space = this.space;
    const {perEntity, offsets} = space.layout(l);
    const element = space.element(l);
    const info = space.dofInfo(l);
    const next = l < 2 ? space.element(l + 1) : null;
    const nextLayout = l < 2 ? space.layout(l + 1) : null;
    const facesOf = this.facesOfSimplices();
    const out = [];
    const byKey = new Map();
    info.forEach(({dimension: m, entity, kind}, dof) => {
      if (m === 0 || (kind !== 'closed' && kind !== 'coclosed')) return;
      const faces = facesOf.get(`${m}:${entity}`);
      if (!faces) return;
      const t = (dof - offsets[m]) % perEntity[m];
      const carrier = element.carriers.findIndex((c) => c.dimension === m);
      const item = element.entries[element.offsets[carrier] + t].index;
      const entry = {dof, dimension: m, entity, kind, t, item, faces};
      out.push(entry);
      byKey.set(`${m}:${entity}:${item}`, entry);
    });
    if (l < 2) {
      // The j-th complement of degree l pairs with the j-th closed bubble of
      // degree l + 1 on the same simplex.
      const items = (kind, layout, el, m) => {
        const carrier = el.carriers.findIndex((c) => c.dimension === m);
        const list = [];
        for (let t = 0; t < layout.perEntity[m]; t++) {
          const entry = el.entries[el.offsets[carrier] + t];
          if (entry.kind === kind) list.push(t);
        }
        return list;
      };
      for (const entry of out) {
        if (entry.kind !== 'coclosed') continue;
        const m = entry.dimension;
        const mine = items('coclosed', space.layout(l), element, m);
        const closed = items('closed', nextLayout, next, m);
        const j = mine.indexOf(entry.t);
        entry.partner = nextLayout.offsets[m] + nextLayout.perEntity[m] *
          entry.entity + closed[j];
      }
    }
    this.catalogs.set(l, {list: out, byKey});
    return this.catalogs.get(l);
  }

  /** Boundary faces containing each boundary edge and boundary face. */
  facesOfSimplices() {
    if (this.faceMap) return this.faceMap;
    const map = new Map();
    for (const face of this.traces.faces.values()) {
      const edges = this.complex.faceEdges[face.f];
      for (const [key, list] of [
        [`2:${face.f}`, [face]],
        ...edges.map((e) => [`1:${e}`, [face]]),
      ]) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(...list);
      }
    }
    this.faceMap = map;
    return map;
  }

  /** Lowest-order entities (vertices, edges or faces) of a boundary face. */
  lowestEntities(l, face) {
    if (l === 0) return [...face.vertices];
    if (l === 1) return [...this.complex.faceEdges[face.f]];
    return [face.f];
  }

  /**
   * The weight of a bubble degree of freedom: for every boundary face of its
   * star, the polynomial field on each of the three sub-triangles.
   * @param {number} l
   * @param {number} dof Global dof of degree l.
   * @return {{l: number, entry: !Object, faces: !Array<!Object>, pieces:
   *     !Map<number, !Array>}}
   */
  weight(l, dof) {
    const id = `${l}:${dof}`;
    if (this.weights.has(id)) return this.weights.get(id);
    const entry = this.catalog(l).list.find((e) => e.dof === dof);
    if (!entry) throw new ValidateError(`dof ${dof} is not a boundary bubble`);
    let result;
    if (entry.kind === 'closed') {
      result = this.riesz(l, entry);
    } else if (l === 0) {
      const closed = this.weight(1, entry.partner);
      const pieces = new Map();
      for (const face of closed.faces) {
        pieces.set(face.f, closed.pieces.get(face.f).map((field) => scaled(
            sdiv(field, face.normal), -1)));
      }
      result = {l, entry, faces: closed.faces, pieces};
    } else {
      const closed = this.weight(2, entry.partner);
      const pieces = new Map();
      for (const face of closed.faces) {
        pieces.set(face.f, closed.pieces.get(face.f).map(
            (field) => srot(field, face.normal)));
      }
      result = {l, entry, faces: closed.faces, pieces};
    }
    this.weights.set(id, result);
    return result;
  }

  /** @private The weighted Riesz representer of a closed bubble. */
  riesz(l, entry) {
    const faces = entry.faces;
    const catalog = this.catalog(l);
    // The basis of the trace space on the star: Whitney forms and bubbles.
    const basis = [];
    const seen = new Set();
    for (const face of faces) {
      for (const a of this.lowestEntities(l, face)) {
        if (!seen.has(`W${a}`)) {
          seen.add(`W${a}`);
          basis.push({type: 'W', entity: a});
        }
      }
      const simplices = [[2, face.f],
        ...this.complex.faceEdges[face.f].map((e) => [1, e])];
      for (const [m, e] of simplices) {
        for (const b of catalog.list) {
          if (b.dimension === m && b.entity === e && !seen.has(`B${b.dof}`)) {
            seen.add(`B${b.dof}`);
            basis.push({type: 'B', dof: b.dof});
          }
        }
      }
    }
    const trace = (item, face) => (item.type === 'W' ?
      this.traces.whitneyTrace(l, item.entity, face) :
      this.traces.basisTrace(l, item.dof, face));
    const n = basis.length;
    const gram = new Float64Array(n * n);
    const cache = basis.map((item) => new Map(
        faces.map((face) => [face.f, trace(item, face)])));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const value = this.traces.integrate(
            faces, (face) => cache[i].get(face.f),
            (face) => cache[j].get(face.f));
        gram[i * n + j] = value;
        gram[j * n + i] = value;
      }
    }
    const rhs = Float64Array.from(basis, (item) => (
      item.type === 'B' && item.dof === entry.dof ? 1 : 0));
    const {x, residual} = solveSemidefinite(gram, n, rhs);
    if (!(residual <= 1e-8 * Math.max(1, Math.hypot(...rhs)))) {
      throw new ValidateError(
          `the weight of dof ${entry.dof} of degree ${l} is inconsistent`);
    }
    const pieces = new Map();
    for (const face of faces) {
      let beta = zeroLike(l);
      basis.forEach((item, i) => {
        const t = cache[i].get(face.f);
        if (t && x[i] !== 0) beta = plus(beta, scaled(t, x[i]));
      });
      pieces.set(face.f, face.pieces.map((piece) => times(beta, piece.mu)));
    }
    return {l, entry, faces, pieces};
  }

  /** The integral over the star of a weight against a polynomial trace. */
  pair(weight, traceOf) {
    return this.traces.integrate(
        weight.faces, (face) => (k) => weight.pieces.get(face.f)[k],
        (face) => traceOf(face), false);
  }

  /**
   * The boundary values of the extension Y of a weight, as a field on R^3
   * that is zero off the star, and its derivative on the boundary:
   * Y = zeta n for l = 0 (normal trace zeta), Y = zeta x n for l = 1
   * (tangential trace) and Y = zeta for l = 2.
   */
  boundaryField(weight) {
    const {l} = weight;
    const lookup = this.pieceLocator(weight);
    const at = (x) => {
      const hit = lookup(x);
      return hit && {
        n: hit.face.normal,
        field: weight.pieces.get(hit.face.f)[hit.k],
      };
    };
    const u = (x) => {
      const h = at(x);
      if (!h) return l === 2 ? 0 : [0, 0, 0];
      const v = valueOf(h.field, x);
      if (l === 0) return h.n.map((q) => q * v);
      if (l === 1) return cross(v, h.n);
      return v;
    };
    const du = (x) => {
      // The divergence of the extension of a 0-form weight (a scalar) is
      // only asked for the interior dofs, which are zero.
      if (l === 0) return 0;
      const h = at(x);
      if (!h) return [0, 0, 0];
      if (l === 1) {
        const rotated = crossWith(h.n, h.field);
        const curl = scurl(rotated, h.n).evaluate(x);
        return h.n.map((q) => q * curl);
      }
      if (l === 2) return sgrad(h.field, h.n).map((p) => p.evaluate(x));
      return [0, 0, 0];
    };
    return {u, du};
  }

  /** x -> {face, k} of the sub-triangle of a weight's star containing x. */
  pieceLocator(weight) {
    return (x) => {
      for (const face of weight.faces) {
        const off = Math.abs(dot(face.normal, x.map(
            (q, i) => q - face.centre[i])));
        if (off > TOLERANCE * (1 + face.area)) continue;
        for (const piece of face.pieces) {
          const [p0, p1, p2] = piece.corners;
          const e1 = p1.map((q, i) => q - p0[i]);
          const e2 = p2.map((q, i) => q - p0[i]);
          const d = x.map((q, i) => q - p0[i]);
          const a = dot(e1, e1);
          const b = dot(e1, e2);
          const c = dot(e2, e2);
          const det = a * c - b * b;
          const s1 = (c * dot(d, e1) - b * dot(d, e2)) / det;
          const s2 = (a * dot(d, e2) - b * dot(d, e1)) / det;
          if (s1 >= -TOLERANCE && s2 >= -TOLERANCE &&
              s1 + s2 <= 1 + TOLERANCE) {
            return {face, k: piece.k};
          }
        }
      }
      return null;
    };
  }

  /**
   * The extension Y of a weight on the Worsey-Farin split of the cells that
   * hold its star: boundary degrees of freedom from the weight, all others 0.
   */
  extension(weight) {
    const key = `${weight.l}:${weight.entry.dof}`;
    if (this.extensions.has(key)) return this.extensions.get(key);
    const l = weight.l;
    const cellList = [...new Set(weight.faces.map((f) => f.cell))];
    const ids = new Map();
    const coordinates = [];
    const local = (v) => {
      if (!ids.has(v)) {
        ids.set(v, coordinates.length);
        coordinates.push(this.vertices[v]);
      }
      return ids.get(v);
    };
    const tets = cellList.map((c) => this.cells[c].map(local));
    const split = worseyFarinSplit(coordinates, tets);
    const lY = 2 - l;
    const space = new AgSpace(split.vertices, split.cells,
        {degree: this.extensionDegree - 1});
    const {u, du} = this.boundaryField(weight);
    // Only boundary simplices inside the faces of the star carry dofs; the
    // field vanishes elsewhere, so the other dofs are zero by construction.
    const coefficients = space.coefficients(
        (x) => u(x), lY, (x) => du(x));
    const result = {space, split, coefficients, cellList, lY};
    this.extensions.set(key, result);
    return result;
  }

  /**
   * alpha(u) for a bubble dof: the pairing of the field with the extension of
   * its weight.
   * @param {number} l
   * @param {number} dof
   * @param {function(number[], number): (number|number[])} u The field at a
   *     point of an original cell (second argument: the cell).
   * @param {function(number[], number): (number|number[])} du Its derivative.
   * @return {number}
   */
  alpha(l, dof, u, du) {
    const weight = this.weight(l, dof);
    const {space, split, coefficients, cellList, lY} = this.extension(weight);
    const order = this.extensionDegree + 3;
    let sum = 0;
    split.cells.forEach((tet, s) => {
      const parent = cellList[split.parent[s]];
      const points = tet.map((v) => split.vertices[v]);
      for (const {x, weight: q} of tetrahedronRule(points, order)) {
        const y = space.evaluate(coefficients, x, s, lY);
        const dy = space.derivative(coefficients, x, s, lY);
        const w = u(x, parent);
        const dw = du(x, parent);
        if (l === 0) sum += q * (w * dy + dot(dw, y));
        else if (l === 1) sum += q * (dot(w, dy) - dot(dw, y));
        else sum += q * (dot(w, dy) + dw * y);
      }
    });
    return sum;
  }

  /**
   * The lowest-order boundary entities of degree l: for each, the entity of
   * the mesh, the faces its weight is supported on, and the map alpha_0.
   * @param {number} l
   * @return {!Array<{entity: number, faces: !Set<number>, alpha:
   *     function(!Function, !Function): number}>}
   */
  lowestEntities0(l) {
    if (this.lowestLists.has(l)) return this.lowestLists.get(l);
    const {complex} = this.lowest;
    const orig = this.complex;
    const facesOf = (r) => new Set(this.lowest.weight(l, r).triangles.map(
        (t) => orig.faceIndex(...complex.triangles[t])));
    let out;
    if (l === 0) {
      out = [...new Set(complex.triangles.flat())].map((r) => ({
        entity: r,
        faces: facesOf(r),
        alpha: (u, du) => this.lowest.alpha0(r, u, du),
      }));
    } else if (l === 1) {
      out = complex.edges.map((pair, r) => ({
        entity: orig.edgeIndex(...pair),
        faces: facesOf(r),
        alpha: (u, du) => this.lowest.alpha1(r, u, du),
      }));
    } else {
      out = complex.triangles.map((triangle, r) => ({
        entity: orig.faceIndex(...triangle),
        faces: facesOf(r),
        alpha: (u, du) => this.lowest.alpha2(r, u, du),
      }));
    }
    this.lowestLists.set(l, out);
    return out;
  }

  /** The AG basis function of a dof as a field u(x, cell), and its d. */
  basisField(l, dof) {
    const empty = l === 0 ? 0 : [0, 0, 0];
    const emptyD = l === 0 ? [0, 0, 0] : l === 1 ? [0, 0, 0] : 0;
    const local = (c) => this.space.cellDofs(c, l).indexOf(dof);
    return {
      u: (x, c) => {
        const i = local(c);
        return i < 0 ? empty : valueOf(this.traces.basisForms(c, l)[i], x);
      },
      du: (x, c) => {
        const i = local(c);
        return i < 0 ? emptyD : valueOf(
            differential(this.traces.basisForms(c, l)[i], l), x);
      },
    };
  }

  /**
   * The pairing of the lowest-order weights with a bubble basis function:
   * M_ab = alpha_a(B_b) for every lowest-order entity a whose weight meets
   * the star of the bubble. These are the entries of the correction that
   * makes the weights of the whole basis dual to {Whitney, bubbles}.
   * @param {number} l
   * @param {number} dof
   * @return {!Array<{entity: number, value: number}>}
   */
  correction(l, dof) {
    const id = `${l}:${dof}`;
    if (this.corrections.has(id)) return this.corrections.get(id);
    const entry = this.catalog(l).list.find((e) => e.dof === dof);
    const star = new Set(entry.faces.map((face) => face.f));
    const {u, du} = this.basisField(l, dof);
    const out = [];
    for (const a of this.lowestEntities0(l)) {
      let meets = false;
      for (const face of star) {
        if (a.faces.has(face)) {
          meets = true;
          break;
        }
      }
      if (!meets) continue;
      const value = a.alpha(u, du);
      if (Math.abs(value) > 1e-13) out.push({entity: a.entity, value});
    }
    this.corrections.set(id, out);
    return out;
  }

  /**
   * The coefficients of the boundary operator Pi_boundary u in degree l:
   *
   *   Pi_boundary u = sum_a [alpha_a(u) - sum_b M_ab alpha_b(u)] W_a
   *                 + sum_b alpha_b(u) B_b
   *
   * with W_a the Whitney forms of the boundary entities and B_b the bubble
   * basis functions of the boundary edges and faces. For u in the finite
   * element space it returns the part of u carried by the boundary degrees of
   * freedom, so the trace is preserved.
   * @param {function(number[], number): (number|number[])} u Field at a point
   *     of a cell (second argument: the cell).
   * @param {function(number[], number): (number|number[])} du Its derivative.
   * @param {number} l 0, 1 or 2.
   * @return {{whitney: !Map<number, number>, bubbles: !Map<number, number>}}
   */
  coefficients(u, du, l) {
    const whitney = new Map();
    for (const a of this.lowestEntities0(l)) {
      whitney.set(a.entity, a.alpha(u, du));
    }
    const bubbles = new Map();
    for (const b of this.catalog(l).list) {
      const value = this.alpha(l, b.dof, u, du);
      bubbles.set(b.dof, value);
      for (const {entity, value: m} of this.correction(l, b.dof)) {
        whitney.set(entity, whitney.get(entity) - m * value);
      }
    }
    return {whitney, bubbles};
  }

  /** The bubbles of degree l on the faces of the set, by face. @private */
  bubblesByFace(l) {
    if (!this.byFace) this.byFace = new Map();
    if (!this.byFace.has(l)) {
      const map = new Map();
      for (const entry of this.catalog(l).list) {
        for (const face of entry.faces) {
          if (!map.has(face.f)) map.set(face.f, []);
          map.get(face.f).push(entry);
        }
      }
      this.byFace.set(l, map);
    }
    return this.byFace.get(l);
  }

  /**
   * Pi_boundary u as a lazy field: the coefficients of the Whitney forms and
   * bubbles of a cell are computed when a point of the cell is first asked
   * for, and a cell without boundary degrees of freedom costs nothing.
   * @param {function(number[], number): (number|number[])} u
   * @param {function(number[], number): (number|number[])} du
   * @param {number} l 0, 1 or 2.
   * @return {{value: !Function, derivative: !Function}}
   */
  lazyField(u, du, l) {
    const lowest = new Map(this.lowestEntities0(l).map((a) => [a.entity, a]));
    const bubbleOf = new Map(this.catalog(l).list.map((e) => [e.dof, e]));
    const byFace = this.bubblesByFace(l);
    const tilde = new Map();
    const tildeOf = (dof) => {
      if (!tilde.has(dof)) tilde.set(dof, this.alpha(l, dof, u, du));
      return tilde.get(dof);
    };
    const whitney = new Map();
    const whitneyOf = (entity) => {
      if (!whitney.has(entity)) {
        const a = lowest.get(entity);
        let value = 0;
        if (a) {
          value = a.alpha(u, du);
          const near = new Set();
          for (const face of a.faces) {
            for (const b of byFace.get(face) ?? []) near.add(b);
          }
          for (const b of near) {
            const m = this.correction(l, b.dof).find(
                (e) => e.entity === entity);
            if (m) value -= m.value * tildeOf(b.dof);
          }
        }
        whitney.set(entity, value);
      }
      return whitney.get(entity);
    };
    const prepared = new Map();
    const forCell = (c) => {
      if (!prepared.has(c)) {
        const vector = new Float64Array(this.space.size(l));
        let any = false;
        for (const dof of this.space.cellDofs(c, l)) {
          if (bubbleOf.has(dof)) {
            vector[dof] = tildeOf(dof);
            any = true;
          }
        }
        const entities = [];
        this.complex.cellEntities(c, l).forEach((entity, i) => {
          if (lowest.has(entity)) {
            entities.push({i, w: whitneyOf(entity)});
            any = true;
          }
        });
        prepared.set(c, any ? {vector, entities} : null);
      }
      return prepared.get(c);
    };
    const zero = () => (l === 0 ? 0 : [0, 0, 0]);
    const zeroD = () => (l === 0 ? [0, 0, 0] : l === 1 ? [0, 0, 0] : 0);
    const sum = (a, b) => (typeof a === 'number' ? a + b :
      a.map((q, i) => q + b[i]));
    return {
      value: (x, c) => {
        const cell = forCell(c);
        if (!cell) return zero();
        let total = this.space.evaluate(cell.vector, x, c, l);
        const basis = this.complex.whitney(c, l, x);
        for (const {i, w} of cell.entities) {
          total = sum(total, typeof basis[i] === 'number' ? w * basis[i] :
            basis[i].map((q) => w * q));
        }
        return total;
      },
      derivative: (x, c) => {
        const cell = forCell(c);
        if (!cell) return zeroD();
        let total = this.space.derivative(cell.vector, x, c, l);
        const forms = this.traces.whitneyForms(c, l);
        for (const {i, w} of cell.entities) {
          const d = valueOf(differential(forms[i], l), x);
          total = sum(total, typeof d === 'number' ? w * d :
            d.map((q) => w * q));
        }
        return total;
      },
    };
  }

  /**
   * Pi_boundary u as a field: its value and derivative at a point of a cell.
   */
  field(coefficients, l) {
    const vector = new Float64Array(this.space.size(l));
    for (const [dof, value] of coefficients.bubbles) vector[dof] = value;
    const {whitney} = coefficients;
    const entities = (c) => this.complex.cellEntities(c, l);
    const sum = (a, b) => (typeof a === 'number' ? a + b :
      a.map((q, i) => q + b[i]));
    return {
      value: (x, c) => {
        let total = this.space.evaluate(vector, x, c, l);
        const basis = this.complex.whitney(c, l, x);
        entities(c).forEach((entity, i) => {
          const w = whitney.get(entity);
          if (!w) return;
          total = sum(total, typeof basis[i] === 'number' ? w * basis[i] :
            basis[i].map((q) => w * q));
        });
        return total;
      },
      derivative: (x, c) => {
        let total = this.space.derivative(vector, x, c, l);
        const forms = this.traces.whitneyForms(c, l);
        entities(c).forEach((entity, i) => {
          const w = whitney.get(entity);
          if (!w) return;
          const d = valueOf(differential(forms[i], l), x);
          total = sum(total, typeof d === 'number' ? w * d :
            d.map((q) => w * q));
        });
        return total;
      },
    };
  }
}

export {faceTrace};
