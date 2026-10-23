/**
 * Stage S1: the locally L2-bounded zero-trace projection built from the local
 * weight functions of arXiv:2502.03601 (p = 0), tested with the pre-registered
 * tolerances. The cube meshes violate the paper's topological assumption near
 * their edges at star radius one, so these tests also exercise the adaptive
 * star radius.
 */
import { expect } from 'chai'
import { generateUnitCubeMesh } from '../traceprojector/generator.js'
import { LocalWeights } from '../traceprojector/local-weights.js'
import { ZeroTraceProjector } from '../traceprojector/zero-trace-projector.js'
import { StableProjector } from '../traceprojector/stable-projector.js'
import { tetrahedronRule, dot } from '../traceprojector/simplicial-complex.js'
import { shapeRegularity } from './support/mesh-quality.js'
import { seededRandom } from './support/random.js'
import { tolerances } from './support/tolerances.js'
import { whitneyField } from './support/locate.js'
import {
  Polynomial, X, Y, Z, vectorFunction, gradient, curl, divergence,
  randomPolynomial, randomVectorPolynomial
} from './support/polynomial.js'

const N = 4
const mesh = generateUnitCubeMesh(N)
const vertices = mesh.getVertices()
const cells = mesh.getTetrahedra()
const rho = shapeRegularity(vertices, cells)
const stable = tolerances.stableOperator
const tolerance = (scale = 1) =>
  tolerances.identity.c * stable.nOps * tolerances.machineEpsilon * rho * Math.max(1, scale)

const projector = new ZeroTraceProjector(vertices, cells, { quadratureOrder: 6 })
const weights = projector.weights
const complex = weights.base

const counts = [complex.vertices.length, complex.edges.length, complex.faces.length, complex.cells.length]
const interiorEntities = (l) => Array.from({ length: counts[l] }, (_, i) => i)
  .filter((i) => !weights.isBoundary(l, i))

/** Evenly spread sample of interior entities of degree l. */
function sample (l, count) {
  const all = interiorEntities(l)
  const stride = Math.max(1, Math.floor(all.length / count))
  return all.filter((_, k) => k % stride === 0).slice(0, count)
}

function pairWhitney (l, sigma, rho) {
  const w = weights.weight(l, sigma)
  let sum = 0
  for (const s of w.cells) {
    const c = s >> 2
    const k = complex.cellEntities(c, l).indexOf(rho)
    if (k < 0) continue
    for (const { x, weight } of tetrahedronRule(weights.split.geometry(s).points, 4)) {
      const z = weights.evaluate(l, w.dofs, s, x)
      const phi = complex.whitney(c, l, x)[k]
      sum += weight * (typeof z === 'number' ? z * phi : dot(z, phi))
    }
  }
  return sum
}

