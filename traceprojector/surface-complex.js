/**
 * Oriented triangle surface in three dimensions with Whitney forms of degree
 * 0, 1 and 2. Edges [a, b] point from the smaller to the larger vertex number,
 * so edge forms need no sign; a triangle is oriented by its vertex order and
 * its 2-form is the constant 1 / area.
 */

const sub = (a, b) => a.map((q, i) => q - b[i]);
const scale = (a, s) => a.map((q) => q * s);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export class SurfaceComplex {
  /**
   * @param {number[][]} vertices Vertex coordinates.
   * @param {number[][]} triangles Triangles as three vertex indices.
   */
  constructor(vertices, triangles) {
    this.vertices = vertices;
    this.triangles = triangles;
    this.edges = [];
    this.edgeTriangles = [];
    this.triangleEdges = [];
    this.geometries = [];
    const index = new Map();
    triangles.forEach((triangle, t) => {
      this.triangleEdges.push([[1, 2], [0, 2], [0, 1]].map(([i, j]) => {
        const [a, b] = [triangle[i], triangle[j]].sort((p, q) => p - q);
        const key = `${a}_${b}`;
        let e = index.get(key);
        if (e === undefined) {
          e = this.edges.length;
          index.set(key, e);
          this.edges.push([a, b]);
          this.edgeTriangles.push([]);
        }
        this.edgeTriangles[e].push(t);
        return e;
      }));
    });
  }

  /** Corner points, area and barycentric gradients of triangle t. */
  geometry(t) {
    let g = this.geometries[t];
    if (g) return g;
    const points = this.triangles[t].map((v) => this.vertices[v]);
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    const twice = normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2;
    const gradients = [0, 1, 2].map((i) => scale(
        cross(normal, sub(points[(i + 2) % 3], points[(i + 1) % 3])),
        1 / twice));
    g = {points, area: Math.sqrt(twice) / 2, gradients};
    this.geometries[t] = g;
    return g;
  }

  /** Barycentric coordinates of a point of the plane of triangle t. */
  barycentric(t, x) {
    const {points, gradients} = this.geometry(t);
    const lambda = gradients.map((g) => g.reduce(
        (s, q, i) => s + q * (x[i] - points[0][i]), 0));
    lambda[0] += 1;
    return lambda;
  }

  /**
   * Whitney basis of degree l on triangle t at x, in the order of the
   * triangle's vertices (l = 0), of `triangleEdges[t]` (l = 1), and a single
   * constant 1 / area (l = 2).
   */
  whitney(t, l, x) {
    const {gradients, area} = this.geometry(t);
    const lambda = this.barycentric(t, x);
    if (l === 0) return lambda;
    if (l === 2) return [1 / area];
    return this.triangleEdges[t].map((e) => {
      const [a, b] = this.edges[e].map((v) => this.triangles[t].indexOf(v));
      return sub(
          scale(gradients[b], lambda[a]), scale(gradients[a], lambda[b]));
    });
  }

  /** The coboundary of vertex values: the change along each edge [a, b]. */
  gradient(values) {
    return this.edges.map(([a, b]) => values[b] - values[a]);
  }

  /**
   * The coboundary of edge circulations: for each triangle, the signed sum of
   * its edge circulations taken along its orientation.
   */
  curl(circulations) {
    return this.triangles.map((triangle, t) => {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        const from = triangle[k];
        const to = triangle[(k + 1) % 3];
        const e = this.triangleEdges[t].find((i) => {
          const [a, b] = this.edges[i];
          return (a === from && b === to) || (a === to && b === from);
        });
        sum += this.edges[e][0] === from ? circulations[e] : -circulations[e];
      }
      return sum;
    });
  }

  /** Triangles containing the vertex (l = 0), edge (l = 1) or itself (2). */
  star(l, index) {
    if (l === 2) return [index];
    if (l === 1) return this.edgeTriangles[index].slice();
    const found = [];
    this.triangles.forEach((triangle, t) => {
      if (triangle.includes(index)) found.push(t);
    });
    return found;
  }

  /** Triangles that share a vertex with a triangle of the star. */
  extendedStar(l, index) {
    const corners = new Set(this.star(l, index).flatMap(
        (t) => this.triangles[t]));
    const found = [];
    this.triangles.forEach((triangle, t) => {
      if (triangle.some((v) => corners.has(v))) found.push(t);
    });
    return found;
  }
}
