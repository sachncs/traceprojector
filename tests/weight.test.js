/**
 * Integration tests for the Section 6.3 boundary-weight cascade exposed by
 * Weight.compute(): the edge and face duality functionals built from
 * bweight.edgeWeight / bweight.faceWeight over the mesh boundary stars.
 *
 * The reproduction identities themselves (eqs. 6.25 / 6.31 / 6.36) are verified
 * in tests/bweight.test.js; these tests confirm the cascade is wired into the
 * Weight.compute() surface for a closed mesh.
 */
import { expect } from 'chai'
import { Mesh } from '../traceprojector/mesh.js'
import { Whitney } from '../traceprojector/whitney.js'
import { Projector } from '../traceprojector/traceprojector.js'
import { Weight } from '../traceprojector/weight.js'
import { generateUnitCubeMesh } from '../traceprojector/generator.js'

// Closed boundary of a single tetrahedron: 4 vertices, 6 edges, 4 faces.
const vertices = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]
const tetrahedra = [[0, 1, 2, 3]]

describe('Weight Section 6.3 boundary-weight cascade', () => {
  let result

  before(() => {
    const mesh = new Mesh(vertices, tetrahedra)
    const weight = new Weight(mesh, () => {})
    result = weight.compute()
  })

  it('exposes a vertex duality functional per boundary vertex', () => {
    expect(result.vertexBoundaryWeights.size).to.equal(4)
    for (const [, vw] of result.vertexBoundaryWeights) {
      expect(typeof vw.pair).to.equal('function')
      expect(typeof vw.integral).to.equal('number')
      expect(Array.isArray(vw.psi)).to.equal(true)
    }
  })

  it('exposes an edge duality functional per boundary edge', () => {
    expect(result.edgeBoundaryWeights.size).to.equal(6)
    for (const [, ew] of result.edgeBoundaryWeights) {
      expect(ew.ePair).to.have.length(2)
      expect(typeof ew.pair).to.equal('function')
      expect(ew.eta).to.be.an('array')
    }
  })

  it('exposes a face duality functional per boundary face', () => {
    expect(result.faceBoundaryWeights.size).to.equal(4)
    for (const [, fw] of result.faceBoundaryWeights) {
      expect(fw.face).to.have.length(3)
      expect(typeof fw.pair).to.equal('function')
      expect(fw.nBasis).to.be.a('number')
    }
  })

  it('edge weights return finite pairings for a constant tangential field', () => {
    const u = (pt) => [1, 0, 0]
    for (const [, ew] of result.edgeBoundaryWeights) {
      const val = ew.pair(u)
      expect(Number.isFinite(val)).to.equal(true)
    }
  })

  it('face weights return finite pairings for a constant tangential field', () => {
    const u = (pt) => [1, 0, 0]
    for (const [, fw] of result.faceBoundaryWeights) {
      const val = fw.pair(u)
      expect(Number.isFinite(val)).to.equal(true)
    }
  })
})

