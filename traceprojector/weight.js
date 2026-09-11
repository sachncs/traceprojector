/**
 * Boundary weight computation for Projector projections.
 *
 * Computes vertex patch weights, edge tangents/lengths, and face normals/areas
 * used by trace-preserving boundary DoFs.
 */

import { subtract, norm } from './utils.js'
import { vertexWeight, edgeWeight, faceWeight } from './bweight.js'
import { Mesh } from './mesh.js'
import { ProjectError } from './errors.js'

/**
 * Computes boundary patch weights used by the trace-preserving projection
 * operators.  For each boundary vertex it builds the Section 6.3 vertex
 * duality functional, and for each boundary edge/face it builds the edge/face
 * duality functionals, plus the edge tangent/length and face normal/area
 * geometry.
 *
 * Local failures (e.g. degenerate stars) emit warnings rather than throwing
 * so that a single bad element does not halt the entire mesh projection.
 */
export class Weight {
  /**
   * @param {!Mesh} mesh
   * @param {function=} onWarning - Callback invoked with a warning context
   *   object when a local weight computation fails or is ill-conditioned.
   * @param {!Object=} options
   * @param {boolean=} options.strict - When true, re-throw per-simplex
   *   failures instead of emitting a warning. Defaults to false (warn
   *   + skip), which preserves the historical "one bad element does
   *   not halt the whole mesh projection" trade-off.
   */
  constructor (mesh, onWarning = console.warn, options = {}) {
    this.mesh = mesh
    this.onWarning =
      typeof onWarning === 'function'
        ? onWarning
        : (ctx) => console.warn(ctx.message ?? ctx)
    this.strict = options.strict === true
  }

  /**
   * Computes all boundary weights, including the Section 6.3 vertex/edge/face
   * duality functionals.
   * @return {Object} Boundary weight and geometry data.
   * @property {!Map<number, {v0: number, v1: number, tangent: !Array<number>, length: number}>} edgeBoundaryData
   * @property {!Map<number, {normal: !Array<number>, area: number}>} faceBoundaryData
   * @property {!Map<number, {pair: function, integral: number, psi: !Array<number>, faces: !Array<!Array<number>>}>} vertexBoundaryWeights
   * @property {!Map<number, {ePair: !Array<number>, pair: function, edges: !Array<!Array<number>>, eta: !Array<number>}>} edgeBoundaryWeights
   * @property {!Map<number, {face: !Array<number>, pair: function, nBasis: number}>} faceBoundaryWeights
   */
  compute () {
    const edgeBoundaryData = this.computeEdgeData()
    const faceBoundaryData = this.computeFaceData()
    const vertexBoundaryWeights = this.computeVertexWeights()
    const edgeBoundaryWeights = this.computeEdgeWeights()
    const faceBoundaryWeights = this.computeFaceWeights()
    return {
      edgeBoundaryData,
      faceBoundaryData,
      vertexBoundaryWeights,
      edgeBoundaryWeights,
      faceBoundaryWeights
    }
  }

  /** @private */
  computeVertexWeights () {
    const zeta0 = new Map()
    const faces = this.mesh.getFaces()
    const boundaryFaces = this.mesh.getBoundaryFaces()
    for (const vIdx of this.mesh.getBoundaryNodes()) {
      try {
        const star = boundaryFaces.filter((f) => faces[f].includes(vIdx))
        if (star.length === 0) {
          const ctx = {
            code: 'BWC_VERTEX_NO_STAR',
            severity: 'warn',
            message: `Weight: vertex ${vIdx} has no boundary-face star; skipping.`
          }
          this.onWarning(ctx)
          if (this.strict) throw new ProjectError(ctx.message)
          continue
        }
        const sf = star.map((f) => faces[f])
        // Compact local vertex set: the boundary vertex weight (and its
        // pair evaluation at P1 nodes) assumes verts contains exactly the
        // vertices referenced by the star faces.  The mesh may have been
        // Alfeld/Worsey-Farin split (extra barycenter vertices appended), so
        // remap the star to a minimal local vertex list before assembling.
        const localIds = [...new Set(sf.flat())].sort((a, b) => a - b)
        const localMap = new Map(localIds.map((id, i) => [id, i]))
        const localVerts = localIds.map((id) => this.mesh.getVertices()[id])
        const localFaces = sf.map((f) => f.map((i) => localMap.get(i)))
        const localVIdx = localMap.get(vIdx)
        const vw = vertexWeight(localVerts, localFaces, localVIdx)
        zeta0.set(vIdx, { pair: vw.pair, integral: vw.integral, psi: vw.psi, faces: vw.faces })
      } catch (err) {
        if (this.strict && !(err instanceof ProjectError)) {
          throw new ProjectError(`Weight: vertex ${vIdx}: ${err.message}`)
        }
        if (err instanceof ProjectError) throw err
        this.onWarning({
          code: 'BWC_VERTEX_BWEIGHT_FAILURE',
          severity: 'warn',
          message: `Weight: failed to compute vertex weight for vertex ${vIdx}: ${err.message}`
        })
      }
    }
    return zeta0
  }

