import { dot, sub } from '../../traceprojector/simplicial-complex.js'

/**
 * Brute-force point location in a complex, for building fields from Whitney
 * expansions in tests.
 * @param {!Object} complex - A SimplicialComplex.
 * @return {function(!Array<number>): number} Cell containing the point.
 */
export function cellLocator (complex) {
  const boxes = complex.cells.map((_, c) => {
    const { points } = complex.geometry(c)
    return [0, 1, 2].map((k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))])
  })
  return (x) => {
    for (let c = 0; c < boxes.length; c++) {
      const b = boxes[c]
      if (x[0] < b[0][0] - 1e-12 || x[0] > b[0][1] + 1e-12 || x[1] < b[1][0] - 1e-12 ||
          x[1] > b[1][1] + 1e-12 || x[2] < b[2][0] - 1e-12 || x[2] > b[2][1] + 1e-12) continue
      if (complex.barycentric(c, x).every((v) => v >= -1e-10)) return c
    }
    throw new Error(`point ${x} is outside the mesh`)
  }
}

/**
 * A field in the lowest-order Whitney space of degree l with the given
 * coefficients per entity.
 * @param {!Object} complex
 * @param {number} l
 * @param {function(number): number} coefficient - Entity number to coefficient.
 * @return {function(!Array<number>): (number|!Array<number>)}
 */
export function whitneyField (complex, l, coefficient) {
  const locate = cellLocator(complex)
  return (x) => {
    const c = locate(x)
    const entities = complex.cellEntities(c, l)
    const basis = complex.whitney(c, l, x)
    let total = l === 0 || l === 3 ? 0 : [0, 0, 0]
    entities.forEach((e, k) => {
      const a = coefficient(e)
      if (!a) return
      total = typeof total === 'number' ? total + a * basis[k]
        : [total[0] + a * basis[k][0], total[1] + a * basis[k][1], total[2] + a * basis[k][2]]
    })
    return total
  }
}

export { dot, sub }
