import {expect} from 'chai';
import {
  BandedCholesky,
  minimumNormSolveBanded,
  reverseCuthillMcKee,
} from '../traceprojector/banded-linear-algebra.js';
import {SparseMatrix} from '../traceprojector/sparse-linear-algebra.js';
import {minimumNormSolve} from '../traceprojector/dense-linear-algebra.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shifted five-point Laplacian on a k x k grid, as row maps. */
function grid(k, shift = 0.1) {
  const rows = [];
  for (let i = 0; i < k * k; i++) {
    const row = new Map([[i, 4 + shift]]);
    const x = i % k;
    const y = Math.floor(i / k);
    if (x > 0) row.set(i - 1, -1);
    if (x < k - 1) row.set(i + 1, -1);
    if (y > 0) row.set(i - k, -1);
    if (y < k - 1) row.set(i + k, -1);
    rows.push(row);
  }
  return rows;
}

describe('banded linear algebra', () => {
  it('reverseCuthillMcKee returns a permutation', () => {
    const rows = grid(7);
    const order = reverseCuthillMcKee(rows.map(
        (row, i) => new Set([...row.keys()].filter((j) => j !== i))));
    expect([...order].sort((a, b) => a - b)).to.deep.equal(
        Array.from({length: 49}, (_, i) => i));
  });

  it('orders a graph with several components and isolated nodes', () => {
    const neighbours = [new Set([1]), new Set([0]), new Set(), new Set()];
    expect([...reverseCuthillMcKee(neighbours)].sort()).to.deep.equal(
        [0, 1, 2, 3]);
  });

  it('BandedCholesky solves a grid system to roundoff', () => {
    const rows = grid(20);
    const n = rows.length;
    const b = Float64Array.from({length: n}, (_, i) => Math.sin(i));
    const x = new BandedCholesky(rows).solve(b);
    let worst = 0;
    rows.forEach((row, i) => {
      let sum = 0;
      for (const [j, v] of row) sum += v * x[j];
      worst = Math.max(worst, Math.abs(sum - b[i]));
    });
    expect(worst).to.be.below(1e-12);
  });

  it('BandedCholesky rejects an indefinite matrix', () => {
    const rows = [new Map([[0, 1], [1, 2]]), new Map([[0, 2], [1, 1]])];
    expect(() => new BandedCholesky(rows)).to.throw('positive definite');
  });

  for (const [k, m, seed, redundant] of [
    [6, 10, 1, false],
    [8, 30, 2, false],
    [7, 20, 3, true],
  ]) {
    it(`minimumNormSolveBanded matches the dense solver (grid ${k}, m=${m}${redundant ? ', redundant row' : ''})`, () => {
      const random = seeded(seed);
      const n = k * k;
      const massRows = grid(k);
      const rowEntries = [];
      for (let i = 0; i < m; i++) {
        const entries = new Map();
        if (redundant && i === m - 1) {
          for (const [j, v] of rowEntries[0]) entries.set(j, 2 * v);
        } else {
          for (let c = 0; c < 4; c++) {
            entries.set(Math.floor(random() * n),
                Math.round(4 * random() - 2) || 1);
          }
        }
        rowEntries.push(entries);
      }
      const constraints = new SparseMatrix(m, n, rowEntries);
      const mass = new SparseMatrix(n, n, massRows);
      const x0 = Float64Array.from({length: n}, () => random() - 0.5);
      const r = constraints.multiply(x0);
      const denseRows = rowEntries.map((entries) => {
        const row = new Float64Array(n);
        for (const [j, v] of entries) row[j] += v;
        return row;
      });
      const denseMass = new Float64Array(n * n);
      massRows.forEach((row, i) => {
        for (const [j, v] of row) denseMass[i * n + j] = v;
      });
      const banded = minimumNormSolveBanded(constraints, mass, r);
      const dense = minimumNormSolve(denseRows, denseMass, n, r);
      let worst = 0;
      for (let i = 0; i < n; i++) {
        worst = Math.max(worst, Math.abs(banded.x[i] - dense.x[i]));
      }
      expect(worst).to.be.below(1e-9);
      expect(banded.residual).to.be.below(1e-10 * (1 + banded.scale));
    });
  }

  it('minimumNormSolveBanded of a zero right-hand side is zero', () => {
    const constraints = new SparseMatrix(1, 2, [new Map([[0, 1]])]);
    const mass = new SparseMatrix(2, 2, [new Map([[0, 1]]), new Map([[1, 1]])]);
    const out = minimumNormSolveBanded(constraints, mass, new Float64Array(1));
    expect([...out.x]).to.deep.equal([0, 0]);
  });
});
