/**
 * Criterion A5: stability. For a bump u of width delta centred at a mesh
 * vertex,
 * the ratio ||Pi u|| / ||u|| in L2 is a lower bound for the stability constant.
 *
 * - The canonical projection is NOT stable: Pi0 u is the hat function of the
 *   vertex however narrow the bump, so the ratio grows like delta^(-3/2).
 * - The stable interior projection is: the ratio stays bounded, and
 * (pre-registered
 *   rule) the largest ratio grows by at most 1.10x per halving of h at fixed
 * shape
 *   regularity.
 */
import {expect} from 'chai';
import {
  Mesh,
  Whitney,
  Projector,
  StableProjector,
} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {tetrahedronRule} from '../traceprojector/simplicial-complex.js';
import {tolerances} from './support/tolerances.js';
import {fitSlope} from './support/statistics.js';

/** Smooth compactly supported bump of radius delta: (1 - r^2/delta^2)^2 for r <
 * delta. */
const bump = (center, delta) => (x) => {
  const s =
    Math.hypot(x[0] - center[0], x[1] - center[1], x[2] - center[2]) / delta;
  return s < 1 ? (1 - s * s) ** 2 : 0;
};
// ||bump||^2 = 4 pi delta^3 * integral_0^1 (1 - s^2)^4 s^2 ds
const bumpNormSquaredPerCube = (() => {
  let sum = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N;
    sum += ((1 - s * s) ** 4 * s * s) / N;
  }
  return 4 * Math.PI * sum;
})();
const bumpNorm = (delta) => Math.sqrt(bumpNormSquaredPerCube * delta ** 3);

/** Mesh vertex nearest the cube centre, and the cells within `rings` rings of
 * it. */
function centreOf(mesh, rings) {
  const vertices = mesh.getVertices();
  const centre = vertices.reduce(
      (best, v, i) =>
      Math.hypot(v[0] - 0.5, v[1] - 0.5, v[2] - 0.5) < best.d ?
        {i, d: Math.hypot(v[0] - 0.5, v[1] - 0.5, v[2] - 0.5)} :
        best,
      {i: -1, d: Infinity},
  );
  let touching = new Set([centre.i]);
  const cells = new Set();
  for (let ring = 0; ring < rings; ring++) {
    mesh.getTetrahedra().forEach((t, c) => {
      if (t.some((v) => touching.has(v))) cells.add(c);
    });
    touching = new Set([...cells].flatMap((c) => mesh.getTetrahedra()[c]));
  }
  return {vertex: centre.i, point: vertices[centre.i], cells: [...cells]};
}

/** L2 norm of the projection over the given cells (it vanishes elsewhere for a
 * compact bump). */
function projectedNorm(mesh, cells, evaluate) {
  let sum = 0;
  const vertices = mesh.getVertices();
  for (const c of cells) {
    for (const {x, weight} of tetrahedronRule(
        mesh.getTetrahedra()[c].map((i) => vertices[i]),
        4,
    )) {
      sum += weight * evaluate(x, c) ** 2;
    }
  }
  return Math.sqrt(sum);
}

describe('Stability of the projections on narrow bumps', function() {
  this.timeout(3600000);

  it('canonical Pi0 is unbounded: the ratio grows like delta^(-3/2)', () => {
    const base = generateUnitCubeMesh(6);
    const mesh = new Mesh(base.getVertices(), base.getTetrahedra());
    const projector = new Projector(mesh, new Whitney(mesh), {
      onWarning: () => {},
    });
    const h = 1 / 6;
    const {point, cells} = centreOf(mesh, 2);
    const ratio = (delta) =>
      projectedNorm(mesh, cells, (x, c) =>
        projector.projectH1(bump(point, delta), x, c),
      ) / bumpNorm(delta);
    const wide = ratio(h / 2);
    const narrow = ratio(h / 32);
    console.log(
        `      ratio at delta = h/2: ${wide.toFixed(2)}, at delta = h/32: ${narrow.toFixed(2)} (growth ${(narrow / wide).toFixed(0)}x; delta^-3/2 predicts ${(16 ** 1.5).toFixed(0)}x)`,
    );
    // delta shrinks 16x, so delta^(-3/2) predicts 64x; allow 20% for the
    // discrete geometry.
    expect(narrow / wide).to.be.within(0.8 * 16 ** 1.5, 1.2 * 16 ** 1.5);
  });

  it('the stable projection stays bounded and its constant does not grow as h shrinks', () => {
    const sizes = [4, 6, 8, 10];
    const logH = [];
    const logC = [];
    for (const n of sizes) {
      const base = generateUnitCubeMesh(n);
      const mesh = new Mesh(base.getVertices(), base.getTetrahedra());
      const stable = new StableProjector(
          mesh.getVertices(),
          mesh.getTetrahedra(),
          {quadratureOrder: 4},
      );
      const h = 1 / n;
      const {point, cells} = centreOf(mesh, 3);
      let worst = 0;
      for (const delta of [h, h / 2]) {
        const u = bump(point, delta);
        const ratio =
          projectedNorm(mesh, cells, (x, c) => stable.project(u, x, c, 0)) /
          bumpNorm(delta);
        worst = Math.max(worst, ratio);
      }
      console.log(`      n = ${n}: largest ratio ${worst.toFixed(3)}`);
      logH.push(Math.log(h));
      logC.push(Math.log(worst));
      expect(worst).to.be.below(50);
    }
    const fit = fitSlope(logH, logC);
    const growthPerHalving = 2 ** -fit.slope;
    console.log(
        `      constant ~ h^${fit.slope.toFixed(3)}: growth per halving of h = ${growthPerHalving.toFixed(3)}`,
    );
    expect(sizes.length).to.be.at.least(
        tolerances.stableOperator.stability.minRefinements,
    );
    expect(growthPerHalving).to.be.at.most(
        tolerances.stableOperator.stability.maxGrowthPerHalvingOfH,
    );
  });
});
