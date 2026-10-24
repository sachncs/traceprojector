import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {CoefficientPool} from '../traceprojector/parallel.js';
import {
  BoundedCommutingProjector,
} from '../traceprojector/bounded-commuting-projector.js';
import {ValidateError} from '../traceprojector/errors.js';

const scalar = new URL('./fixtures/scalar-field.mjs', import.meta.url);
const vector = new URL('./fixtures/vector-field.mjs', import.meta.url);

describe('CoefficientPool', function() {
  this.timeout(120000);
  const cube = generateUnitCubeMesh(2);
  const vertices = cube.getVertices();
  const tetrahedra = cube.getTetrahedra();
  const serial = new BoundedCommutingProjector(vertices, tetrahedra);
  const field = async (url) => (await import(url.href)).default;

  it('matches a serial run bit for bit, for any number of workers', async () => {
    const u = await field(scalar);
    const w = await field(vector);
    const base = serial.weights.base;
    const cases = [
      [0, scalar, u, base.vertices.length],
      [1, vector, w, base.edges.length],
      [2, vector, w, base.faces.length],
      [3, scalar, u, base.cells.length],
    ];
    for (const count of [1, 3]) {
      const pool = new CoefficientPool({vertices, tetrahedra, workers: count});
      try {
        for (const [l, url, f, size] of cases) {
          const entities = Array.from({length: size}, (_, i) => i)
              .filter((i) => i % 3 === 0);
          const got = await pool.coefficients(
              {field: fileURLToPath(url), l, entities});
          const want = entities.map((e) => serial.coefficient(f, l, e));
          expect(Array.from(got)).to.deep.equal(want);
        }
      } finally {
        await pool.close();
      }
    }
  });

  it('keeps its weights between fields', async () => {
    const pool = new CoefficientPool({vertices, tetrahedra, workers: 2});
    try {
      const entities = [0, 1, 2, 3];
      const first = await pool.coefficients(
          {field: fileURLToPath(scalar), l: 0, entities});
      const again = await pool.coefficients(
          {field: fileURLToPath(scalar), l: 0, entities});
      expect(Array.from(again)).to.deep.equal(Array.from(first));
    } finally {
      await pool.close();
    }
  });

  it('rejects bad arguments and reports a failing field', async () => {
    expect(() => new CoefficientPool({vertices, tetrahedra, workers: 0}))
        .to.throw(ValidateError);
    expect(() => new CoefficientPool({vertices, tetrahedra, operator: 'x'}))
        .to.throw(ValidateError);
    const pool = new CoefficientPool({vertices, tetrahedra, workers: 1});
    try {
      let error = null;
      try {
        await pool.coefficients({field: '/nonexistent/field.mjs', l: 0,
          entities: [0]});
      } catch (e) {
        error = e;
      }
      expect(error).to.not.equal(null);
    } finally {
      await pool.close();
    }
  });
});
