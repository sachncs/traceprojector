/**
 * Oriented tetrahedral complex with Whitney forms, using the conventions of
 * Ern, Guzman and Potu: every simplex is oriented by increasing vertex
 * number, an edge [a, b] points from a to b, and a face [a, b, c] has the
 * normal (b - a) x (c - a).
 *
 * The complex is self-contained: it needs only vertex coordinates and cells,
 * so it can describe both the mesh and its Alfeld split.
 */

const EDGE_PAIRS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const FACE_TRIPLES = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2],
];

/** Incidence of the edges [ab, bc, ac] in the boundary of the face [a, b, c].
 * */
const FACE_EDGE_SIGNS = [1, 1, -1];

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export class SimplicialComplex {
  /**
   * @param {!Array<!Array<number>>} vertices - Coordinates, indexed by vertex
   *     number.
   * @param {!Array<!Array<number>>} cells - Four vertex numbers per cell.
   */
  constructor(vertices, cells) {
    this.vertices = vertices;
    this.cells = cells.map((c) => [...c].sort((a, b) => a - b));
    this.edges = [];
    this.faces = [];
    this.cellEdges = [];
    this.cellFaces = [];
    this.faceCells = [];
    this.faceEdges = [];
    this.edgeIndexByKey = new Map();
    this.faceIndexByKey = new Map();
    this.geometries = new Array(this.cells.length);
    this.buildTopology();
    this.cellFaceSigns = this.cells.map((_, c) => this.computeCellFaceSigns(c));
  }

  /** @private */
  buildTopology() {
    for (let c = 0; c < this.cells.length; c++) {
      const v = this.cells[c];
      this.cellEdges.push(
          EDGE_PAIRS.map(([i, j]) => this.internEdge(v[i], v[j])),
      );
      const faces = FACE_TRIPLES.map(([i, j, k]) =>
        this.internFace(v[i], v[j], v[k]),
      );
      this.cellFaces.push(faces);
      for (const f of faces) this.faceCells[f].push(c);
    }
  }

  /** @private */
  internEdge(a, b) {
    const key = `${a}_${b}`;
    let index = this.edgeIndexByKey.get(key);
    if (index === undefined) {
      index = this.edges.length;
      this.edges.push([a, b]);
      this.edgeIndexByKey.set(key, index);
    }
    return index;
  }

  /** @private */
  internFace(a, b, c) {
    const key = `${a}_${b}_${c}`;
    let index = this.faceIndexByKey.get(key);
    if (index === undefined) {
      index = this.faces.length;
      this.faces.push([a, b, c]);
      this.faceCells.push([]);
      this.faceEdges.push([
        this.internEdge(a, b),
        this.internEdge(b, c),
        this.internEdge(a, c),
      ]);
      this.faceIndexByKey.set(key, index);
    }
    return index;
  }

  /** Index of the edge between two vertices, or -1. */
  edgeIndex(a, b) {
    return this.edgeIndexByKey.get(a < b ? `${a}_${b}` : `${b}_${a}`) ?? -1;
  }

  /** Index of the face with the given vertices (any order), or -1. */
  faceIndex(a, b, c) {
    const [x, y, z] = [a, b, c].sort((p, q) => p - q);
    return this.faceIndexByKey.get(`${x}_${y}_${z}`) ?? -1;
  }

  /** Whether a face belongs to exactly one cell. */
  isBoundaryFace(f) {
    return this.faceCells[f].length === 1;
  }

  /** Geometry of a cell: coordinates, volume and barycentric gradients. */
  geometry(c) {
    let g = this.geometries[c];
    if (g) return g;
    const p = this.cells[c].map((v) => this.vertices[v]);
    const e1 = sub(p[1], p[0]);
    const e2 = sub(p[2], p[0]);
    const e3 = sub(p[3], p[0]);
    const det = dot(e1, cross(e2, e3));
    const gradients = [
      scale(cross(e2, e3), 1 / det),
      scale(cross(e3, e1), 1 / det),
      scale(cross(e1, e2), 1 / det),
    ];
    gradients.unshift(
        scale(add(add(gradients[0], gradients[1]), gradients[2]), -1),
    );
    g = {points: p, volume: Math.abs(det) / 6, gradients};
    this.geometries[c] = g;
    return g;
  }

  /** @private Geometric incidence of the cell with each of its faces. */
  computeCellFaceSigns(c) {
    const {points} = this.geometry(c);
    const centroid = scale(points.reduce(add), 0.25);
    return FACE_TRIPLES.map((triple) => {
      const [a, b, d] = triple.map((i) => points[i]);
      const normal = cross(sub(b, a), sub(d, a));
      const faceCentroid = scale(add(add(a, b), d), 1 / 3);
      return dot(normal, sub(faceCentroid, centroid)) > 0 ? 1 : -1;
    });
  }

  /** Barycentric coordinates of x in cell c. */
  barycentric(c, x) {
    const {points, gradients} = this.geometry(c);
    const lambda = gradients.map((g) => dot(g, sub(x, points[0])));
    lambda[0] += 1;
    return lambda;
  }

  /**
   * Whitney basis of form degree l in cell c at x, ordered like the cell's
   * local vertices (l=0), edges (l=1), faces (l=2); l=3 gives [1 / volume].
   * @param {number} c
   * @param {number} l
   * @param {!Array<number>} x
   * @return {!Array<(number|!Array<number>)>}
   */
  whitney(c, l, x) {
    const {gradients, volume} = this.geometry(c);
    const lambda = this.barycentric(c, x);
    switch (l) {
      case 0:
        return lambda;
      case 1:
        return EDGE_PAIRS.map(([i, j]) =>
          sub(scale(gradients[j], lambda[i]), scale(gradients[i], lambda[j])),
        );
      case 2:
        return FACE_TRIPLES.map(([i, j, k]) =>
          scale(
              add(
                  add(
                      scale(cross(gradients[j], gradients[k]), lambda[i]),
                      scale(cross(gradients[k], gradients[i]), lambda[j]),
                  ),
                  scale(cross(gradients[i], gradients[j]), lambda[k]),
              ),
              2,
          ),
        );
      default:
        return [1 / volume];
    }
  }

  /** Global entity numbers of cell c for form degree l, in local order. */
  cellEntities(c, l) {
    switch (l) {
      case 0:
        return this.cells[c];
      case 1:
        return this.cellEdges[c];
      case 2:
        return this.cellFaces[c];
      default:
        return [c];
    }
  }

  /**
   * Boundary of an entity with its incidence numbers: for an edge its two
   * vertices, for a face its three edges, for a cell its four faces.
   * @param {number} l - Degree of the entity (1, 2 or 3).
   * @param {number} index
   * @return {!Array<{entity: number, sign: number}>}
   */
  boundary(l, index) {
    if (l === 1) {
      const [a, b] = this.edges[index];
      return [
        {entity: a, sign: -1},
        {entity: b, sign: 1},
      ];
    }
    if (l === 2) {
      return this.faceEdges[index].map((entity, i) => ({
        entity,
        sign: FACE_EDGE_SIGNS[i],
      }));
    }
    return this.cellFaces[index].map((entity, i) => ({
      entity,
      sign: this.cellFaceSigns[index][i],
    }));
  }

  /**
   * Canonical degree of freedom of a field on an entity: vertex value, edge
   * circulation, face flux through the normal (b - a) x (c - a), or cell
   * integral.
   * @param {number} l
   * @param {number} index
   * @param {function(!Array<number>): (number|!Array<number>)} u
   * @param {number=} order - Gauss points per direction.
   * @return {number}
   */
  degreeOfFreedom(l, index, u, order = 4) {
    if (l === 0) return u(this.vertices[index]);
    const {nodes, weights} = gaussLegendre(order);
    if (l === 1) {
      const [a, b] = this.edges[index].map((v) => this.vertices[v]);
      const tangent = sub(b, a);
      let sum = 0;
      for (let i = 0; i < order; i++) {
        sum +=
          weights[i] *
          dot(u(add(scale(a, 1 - nodes[i]), scale(b, nodes[i]))), tangent);
      }
      return sum;
    }
    if (l === 2) {
      const [a, b, d] = this.faces[index].map((v) => this.vertices[v]);
      // |n| is twice the area, which is the Jacobian of the reference triangle.
      const n = cross(sub(b, a), sub(d, a));
      let sum = 0;
      for (let i = 0; i < order; i++) {
        for (let j = 0; j < order; j++) {
          const s = nodes[i];
          const t = nodes[j] * (1 - s);
          const x = add(add(scale(a, 1 - s - t), scale(b, s)), scale(d, t));
          sum += weights[i] * weights[j] * (1 - s) * dot(u(x), n);
        }
      }
      return sum;
    }
    return integrateTetrahedron(this.geometry(index).points, u, order);
  }
}