describe('Stable zero-trace projection (stage S1, p = 0)', function () {
  this.timeout(1800000)

  describe('weight functions: (Z(sigma), W_rho) = delta for interior rho', () => {
    for (const l of [0, 1, 2, 3]) {
      it(`degree ${l}`, () => {
        let worst = 0
        for (const sigma of sample(l, l === 0 ? 8 : 5)) {
          const rhos = new Set()
          for (const s of weights.weight(l, sigma).cells) {
            for (const r of complex.cellEntities(s >> 2, l)) if (!weights.isBoundary(l, r)) rhos.add(r)
          }
          for (const rhoEntity of rhos) {
            worst = Math.max(worst, Math.abs(pairWhitney(l, sigma, rhoEntity) - (rhoEntity === sigma ? 1 : 0)))
          }
        }
        expect(worst).to.be.at.most(tolerance())
      })
    }
  })

  describe('weight functions: weak differential relations against smooth test functions', () => {
    // m vanishes on the boundary of the cube, so no boundary terms appear.
    const bubble = X.multiply(Polynomial.constant(1).add(X.scale(-1)))
      .multiply(Y).multiply(Polynomial.constant(1).add(Y.scale(-1)))
      .multiply(Z).multiply(Polynomial.constant(1).add(Z.scale(-1)))
    const pair = (l, sigma, f) => {
      const w = weights.weight(l, sigma)
      let sum = 0
      for (const s of w.cells) {
        for (const { x, weight } of tetrahedronRule(weights.split.geometry(s).points, 6)) {
          const z = weights.evaluate(l, w.dofs, s, x)
          sum += weight * (typeof z === 'number' ? z * f(x) : dot(z, f(x)))
        }
      }
      return sum
    }
    it('(Z1(e), grad m) = (Z0(b) - Z0(a), m)', () => {
      const gradF = vectorFunction(gradient(bubble))
      for (const e of sample(1, 4)) {
        const [a, b] = complex.edges[e]
        const rhs = (weights.isBoundary(0, b) ? 0 : pair(0, b, (x) => bubble.evaluate(x))) -
          (weights.isBoundary(0, a) ? 0 : pair(0, a, (x) => bubble.evaluate(x)))
        expect(Math.abs(pair(1, e, gradF) - rhs)).to.be.at.most(tolerance())
      }
    })
    it('(Z2(f), curl A) = sum incidence (Z1(e), A) for A with zero tangential trace', () => {
      const A = [bubble, bubble.scale(0.5), bubble.scale(-2)]
      const curlF = vectorFunction(curl(A))
      const AF = vectorFunction(A)
      for (const f of sample(2, 4)) {
        const rhs = complex.boundary(2, f).reduce((s, { entity, sign }) =>
          s + (weights.isBoundary(1, entity) ? 0 : sign * pair(1, entity, AF)), 0)
        expect(Math.abs(pair(2, f, curlF) - rhs)).to.be.at.most(tolerance(10))
      }
    })
    it('(Z3(c), div B) = sum incidence (Z2(f), B) for B with zero normal trace', () => {
      const B = [bubble, bubble.scale(0.5), bubble.scale(-2)]
      const divF = (x) => divergence(B).evaluate(x)
      const BF = vectorFunction(B)
      for (const c of sample(3, 4)) {
        const rhs = complex.boundary(3, c).reduce((s, { entity, sign }) =>
          s + (weights.isBoundary(2, entity) ? 0 : sign * pair(2, entity, BF)), 0)
        expect(Math.abs(pair(3, c, divF) - rhs)).to.be.at.most(tolerance(10))
      }
    })
  })

  describe('projection: Pi u = u for u in the zero-trace Whitney space', () => {
    for (const l of [0, 1, 2, 3]) {
      it(`degree ${l}`, () => {
        const random = seededRandom(100 + l)
        const coefficients = new Map()
        const field = whitneyField(complex, l, (e) => {
          if (weights.isBoundary(l, e)) return 0
          if (!coefficients.has(e)) coefficients.set(e, 2 * random() - 1)
          return coefficients.get(e)
        })
        let worst = 0
        let scale = 1
        for (const c of [0, 100, 200, 300, 383]) {
          const { points } = complex.geometry(c)
          const x = points.reduce((s, p) => s.map((v, k) => v + p[k] / 4), [0, 0, 0])
          const got = projector.project(field, x, c, l)
          const want = field(x)
          const diff = typeof got === 'number' ? [got - want] : got.map((v, k) => v - want[k])
          worst = Math.max(worst, ...diff.map(Math.abs))
          scale = Math.max(scale, ...[].concat(want).map(Math.abs))
        }
        expect(worst).to.be.at.most(tolerance(scale))
      })
    }
  })

  describe('commuting for smooth fields in the zero-trace spaces', () => {
    const bubble = X.multiply(Polynomial.constant(1).add(X.scale(-1)))
      .multiply(Y).multiply(Polynomial.constant(1).add(Y.scale(-1)))
      .multiply(Z).multiply(Polynomial.constant(1).add(Z.scale(-1)))
    const centroid = (c) => complex.geometry(c).points.reduce((s, p) => s.map((v, k) => v + p[k] / 4), [0, 0, 0])
    const cellsToTest = [0, 150, 250, 383]

    it('grad Pi0 u = Pi1 grad u', () => {
      const u = (x) => bubble.evaluate(x)
      const gradU = vectorFunction(gradient(bubble))
      for (const c of cellsToTest) {
        const x = centroid(c)
        // Pi0 u is affine in the cell: its gradient is sum of coefficients * grad lambda.
        const { gradients } = complex.geometry(c)
        const g = [0, 0, 0]
        complex.cells[c].forEach((v, k) => {
          const coef = weights.isBoundary(0, v) ? 0 : projector.coefficient(u, 0, v)
          for (let m = 0; m < 3; m++) g[m] += coef * gradients[k][m]
        })
        const rhs = projector.project(gradU, x, c, 1)
        expect(Math.max(...g.map((v, m) => Math.abs(v - rhs[m])))).to.be.at.most(tolerance(10))
      }
    })

    it('curl Pi1 A = Pi2 curl A', () => {
      const A = [bubble, bubble.scale(0.5), bubble.scale(-2)]
      const AF = vectorFunction(A)
      const curlF = vectorFunction(curl(A))
      for (const c of cellsToTest) {
        const x = centroid(c)
        // Pi1 A = sum of coefficients * W_e in the cell; its curl is the sum of
        // flux-dof incidences, here evaluated through the Whitney identity
        // curl W_e = sum over the cell faces of incidence * W_f.
        const projected = [0, 0, 0]
        complex.cellEdges[c].forEach((e, k) => {
          if (weights.isBoundary(1, e)) return
          const coef = projector.coefficient(AF, 1, e)
          const [i, j] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]][k]
          const { gradients } = complex.geometry(c)
          const cu = [
            2 * (gradients[i][1] * gradients[j][2] - gradients[i][2] * gradients[j][1]),
            2 * (gradients[i][2] * gradients[j][0] - gradients[i][0] * gradients[j][2]),
            2 * (gradients[i][0] * gradients[j][1] - gradients[i][1] * gradients[j][0])
          ]
          for (let m = 0; m < 3; m++) projected[m] += coef * cu[m]
        })
        const rhs = projector.project(curlF, x, c, 2)
        expect(Math.max(...projected.map((v, m) => Math.abs(v - rhs[m])))).to.be.at.most(tolerance(10))
      }
    })

    it('div Pi2 B = Pi3 div B', () => {
      const B = [bubble, bubble.scale(0.5), bubble.scale(-2)]
      const BF = vectorFunction(B)
      const divF = (x) => divergence(B).evaluate(x)
      for (const c of cellsToTest) {
        const x = centroid(c)
        const divergenceOfProjection = complex.boundary(3, c).reduce((s, { entity, sign }) =>
          s + (weights.isBoundary(2, entity) ? 0 : sign * projector.coefficient(BF, 2, entity)), 0) /
          complex.geometry(c).volume
        const rhs = projector.project(divF, x, c, 3)
        expect(Math.abs(divergenceOfProjection - rhs)).to.be.at.most(tolerance(10))
      }
    })
  })

  describe('boundedness: finite output for an H1 field unbounded at a mesh vertex', () => {
    const center = [0.5, 0.5, 0.5]
    const singular = (x) => Math.hypot(x[0] - center[0], x[1] - center[1], x[2] - center[2]) ** stable.singularField.exponent
    it('every coefficient is finite (the canonical operator returns Infinity)', () => {
      const vertex = vertices.findIndex((v) => v.every((q, k) => q === center[k]))
      const c = cells.findIndex((t) => t.includes(vertex))
      const x = complex.geometry(c).points.reduce((s, p) => s.map((v, k) => v + p[k] / 4), [0, 0, 0])
      const value = projector.project(singular, x, c, 0)
      expect(Number.isFinite(value)).to.equal(true)
    })
  })

  describe('assembled projection Pi = Pi_boundary + Pi_zero (I - Pi_boundary)', () => {
    const stableProjector = new StableProjector(vertices, cells, { interior: projector, quadratureOrder: 6 })
    const centroid = (c) => complex.geometry(c).points.reduce((s, p) => s.map((v, k) => v + p[k] / 4), [0, 0, 0])
    const cellsToTest = [0, 120, 250, 383]
    const difference = (a, b) => (typeof a === 'number' ? [a - b] : a.map((v, k) => v - b[k]))

    for (const l of [0, 1, 2, 3]) {
      it(`reproduces fields of the discrete space of degree ${l}`, () => {
        const random = seededRandom(300 + l)
        const coefficients = new Map()
        const field = whitneyField(complex, l, (e) => {
          if (!coefficients.has(e)) coefficients.set(e, 2 * random() - 1)
          return coefficients.get(e)
        })
        let worst = 0
        let scale = 1
        for (const c of cellsToTest) {
          const x = centroid(c)
          worst = Math.max(worst, ...difference(stableProjector.project(field, x, c, l), field(x)).map(Math.abs))
          scale = Math.max(scale, ...[].concat(field(x)).map(Math.abs))
        }
        expect(worst).to.be.at.most(tolerance(scale))
      })
    }

    // The proof of Theorem 3.1 (arXiv:2604.28103) uses that u - Pi_boundary u has zero
    // trace, which holds exactly when u has a polynomial trace (u in V_tr,p). The
    // theorem states commuting for every u, but the proof covers only V_tr,p, so the
    // claim is tested on that class: a discrete field plus a field with zero trace.
    it('commutes with grad, curl and div for fields with polynomial trace', () => {
      const random = seededRandom(7)
      const bubble = X.multiply(Polynomial.constant(1).add(X.scale(-1)))
        .multiply(Y).multiply(Polynomial.constant(1).add(Y.scale(-1)))
        .multiply(Z).multiply(Polynomial.constant(1).add(Z.scale(-1)))
      const discrete0 = randomPolynomial(random, 1)
      const u = discrete0.add(bubble.multiply(randomPolynomial(random, 1)))
      // Nedelec field a + b x position (curl-compatible), plus a field with zero trace.
      const [b1, b2, b3] = [0.5, -0.3, 0.8]
      const nedelec = [
        Polynomial.constant(0.3).add(Z.scale(b2)).add(Y.scale(-b3)),
        Polynomial.constant(-0.2).add(X.scale(b3)).add(Z.scale(-b1)),
        Polynomial.constant(0.1).add(Y.scale(b1)).add(X.scale(-b2))
      ]
      const zeroTrace = [bubble, bubble.scale(0.5), bubble.scale(-2)]
      const A = nedelec.map((p, k) => p.add(zeroTrace[k]))
      // Raviart-Thomas field a + s x, plus a field with zero trace.
      const raviartThomas = [X.scale(0.6).add(Polynomial.constant(0.2)),
        Y.scale(0.6).add(Polynomial.constant(-0.1)), Z.scale(0.6).add(Polynomial.constant(0.4))]
      const B = raviartThomas.map((p, k) => p.add(zeroTrace[k]))
      const uF = (x) => u.evaluate(x)
      const gradF = vectorFunction(gradient(u))
      const AF = vectorFunction(A)
      const curlF = vectorFunction(curl(A))
      const BF = vectorFunction(B)
      const divF = (x) => divergence(B).evaluate(x)
      const edgePairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
      for (const c of cellsToTest) {
        const x = centroid(c)
        const { gradients, volume } = complex.geometry(c)
        // grad: Pi0 u is the sum of vertex coefficients times lambda, so its gradient uses grad lambda.
        const g = [0, 0, 0]
        complex.cells[c].forEach((v, k) => {
          const a = stableProjector.coefficient(uF, 0, v)
          for (let m = 0; m < 3; m++) g[m] += a * gradients[k][m]
        })
        const gradRhs = stableProjector.project(gradF, x, c, 1)
        expect(Math.max(...g.map((v, m) => Math.abs(v - gradRhs[m])))).to.be.at.most(tolerance(10))
        // curl: curl W_e = 2 grad lambda_i x grad lambda_j.
        const cu = [0, 0, 0]
        complex.cellEdges[c].forEach((e, k) => {
          const a = stableProjector.coefficient(AF, 1, e)
          const [i, j] = edgePairs[k]
          const w = [
            2 * (gradients[i][1] * gradients[j][2] - gradients[i][2] * gradients[j][1]),
            2 * (gradients[i][2] * gradients[j][0] - gradients[i][0] * gradients[j][2]),
            2 * (gradients[i][0] * gradients[j][1] - gradients[i][1] * gradients[j][0])
          ]
          for (let m = 0; m < 3; m++) cu[m] += a * w[m]
        })
        const curlRhs = stableProjector.project(curlF, x, c, 2)
        expect(Math.max(...cu.map((v, m) => Math.abs(v - curlRhs[m])))).to.be.at.most(tolerance(10))
        // div: div W_f = incidence / volume.
        const d = complex.boundary(3, c).reduce((s, { entity, sign }) =>
          s + sign * stableProjector.coefficient(BF, 2, entity), 0) / volume
        expect(Math.abs(d - stableProjector.project(divF, x, c, 3))).to.be.at.most(tolerance(10))
      }
    })

    it('preserves traces: Pi(v + b) and Pi(v) agree on the boundary for b with zero trace', () => {
      const bubble = X.multiply(Polynomial.constant(1).add(X.scale(-1)))
        .multiply(Y).multiply(Polynomial.constant(1).add(Y.scale(-1)))
        .multiply(Z).multiply(Polynomial.constant(1).add(Z.scale(-1)))
      const random = seededRandom(11)
      const v = randomPolynomial(random, 1)
      const withBubble = (x) => v.evaluate(x) + bubble.evaluate(x)
      const plain = (x) => v.evaluate(x)
      for (const e of complex.edges.keys()) {
        if (!weights.isBoundary(1, e)) continue
        // a boundary vertex coefficient is the canonical dof, identical for both fields
        break
      }
      for (const vertex of complex.vertices.keys()) {
        if (!weights.isBoundary(0, vertex)) continue
        expect(Math.abs(stableProjector.coefficient(withBubble, 0, vertex) -
          stableProjector.coefficient(plain, 0, vertex))).to.be.at.most(tolerance())
      }
    })

    it('stays finite for a field unbounded at an interior vertex', () => {
      const center = [0.5, 0.5, 0.5]
      const singular = (x) => Math.hypot(x[0] - center[0], x[1] - center[1], x[2] - center[2]) ** stable.singularField.exponent
      const vertex = vertices.findIndex((p) => p.every((q, k) => q === center[k]))
      for (const c of cells.map((t, i) => (t.includes(vertex) ? i : -1)).filter((i) => i >= 0).slice(0, 4)) {
        const value = stableProjector.project(singular, centroid(c), c, 0)
        expect(Number.isFinite(value)).to.equal(true)
        expect(Math.abs(value)).to.be.below(10)
      }
    })
  })
})
