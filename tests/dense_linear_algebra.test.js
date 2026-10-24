import {expect} from 'chai';
import {
  solveSemidefinite,
  cholesky,
  choleskySolveInPlace,
  minimumNormSolve,
} from '../traceprojector/dense-linear-algebra.js';
import {SingularError} from '../traceprojector/errors.js';

describe('dense linear algebra', () => {
  it('solveSemidefinite solves a positive definite system', () => {
    const a = Float64Array.from([4, 1, 1, 3]);
    const {x, rank, residual} = solveSemidefinite(
        a,
        2,
        Float64Array.from([1, 2]),
    );
    expect(rank).to.equal(2);
    expect(x[0]).to.be.closeTo(1 / 11, 1e-14);
    expect(x[1]).to.be.closeTo(7 / 11, 1e-14);
    expect(residual).to.be.below(1e-14);
  });

  it('solveSemidefinite handles a consistent singular system (path Laplacian)', () => {
    const a = Float64Array.from([1, -1, 0, -1, 2, -1, 0, -1, 1]);
    const {x, rank, residual} = solveSemidefinite(
        a,
        3,
        Float64Array.from([1, 0, -1]),
    );
    expect(rank).to.equal(2);
    expect(residual).to.be.below(1e-13);
    expect(x[0] - x[1]).to.be.closeTo(1, 1e-13);
  });

  it('solveSemidefinite reports a large residual for an inconsistent right-hand side', () => {
    const a = Float64Array.from([1, -1, -1, 1]);
    const {residual} = solveSemidefinite(a, 2, Float64Array.from([1, 1]));
    expect(residual).to.be.above(0.5);
  });

  it('cholesky rejects an indefinite matrix with SingularError', () => {
    expect(() => cholesky(Float64Array.from([1, 2, 2, 1]), 2)).to.throw(
        SingularError,
    );
  });

  it('choleskySolveInPlace inverts a factored matrix', () => {
    const a = Float64Array.from([4, 1, 1, 3]);
    const b = Float64Array.from([1, 2]);
    choleskySolveInPlace(cholesky(a, 2), 2, b);
    expect(b[0]).to.be.closeTo(1 / 11, 1e-14);
  });

  it('minimumNormSolve returns the Euclidean minimum-norm solution', () => {
    const {x, residual} = minimumNormSolve(
        [Float64Array.from([1, 1])],
        Float64Array.from([1, 0, 0, 1]),
        2,
        Float64Array.from([2]),
    );
    expect(x[0]).to.be.closeTo(1, 1e-14);
    expect(x[1]).to.be.closeTo(1, 1e-14);
    expect(residual).to.be.below(1e-14);
  });

  it('minimumNormSolve honours the metric', () => {
    const {x} = minimumNormSolve(
        [Float64Array.from([1, 1])],
        Float64Array.from([1, 0, 0, 4]),
        2,
        Float64Array.from([2]),
    );
    expect(x[0]).to.be.closeTo(1.6, 1e-13);
    expect(x[1]).to.be.closeTo(0.4, 1e-13);
  });

  it('minimumNormSolve tolerates redundant constraints', () => {
    const rows = [Float64Array.from([1, 1]), Float64Array.from([2, 2])];
    const {x, residual} = minimumNormSolve(
        rows,
        Float64Array.from([1, 0, 0, 1]),
        2,
        Float64Array.from([2, 4]),
    );
    expect(x[0]).to.be.closeTo(1, 1e-13);
    expect(residual).to.be.below(1e-12);
  });

  it('solveSemidefinite detects the null space of a larger singular system (grid Laplacian)', () => {
    // 5 x 5 grid graph Laplacian: singular, kernel = constants.
    const side = 5;
    const n = side * side;
    const a = new Float64Array(n * n);
    const index = (i, j) => i * side + j;
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
        ]) {
          if (i + di >= side || j + dj >= side) continue;
          const p = index(i, j);
          const q = index(i + di, j + dj);
          a[p * n + p] += 1;
          a[q * n + q] += 1;
          a[p * n + q] -= 1;
          a[q * n + p] -= 1;
        }
      }
    }
    const b = new Float64Array(n);
    b[0] = 1;
    b[n - 1] = -1;
    const {rank, residual} = solveSemidefinite(a, n, b);
    expect(rank).to.equal(n - 1);
    expect(residual).to.be.below(1e-12);
  });
});
