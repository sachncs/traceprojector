import { expect } from 'chai'
import { Mesh } from '../traceprojector/mesh.js'
import { Whitney } from '../traceprojector/whitney.js'
import { Projector } from '../traceprojector/traceprojector.js'
import { Locator } from '../traceprojector/locator.js'
import { generateUnitCubeMesh } from '../traceprojector/generator.js'
import { triangleFrame } from '../traceprojector/surface.js'
import { inverse3x3, solve3x3, relativeVolume } from '../traceprojector/utils.js'
import { ValidateError, SingularError } from '../traceprojector/errors.js'

/** The unit cube mesh with every coordinate multiplied by `scale`. */
function scaledCube (scale) {
  const base = generateUnitCubeMesh(2)
  return new Mesh(base.getVertices().map((v) => v.map((q) => q * scale)), base.getTetrahedra())
}

describe('geometry does not depend on the unit system', () => {
  for (const scale of [1e-6, 1e-4, 1e4, 1e6]) {
    it(`a mesh scaled by ${scale} is accepted and projects an affine field exactly`, () => {
      const mesh = scaledCube(scale)
      const projector = new Projector(mesh, new Whitney(mesh), { onWarning: () => {} })
      const corner = mesh.getVertices()[mesh.getTetrahedra()[0][0]]
      const far = mesh.getVertices()[mesh.getTetrahedra()[0][3]]
      const point = corner.map((q, i) => q + 0.1 * (far[i] - q))
      const field = (x) => x[0] + 2 * x[1] + 3 * x[2]
      expect(Math.abs(projector.projectH1(field, point, 0) - field(point))).to.be.below(1e-9 * scale)
    })

    it(`the locator finds a point in a mesh scaled by ${scale}`, () => {
      const mesh = scaledCube(scale)
      const centroid = [0, 1, 2].map((k) =>
        mesh.getTetrahedra()[0].reduce((s, v) => s + mesh.getVertices()[v][k] / 4, 0))
      const found = new Locator(mesh).findTetrahedron(centroid)
      expect(found).to.not.equal(null)
    })

    it(`face normals of a mesh scaled by ${scale} are unit vectors`, () => {
      const mesh = scaledCube(scale)
      const normal = mesh.computeFaceOutwardNormal(mesh.getBoundaryFaces()[0])
      expect(Math.hypot(...normal)).to.be.closeTo(1, 1e-12)
    })
  }

  it('3x3 solves and inverses accept small well-conditioned matrices', () => {
    const m = [[1e-5, 0, 0], [0, 1e-5, 0], [0, 0, 1e-5]]
    expect(inverse3x3(m)[0][0]).to.be.closeTo(1e5, 1e-6)
    expect(solve3x3(m, [1e-5, 2e-5, 3e-5])[2]).to.be.closeTo(3, 1e-12)
  })

  it('3x3 solves still reject a singular matrix at any scale', () => {
    for (const s of [1e-8, 1, 1e8]) {
      const m = [[s, 2 * s, 3 * s], [2 * s, 4 * s, 6 * s], [0, s, s]]
      expect(() => inverse3x3(m)).to.throw(SingularError)
    }
  })

  it('a degenerate surface triangle raises an error instead of a made-up normal', () => {
    expect(() => triangleFrame([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).to.throw(ValidateError)
  })

  it('the mesh rejects a tetrahedron that is flat relative to its size, at any scale', () => {
    for (const s of [1e-6, 1, 1e6]) {
      const flat = [[0, 0, 0], [s, 0, 0], [0, s, 0], [s, s, 1e-12 * s]]
      expect(Math.abs(relativeVolume(flat))).to.be.below(1e-10)
      expect(() => new Mesh(flat, [[0, 1, 2, 3]])).to.throw(ValidateError)
    }
  })
})
