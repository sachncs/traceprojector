/**
 * Shape regularity rho = max over cells of h / theta, where h is the cell
 * diameter and theta the diameter of the largest inscribed ball
 * (Ern-Guzman-Potu, eq. 3.1).
 * @param {!Array<!Array<number>>} vertices
 * @param {!Array<!Array<number>>} tetrahedra
 * @return {number}
 */
export function shapeRegularity (vertices, tetrahedra) {
  let rho = 0
  for (const t of tetrahedra) {
    const p = t.map((i) => vertices[i])
    let h = 0
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) h = Math.max(h, distance(p[i], p[j]))
    }
    const volume = Math.abs(determinant(p)) / 6
    const area = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]]
      .reduce((sum, f) => sum + triangleArea(p[f[0]], p[f[1]], p[f[2]]), 0)
    const theta = 2 * (3 * volume / area)
    rho = Math.max(rho, h / theta)
  }
  return rho
}

function distance (a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function determinant ([a, b, c, d]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
  return u[0] * (v[1] * w[2] - v[2] * w[1]) -
    u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0])
}

function triangleArea (a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0])
}