// Gauss-Legendre nodes and weights on [0, 1], computed once by Newton
// iteration.
const gaussCache = new Map();

/**
 * @param {number} n
 * @return {{nodes: !Array<number>, weights: !Array<number>}}
 */
export function gaussLegendre(n) {
  let rule = gaussCache.get(n);
  if (rule) return rule;
  const nodes = [];
  const weights = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let derivative = 1;
    for (let iteration = 0; iteration < 100; iteration++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      derivative = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / derivative;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    nodes.push((1 - x) / 2);
    weights.push(1 / ((1 - x * x) * derivative * derivative));
  }
  rule = {nodes, weights};
  gaussCache.set(n, rule);
  return rule;
}

/**
 * Quadrature rule on a tetrahedron: a collapsed Gauss rule with order^3 points,
 * exact for polynomials of total degree up to 2 * order - 3. Weights include
 * the volume, so the integral of f is the sum of weight * f(x).
 * @param {!Array<!Array<number>>} points - The four vertices.
 * @param {number} order
 * @return {!Array<{x: !Array<number>, weight: number}>}
 */
export function tetrahedronRule(points, order) {
  const {nodes, weights} = gaussLegendre(order);
  const volume =
    Math.abs(
        dot(
            sub(points[1], points[0]),
            cross(sub(points[2], points[0]), sub(points[3], points[0])),
        ),
    ) / 6;
  const rule = [];
  for (let i = 0; i < order; i++) {
    for (let j = 0; j < order; j++) {
      for (let k = 0; k < order; k++) {
        const u = nodes[i];
        const v = nodes[j] * (1 - u);
        const w = nodes[k] * (1 - u) * (1 - nodes[j]);
        const jacobian = (1 - u) * (1 - u) * (1 - nodes[j]);
        const l0 = 1 - u - v - w;
        rule.push({
          x: [0, 1, 2].map(
              (m) =>
                l0 * points[0][m] +
              u * points[1][m] +
              v * points[2][m] +
              w * points[3][m],
          ),
          weight: 6 * volume * weights[i] * weights[j] * weights[k] * jacobian,
        });
      }
    }
  }
  return rule;
}

/**
 * Integral of a scalar function over a tetrahedron.
 * @param {!Array<!Array<number>>} points
 * @param {function(!Array<number>): number} f
 * @param {number} order
 * @return {number}
 */
export function integrateTetrahedron(points, f, order) {
  let sum = 0;
  for (const {x, weight} of tetrahedronRule(points, order)) {
    sum += weight * f(x);
  }
  return sum;
}
