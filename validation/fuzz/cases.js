/**
 * Seeded generators of mesh inputs for the fuzzer. Each case says what the
 * library must do: reject the input with a typed error (`error`), or accept it
 * and project an affine field exactly (`ok`).
 */
import { generateUnitCubeMesh } from '../../traceprojector/generator.js'
import { seededRandom } from '../support/random.js'

function cube (n) {
  const mesh = generateUnitCubeMesh(n)
  return {
    vertices: mesh.getVertices().map((v) => [...v]),
    tetrahedra: mesh.getTetrahedra().map((t) => [...t])
  }
}

const pick = (random, list) => list[Math.floor(random() * list.length)]

/** A valid mesh: a unit cube mesh, perturbed, scaled, shifted and rotated. */
function valid (random) {
  const { vertices, tetrahedra } = cube(pick(random, [1, 2, 2, 3]))
  const scale = 10 ** (Math.floor(random() * 9) - 4)
  const offset = pick(random, [0, 0, 1, 1e3, 1e6]) * scale
  const angle = random() * Math.PI
  const jitter = 0.15 * random()
  const moved = vertices.map(([x, y, z]) => {
    const interior = [x, y, z].every((q) => q > 0 && q < 1)
    const [px, py, pz] = interior ? [x + jitter * (random() - 0.5) / 3, y, z] : [x, y, z]
    return [(px * Math.cos(angle) - py * Math.sin(angle)) * scale + offset,
      (px * Math.sin(angle) + py * Math.cos(angle)) * scale + offset, pz * scale + offset]
  })
  return { category: 'valid', expect: 'ok', vertices: moved, tetrahedra }
}

const BAD_NUMBERS = [NaN, Infinity, -Infinity, '1', null, undefined, {}, [], true]

const generators = {
  validMesh: valid,
  validMesh2: valid,
  validMesh3: valid,

  nonFiniteCoordinate (random) {
    const { vertices, tetrahedra } = cube(2)
    vertices[Math.floor(random() * vertices.length)][Math.floor(random() * 3)] = pick(random, BAD_NUMBERS)
    return { category: 'non-finite coordinate', expect: 'error', vertices, tetrahedra }
  },

  emptyInput (random) {
    const which = Math.floor(random() * 3)
    const base = cube(1)
    return {
      category: 'empty input',
      expect: 'error',
      vertices: which === 1 ? base.vertices : [],
      tetrahedra: which === 0 ? base.tetrahedra : []
    }
  },

  wrongShape (random) {
    const { vertices, tetrahedra } = cube(1)
    const which = Math.floor(random() * 5)
    if (which === 0) vertices[0] = [0, 0]
    if (which === 1) vertices[1] = [0, 0, 0, 0]
    if (which === 2) tetrahedra[0] = tetrahedra[0].slice(0, 3)
    if (which === 3) tetrahedra[0] = [...tetrahedra[0], 5]
    if (which === 4) vertices[2] = 'a vertex'
    return { category: 'wrong shape', expect: 'error', vertices, tetrahedra }
  },

  notArrays (random) {
    return {
      category: 'not arrays',
      expect: 'error',
      vertices: pick(random, [null, undefined, 5, 'x', {}, true]),
      tetrahedra: pick(random, [null, undefined, 5, 'x', {}, [[0, 1, 2, 3]]])
    }
  },

  badIndex (random) {
    const { vertices, tetrahedra } = cube(1)
    const t = Math.floor(random() * tetrahedra.length)
    tetrahedra[t][Math.floor(random() * 4)] = pick(random, [-1, vertices.length, vertices.length + 7, 1.5, NaN, '0', null, 1e20])
    return { category: 'bad index', expect: 'error', vertices, tetrahedra }
  },

  duplicateVertexInTet (random) {
    const { vertices, tetrahedra } = cube(1)
    const t = Math.floor(random() * tetrahedra.length)
    tetrahedra[t][3] = tetrahedra[t][Math.floor(random() * 3)]
    return { category: 'duplicate index in a tetrahedron', expect: 'error', vertices, tetrahedra }
  },

  coincidentVertices (random) {
    const { vertices, tetrahedra } = cube(1)
    const a = Math.floor(random() * vertices.length)
    let b = Math.floor(random() * vertices.length)
    if (a === b) b = (b + 1) % vertices.length
    vertices[b] = [...vertices[a]]
    return { category: 'coincident vertices', expect: 'error', vertices, tetrahedra }
  },

  flatTetrahedron (random) {
    const s = 10 ** (Math.floor(random() * 11) - 5)
    const flatness = pick(random, [0, 0, 1e-13, 1e-16])
    return {
      category: 'flat tetrahedron',
      expect: 'error',
      vertices: [[0, 0, 0], [s, 0, 0], [0, s, 0], [s, s, flatness * s]],
      tetrahedra: [[0, 1, 2, 3]]
    }
  },

  invertedTetrahedron (random) {
    const { vertices, tetrahedra } = cube(2)
    const t = Math.floor(random() * tetrahedra.length)
    const c = tetrahedra[t]
    ;[c[0], c[1]] = [c[1], c[0]]
    return { category: 'inverted tetrahedron', expect: 'error', vertices, tetrahedra }
  },

  hangingNode () {
    // Two tetrahedra share the face (a, b, c). The upper one is split around a
    // point on that face, so the lower one's face is cut by a vertex it lacks.
    const vertices = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [1 / 3, 1 / 3, 0]]
    const tetrahedra = [[0, 1, 4, 2], [5, 0, 1, 3], [5, 1, 2, 3], [5, 2, 0, 3]]
    return { category: 'hanging node', expect: 'error', vertices, tetrahedra }
  },

  nonManifoldFace () {
    // Three tetrahedra share the face (0, 1, 2).
    const vertices = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.3, 0.3, 1]]
    return {
      category: 'face shared by three tetrahedra',
      expect: 'error',
      vertices,
      tetrahedra: [[0, 1, 2, 3], [0, 1, 4, 2], [0, 1, 2, 5]]
    }
  },

  hugeOrTiny (random) {
    const { vertices, tetrahedra } = cube(1)
    const factor = pick(random, [1e150, 1e200, 1e300, 1e-150, 1e-200, 1e-300])
    return {
      category: 'extreme coordinates',
      expect: 'either',
      vertices: vertices.map((v) => v.map((q) => q * factor)),
      tetrahedra
    }
  },

  disconnected () {
    const { vertices, tetrahedra } = cube(1)
    const shift = vertices.length
    return {
      category: 'two disconnected meshes',
      expect: 'ok',
      vertices: vertices.concat(vertices.map(([x, y, z]) => [x + 5, y, z])),
      tetrahedra: tetrahedra.concat(tetrahedra.map((t) => t.map((i) => i + shift)))
    }
  }
}

/**
 * @param {number} count
 * @param {number} seed
 * @return {!Array<!Object>} Cases cycling through the generators.
 */
export function makeCases (count, seed = 1) {
  const random = seededRandom(seed)
  const names = Object.keys(generators)
  const cases = []
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length]
    cases.push({ id: i, generator: name, ...generators[name](random) })
  }
  return cases
}
