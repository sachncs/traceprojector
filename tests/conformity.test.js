import { expect } from 'chai'
import { Mesh } from '../traceprojector/mesh.js'
import { generateUnitCubeMesh } from '../traceprojector/generator.js'
import { ValidateError } from '../traceprojector/errors.js'

describe('Mesh rejects non-conforming input', () => {
  it('a face shared by three tetrahedra', () => {
    const vertices = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.3, 0.3, 1]]
    const tetrahedra = [[0, 1, 2, 3], [0, 1, 4, 2], [0, 1, 2, 5]]
    expect(() => new Mesh(vertices, tetrahedra)).to.throw(ValidateError, /shared by 3 tetrahedra/)
  })

  it('a hanging node: a vertex on a face of a neighbouring tetrahedron', () => {
    // The upper tetrahedron is split around a point of the face it shares with the lower one.
    const vertices = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [1 / 3, 1 / 3, 0]]
    const tetrahedra = [[0, 1, 4, 2], [5, 0, 1, 3], [5, 1, 2, 3], [5, 2, 0, 3]]
    expect(() => new Mesh(vertices, tetrahedra)).to.throw(ValidateError, /hanging node/)
  })

  it('a conforming mesh with a cavity is still accepted', () => {
    const base = generateUnitCubeMesh(3)
    const tetrahedra = base.getTetrahedra().filter((_, i) => i % 7 !== 0)
    expect(() => new Mesh(base.getVertices(), tetrahedra)).to.not.throw()
  })
})