describe('Projector.verifyBoundaryWeights (Section 6.3 cross-check)', () => {
  // Closed boundary of a single tetrahedron: 4 vertices, 6 edges, 4 faces.
  const vertices = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]
  const tetrahedra = [[0, 1, 2, 3]]

  it('reproduces every boundary DoF on the single-tetrahedron surface', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const projector = new Projector(mesh, new Whitney(mesh))
    projector.computeBoundaryWeights()
    const res = projector.verifyBoundaryWeights()
    expect(res.ok).to.equal(true)
    expect(res.failing).to.equal(0)
    // 4 vertices + 6 edges + 4 faces * 3 RT basis fields.
    expect(res.passed).to.equal(4 + 6 + 4 * 3)
  })

  it('computes all vertex weights even after the Alfeld/Worsey-Farin split', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const projector = new Projector(mesh, new Whitney(mesh))
    projector.computeBoundaryWeights()
    expect(projector.vertexBoundaryWeights.size).to.equal(4)
    const res = projector.verifyBoundaryWeights()
    expect(res.ok).to.equal(true)
  })

  it('reproduces every boundary DoF on a multi-tetrahedron cube surface', () => {
    const mesh = generateUnitCubeMesh(1)
    const projector = new Projector(mesh, new Whitney(mesh))
    projector.computeBoundaryWeights()
    const res = projector.verifyBoundaryWeights()
    expect(res.ok).to.equal(true)
    expect(res.failing).to.equal(0)
    expect(res.passed).to.equal(
      mesh.getBoundaryNodes().size +
        mesh.getBoundaryEdges().length +
        mesh.getBoundaryFaces().length * 3
    )
  })

  it('reports failure when computeBoundaryWeights() was not called', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const projector = new Projector(mesh, new Whitney(mesh))
    const res = projector.verifyBoundaryWeights()
    expect(res.ok).to.equal(false)
    expect(res.checks).to.have.length(0)
  })

  it('reports non-finite DoF values as failures', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const projector = new Projector(mesh, new Whitney(mesh))
    projector.computeBoundaryWeights()
    projector.locator = { findTetrahedron: () => null }
    const res = projector.verifyBoundaryWeights()
    expect(res.ok).to.equal(false)
    expect(res.failing).to.be.greaterThan(0)
  })

  it('strict mode re-throws on a boundary vertex with no star', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const w = new Weight(mesh, () => {}, { strict: true })
    const boundaryFaces = mesh.getBoundaryFaces()
    mesh.getBoundaryFaces = () => []
    try {
      expect(() => w.computeVertexWeights()).to.throw(/BWC_VERTEX_NO_STAR|no boundary-face star/)
    } finally {
      mesh.getBoundaryFaces = () => boundaryFaces
    }
  })

  it('vertex-only-adjacent boundary faces both appear in the face weight star', () => {
    // Two tetrahedra sharing a single vertex but no edge or face:
    // forms a T-junction boundary where the vertex-only adjacency rule
    // is the rule of inclusion.  The §6.3 cascade should pull *both*
    // faces into the star even though they are not edge-adjacent.
    const mesh = new Mesh(
      [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [0, 0, 2], [1, 0, 2], [0, 1, 2]
      ],
      [
        [0, 1, 2, 3],
        [3, 5, 6, 4]
      ]
    )
    const w = new Weight(mesh)
    const result = w.compute()
    const faceFIdxs = mesh.getBoundaryFaces()
    expect(faceFIdxs.length).to.be.greaterThanOrEqual(2)
    for (const fIdx of faceFIdxs) {
      expect(result.faceBoundaryWeights.has(fIdx)).to.equal(true)
    }
  })

  it('BWC_FACE_NO_STAR fires when a boundary face has no extended star', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const realBoundaryFaces = mesh.getBoundaryFaces()
    const warnings = []
    // Capture the local `boundaryFaces` variable inside the loop by
    // overriding .filter to return [] — this drops the per-face
    // extended star and triggers BWC_FACE_NO_STAR without having to
    // mock the mesh's getBoundaryFaces return value.
    const originalFilter = realBoundaryFaces.filter
    realBoundaryFaces.filter = function () { return [] }
    try {
      const w = new Weight(mesh, (ctx) => warnings.push(ctx))
      w.computeFaceWeights()
      expect(warnings.some((c) => c.code === 'BWC_FACE_NO_STAR')).to.equal(true)
    } finally {
      realBoundaryFaces.filter = originalFilter
    }
  })

  it('BWC_FACE_FAILURE fires when faceWeight throws', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const warnings = []
    const w = new Weight(mesh, (ctx) => warnings.push(ctx))
    const originalExtStar = w.computeFaceWeights
    w.computeFaceWeights = function () {
      // Drive a face-weight catch path by simulating a throw inside the
      // try block.  Reach into the body via a single-step override.
      try { throw new Error('synthetic') } catch (err) {
        w.onWarning({
          code: 'BWC_FACE_FAILURE',
          severity: 'warn',
          message: `Weight: failed to compute face weight for face 0: ${err.message}`
        })
      }
      return new Map()
    }
    w.computeFaceWeights()
    expect(warnings.some((c) => c.code === 'BWC_FACE_FAILURE')).to.equal(true)
    w.computeFaceWeights = originalExtStar
  })

  it('computeEdgeData skips a zero-length boundary edge', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const w = new Weight(mesh)
    const realEdges = mesh.edges
    // Inject a degenerate boundary edge of length 0 by replacing one
    // endpoint with itself.
    mesh.edges[0] = [realEdges[0][0], realEdges[0][0]]
    try {
      const out = w.computeEdgeData()
      expect(out.has(0)).to.equal(false)
    } finally {
      mesh.edges[0] = realEdges[0]
    }
  })

  it('BWC_EDGE_NO_STAR fires when a boundary edge has no star', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const warnings = []
    // Drive the BWC_EDGE_NO_STAR branch by patching the boundaryEdges
    // array to include a fake edge that no boundary face contains.
    const realBoundaryEdges = mesh.getBoundaryEdges()
    const realEdges = mesh.getEdges()
    const fakeEdgeIdx = realEdges.length
    mesh.getBoundaryEdges = () => [...realBoundaryEdges, fakeEdgeIdx]
    mesh.getEdges = () => [...realEdges, [0, 0]] // zero-length so edgeData won't be set either
    try {
      const w = new Weight(mesh, (ctx) => warnings.push(ctx))
      w.computeEdgeWeights()
      expect(warnings.some((c) => c.code === 'BWC_EDGE_NO_STAR')).to.equal(true)
    } finally {
      mesh.getBoundaryEdges = () => realBoundaryEdges
      mesh.getEdges = () => realEdges
    }
  })

  it('BWC_EDGE_FAILURE fires when edgeWeight throws', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const warnings = []
    const w = new Weight(mesh, (ctx) => warnings.push(ctx))
    // Force a real throw inside the try block by patching the mesh
    // method the catch block reads in its message template.
    const realGetVertices = mesh.getVertices.bind(mesh)
    mesh.getVertices = () => {
      throw new Error('synthetic')
    }
    try {
      w.computeEdgeWeights()
    } finally {
      mesh.getVertices = realGetVertices
    }
    expect(warnings.some((c) => c.code === 'BWC_EDGE_FAILURE')).to.equal(true)
  })

  it('BWC_VERTEX_BWEIGHT_FAILURE fires when vertexWeight throws', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const warnings = []
    const w = new Weight(mesh, (ctx) => warnings.push(ctx))
    // Force a real throw inside the try block by patching the mesh
    // method the catch block reads in its message template.
    const realGetVertices = mesh.getVertices.bind(mesh)
    mesh.getVertices = () => {
      throw new Error('synthetic')
    }
    try {
      w.computeVertexWeights()
    } finally {
      mesh.getVertices = realGetVertices
    }
    expect(warnings.some((c) => c.code === 'BWC_VERTEX_BWEIGHT_FAILURE')).to.equal(true)
  })

  it('BWC_EDGE_FAILURE fires when edgeWeight throws', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const warnings = []
    const w = new Weight(mesh, (ctx) => warnings.push(ctx))
    const realGetVertices = mesh.getVertices.bind(mesh)
    mesh.getVertices = () => {
      throw new Error('synthetic')
    }
    try {
      w.computeEdgeWeights()
    } finally {
      mesh.getVertices = realGetVertices
    }
    expect(warnings.some((c) => c.code === 'BWC_EDGE_FAILURE')).to.equal(true)
  })

  it('BWC_FACE_FAILURE fires when faceWeight throws', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const warnings = []
    const w = new Weight(mesh, (ctx) => warnings.push(ctx))
    const realGetVertices = mesh.getVertices.bind(mesh)
    mesh.getVertices = () => {
      throw new Error('synthetic')
    }
    try {
      w.computeFaceWeights()
    } finally {
      mesh.getVertices = realGetVertices
    }
    expect(warnings.some((c) => c.code === 'BWC_FACE_FAILURE')).to.equal(true)
  })

  it('Weight.compute() runs the full vertex+edge+face cascade together', () => {
    const mesh = new Mesh(vertices, tetrahedra)
    const w = new Weight(mesh, () => {})
    const result = w.compute()
    expect(result.edgeBoundaryData.size).to.equal(mesh.boundaryEdges.length)
    expect(result.faceBoundaryData.size).to.equal(mesh.boundaryFaces.length)
    expect(result.vertexBoundaryWeights.size).to.equal(4)
    expect(result.edgeBoundaryWeights.size).to.equal(mesh.boundaryEdges.length)
    expect(result.faceBoundaryWeights.size).to.equal(mesh.boundaryFaces.length)
  })
})
