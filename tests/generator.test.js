/**
 * Tests for the structured mesh generators in traceprojector/generator.js.
 */
import { expect } from 'chai'
import { generateSingleTetMesh, generateUnitCubeMesh } from '../traceprojector/generator.js'

describe('generator', () => {
  it('generateSingleTetMesh returns a single positive-volume tetrahedron', () => {
    const mesh = generateSingleTetMesh()
    expect(mesh.tetrahedronCount).to.equal(1)
    expect(mesh.getVolume(0)).to.be.greaterThan(0)
  })

  it('generateUnitCubeMesh(1) produces six positively oriented tets', () => {
    const mesh = generateUnitCubeMesh(1)
    expect(mesh.tetrahedronCount).to.equal(6)
    for (let tIdx = 0; tIdx < mesh.tetrahedronCount; tIdx++) {
      expect(mesh.getVolume(tIdx)).to.be.greaterThan(0)
    }
  })

  it('generateUnitCubeMesh is orientation-correct for n=2,3,4', () => {
    for (const n of [2, 3, 4]) {
      const mesh = generateUnitCubeMesh(n)
      for (let tIdx = 0; tIdx < mesh.tetrahedronCount; tIdx++) {
        expect(mesh.getVolume(tIdx), `n=${n} tet=${tIdx}`).to.be.greaterThan(0)
      }
    }
  })

  it('generateUnitCubeMesh rejects non-positive n', () => {
    expect(() => generateUnitCubeMesh(0)).to.throw(/positive integer/)
    expect(() => generateUnitCubeMesh(-1)).to.throw(/positive integer/)
    expect(() => generateUnitCubeMesh(1.5)).to.throw(/positive integer/)
  })
})