  /** @private */
  computeEdgeWeights () {
    const zeta1 = new Map()
    const faces = this.mesh.getFaces()
    const edges = this.mesh.getEdges()
    const edgeToBoundaryFaces = new Map()
    for (const fIdx of this.mesh.getBoundaryFaces()) {
      const f = faces[fIdx]
      const localEdges = [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]]
      for (const [a, b] of localEdges) {
        const eKey = Mesh.computeEdgeKey(a, b, this.mesh.getOriginalVertexCount())
        let list = edgeToBoundaryFaces.get(eKey)
        if (!list) {
          list = []
          edgeToBoundaryFaces.set(eKey, list)
        }
        list.push(fIdx)
      }
    }
    const vc = this.mesh.getOriginalVertexCount()
    for (const eIdx of this.mesh.getBoundaryEdges()) {
      const e = edges[eIdx]
      try {
        const eKey = Mesh.computeEdgeKey(e[0], e[1], vc)
        const star = edgeToBoundaryFaces.get(eKey) || []
        if (star.length === 0) {
          const ctx = {
            code: 'BWC_EDGE_NO_STAR',
            severity: 'warn',
            message: `Weight: edge ${eIdx} has no boundary-face star; skipping.`
          }
          this.onWarning(ctx)
          if (this.strict) throw new ProjectError(ctx.message)
          continue
        }
        const ew = edgeWeight(this.mesh.getVertices(), star.map((f) => faces[f]), e)
        zeta1.set(eIdx, {
          ePair: [e[0], e[1]],
          pair: ew.pair,
          edges: ew.edges,
          eta: ew.eta
        })
      } catch (err) {
        if (this.strict && !(err instanceof ProjectError)) {
          throw new ProjectError(`Weight: edge ${eIdx}: ${err.message}`)
        }
        if (err instanceof ProjectError) throw err
        this.onWarning({
          code: 'BWC_EDGE_FAILURE',
          severity: 'warn',
          message: `Weight: failed to compute edge weight for edge ${eIdx}: ${err.message}`
        })
      }
    }
    return zeta1
  }

  /** @private */
  computeFaceWeights () {
    const zeta2 = new Map()
    const faces = this.mesh.getFaces()
    const boundaryFaces = this.mesh.getBoundaryFaces()
    for (const fIdx of this.mesh.getBoundaryFaces()) {
      try {
        const face = faces[fIdx]
        // Extended star: boundary faces sharing at least one vertex with f.
        const extStar = boundaryFaces.filter((g) => face.some((v) => faces[g].includes(v)))
        if (extStar.length === 0) {
          const ctx = {
            code: 'BWC_FACE_NO_STAR',
            severity: 'warn',
            message: `Weight: face ${fIdx} has no extended star; skipping.`
          }
          this.onWarning(ctx)
          if (this.strict) throw new ProjectError(ctx.message)
          continue
        }
        const fw = faceWeight(this.mesh.getVertices(), extStar.map((g) => faces[g]), face)
        zeta2.set(fIdx, { face, pair: fw.pair, nBasis: fw.nBasis })
      } catch (err) {
        if (this.strict && !(err instanceof ProjectError)) {
          throw new ProjectError(`Weight: face ${fIdx}: ${err.message}`)
        }
        if (err instanceof ProjectError) throw err
        this.onWarning({
          code: 'BWC_FACE_FAILURE',
          severity: 'warn',
          message: `Weight: failed to compute face weight for face ${fIdx}: ${err.message}`
        })
      }
    }
    return zeta2
  }

  /** @private */
  computeEdgeData () {
    const zeta1Edge = new Map()
    for (const eIdx of this.mesh.boundaryEdges) {
      const e = this.mesh.edges[eIdx]
      const edgeVec = subtract(this.mesh.vertices[e[1]], this.mesh.vertices[e[0]])
      const edgeLen = norm(edgeVec)
      if (edgeLen < 1e-12) {
        continue
      }
      zeta1Edge.set(eIdx, {
        v0: e[0],
        v1: e[1],
        tangent: edgeVec.map((x) => x / edgeLen),
        length: edgeLen
      })
    }
    return zeta1Edge
  }

  /** @private */
  computeFaceData () {
    const zeta2Face = new Map()
    for (const fIdx of this.mesh.boundaryFaces) {
      const normal = this.mesh.getFaceOutwardNormal(fIdx)
      const area = this.mesh.getFaceArea(fIdx)
      zeta2Face.set(fIdx, { normal, area })
    }
    return zeta2Face
  }
}
