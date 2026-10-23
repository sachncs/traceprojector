/**
 * Criterion A4: observed convergence. The target orders are those of classical
 * Whitney interpolation theory; the papers prove quasi-optimality, not a rate.
 * Pass rule (pre-registered): the lower 95% confidence bound of the fitted
 * log-log slope is at least the theoretical order minus 0.1, over at least four
 * refinements. Observing a higher order is a pass.
 */
import { expect } from 'chai'
import { Mesh, Whitney, Projector } from '../traceprojector/traceprojector.js'
import { generateUnitCubeMesh } from '../traceprojector/generator.js'
import { tetrahedronRule } from '../traceprojector/simplicial-complex.js'
import { tolerances } from './support/tolerances.js'
import { fitSlope } from './support/statistics.js'

// Meshes need enough cells per wavelength for the asymptotic regime. A first design with
// one wavelength across the cube on 2..12 cells per side was pre-asymptotic (observed
// orders 0.9, 1.6, 1.9 for successive pairs of meshes), so the field now has half a
// wavelength across the cube and the meshes start at 4 cells per side. The threshold
// from tolerances.json is unchanged.
const SIZES = [4, 6, 8, 12, 16, 24]
const two = Math.PI

// Smooth, non-polynomial fields with known gradient/curl/divergence not needed:
// only the error of the projection itself is measured.
const scalar = (x) => Math.sin(two * x[0]) * Math.cos(two * x[1]) * Math.sin(two * x[2]) + x[0] * x[1]
const gradScalar = (x) => [
  two * Math.cos(two * x[0]) * Math.cos(two * x[1]) * Math.sin(two * x[2]) + x[1],
  -two * Math.sin(two * x[0]) * Math.sin(two * x[1]) * Math.sin(two * x[2]) + x[0],
  two * Math.sin(two * x[0]) * Math.cos(two * x[1]) * Math.cos(two * x[2])
]
const vector = (x) => [Math.sin(two * x[1]) * Math.cos(x[2]), Math.cos(two * x[2]) * x[0], Math.sin(x[0] + x[1]) + x[2] ** 2]

const norm = (v) => (typeof v === 'number' ? Math.abs(v) : Math.hypot(...v))
const minus = (a, b) => (typeof a === 'number' ? a - b : a.map((v, i) => v - b[i]))

/** L2 error of the projection of `u` of form degree l, with Gauss quadrature of 4 points per direction. */
function l2Error (mesh, projector, u, l) {
  let sum = 0
  const vertices = mesh.getVertices()
  mesh.getTetrahedra().forEach((tet, t) => {
    for (const { x, weight } of tetrahedronRule(tet.map((i) => vertices[i]), 4)) {
      const projected = l === 0 ? projector.projectH1(u, x, t)
        : l === 1 ? projector.projectHcurl(u, x, t)
          : l === 2 ? projector.projectHdiv(u, x, t) : projector.projectL2(u, t)
      sum += weight * norm(minus(projected, u(x))) ** 2
    }
  })
  return Math.sqrt(sum)
}

/** H1 seminorm error of Pi0 u: gradient of the P1 interpolant against the exact gradient. */
function h1SeminormError (mesh, projector, u, gradient) {
  let sum = 0
  const vertices = mesh.getVertices()
  const whitney = new Whitney(mesh)
  mesh.getTetrahedra().forEach((tet, t) => {
    const gradL = whitney.getGradBarycentric(t)
    const g = [0, 0, 0]
    tet.forEach((v, k) => { for (let m = 0; m < 3; m++) g[m] += u(vertices[v]) * gradL[k][m] })
    for (const { x, weight } of tetrahedronRule(tet.map((i) => vertices[i]), 4)) {
      sum += weight * norm(minus(g, gradient(x))) ** 2
    }
  })
  return Math.sqrt(sum)
}

describe('Observed convergence of the canonical projection', function () {
  this.timeout(1800000)
  const { delta, minRefinements } = tolerances.convergence

  const studies = [
    { name: 'Pi0, L2 error', order: 2, measure: (m, p) => l2Error(m, p, scalar, 0) },
    { name: 'Pi0, H1 seminorm error', order: 1, measure: (m, p) => h1SeminormError(m, p, scalar, gradScalar) },
    { name: 'Pi1, L2 error', order: 1, measure: (m, p) => l2Error(m, p, vector, 1) },
    { name: 'Pi2, L2 error', order: 1, measure: (m, p) => l2Error(m, p, vector, 2) },
    { name: 'Pi3, L2 error', order: 1, measure: (m, p) => l2Error(m, p, scalar, 3) }
  ]

  for (const { name, order, measure } of studies) {
    it(`${name}: observed order >= ${order} - ${delta} (lower 95% bound)`, () => {
      const logH = []
      const logError = []
      for (const n of SIZES) {
        const base = generateUnitCubeMesh(n)
        const mesh = new Mesh(base.getVertices(), base.getTetrahedra())
        const projector = new Projector(mesh, new Whitney(mesh), { onWarning: () => {}, quadratureOrder: 3 })
        logH.push(Math.log(1 / n))
        logError.push(Math.log(measure(mesh, projector)))
      }
      expect(SIZES.length).to.be.at.least(minRefinements)
      const fit = fitSlope(logH, logError)
      // Reported so that the numbers are in the test log.
      console.log(`      slope ${fit.slope.toFixed(3)} +/- ${fit.standardError.toFixed(3)} (lower bound ${fit.lowerBound.toFixed(3)}) over ${fit.points} meshes`)
      expect(fit.lowerBound).to.be.at.least(order - delta)
    })
  }
})
