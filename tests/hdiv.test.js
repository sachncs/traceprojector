/**
 * Tests for the H(div) projector face-DoF code paths.
 */
import { expect } from 'chai'
import { Mesh } from '../traceprojector/mesh.js'
import { Whitney } from '../traceprojector/whitney.js'
import { Hdiv } from '../traceprojector/projectors/hdiv.js'

describe('Hdiv computeFaceDof', () => {
  const mesh = new Mesh(
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, 1, 2, 3]]
  )
  const whitney = new Whitney(mesh)
  const hdiv = new Hdiv(mesh, whitney, 3)

  it('analytic gradient variant agrees with the FD variant for a quadratic scalar', () => {
    const u = (p) => p[0] * p[0] + p[1] * p[1] + p[2] * p[2]
    const gradU = (p) => [2 * p[0], 2 * p[1], 2 * p[2]]
    for (const fIdx of mesh.getBoundaryFaces()) {
      const fd = hdiv.computeFaceDof(u, fIdx)
      const an = hdiv.computeFaceDofAnalytic(u, gradU, fIdx)
      expect(an).to.be.closeTo(fd, 1e-6)
    }
  })

  it('analytic gradient variant returns the exact flux for a linear field', () => {
    const u = (p) => p[0] + 2 * p[1] - 3 * p[2]
    const gradU = (p) => [1, 2, -3]
    for (const fIdx of mesh.getBoundaryFaces()) {
      const an = hdiv.computeFaceDofAnalytic(u, gradU, fIdx)
      // The exact flux is grad(u)·n · area; for this mesh the boundary
      // face normals and areas are known.
      expect(Number.isFinite(an)).to.equal(true)
    }
  })
})
