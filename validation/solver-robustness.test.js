/**
 * Numerical robustness of the local minimum-norm solves.
 *
 * Each weight needs the field of least energy x'Mx with C x = r. The solver
 * returns the solution together with a certificate: the constraint residual,
 * the stationarity of M x - C' lambda for the multipliers it found, and the
 * duality gap they give. A feasible point with zero stationarity is the
 * minimizer, so small values certify the answer without a reference solver.
 * Here the certificates of every solve of the real weight problems are held
 * to the pre-registered limits (validation/tolerances.json, "solver") on
 * regular, jittered and stretched meshes, and the answer is compared with the
 * dense solver as an independent check.
 *
 * This test exists because an earlier version of the check, "banded agrees
 * with dense", passed while the dense solver was the one in error.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {HighOrderWeights} from '../traceprojector/high-order-weights.js';
import {tolerances} from './support/tolerances.js';

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

function mesh(n, amplitude, stretch) {
  const cube = generateUnitCubeMesh(n);
  const random = seeded(7);
  const vertices = cube.getVertices().map((v) => {
    const interior = v.every((q) => q > 1e-9 && q < 1 - 1e-9);
    return v.map((q, i) => {
      const moved = interior ? q + amplitude * (1 / n) * (2 * random() - 1) : q;
      return i === 0 ? moved * stretch : moved;
    });
  });
  return {vertices, tetrahedra: cube.getTetrahedra()};
}

/** Computes a few interior weights of each degree. */
function compute(how, perDegree) {
  const base = how.base;
  const counts = [0, base.edges.length, base.faces.length, base.cells.length];
  for (const l of [1, 2, 3]) {
    const step = Math.max(1, Math.floor(counts[l] / (perDegree + 1)));
    let done = 0;
    for (let e = Math.floor(counts[l] / 3); e < counts[l] && done < perDegree;
      e += step) {
      if (how.topology.isBoundary(l, e)) continue;
      how.weight(l, e);
      done++;
    }
  }
}

describe('minimum-norm solves of the local weight problems', function() {
  this.timeout(3600000);
  const limits = tolerances.solver;
  const families = [
    ['regular', 5, 0, 1],
    ['jitter 0.25 h', 5, 0.25, 1],
    ['stretch 10', 5, 0, 10],
    ['stretch 100', 5, 0, 100],
  ];

  for (const [name, n, amplitude, stretch] of families) {
    it(`certificates are within the limits: ${name}`, () => {
      const {vertices, tetrahedra} = mesh(n, amplitude, stretch);
      const how = new HighOrderWeights(vertices, tetrahedra, {degree: 1});
      compute(how, 3);
      expect(how.stats.length).to.be.above(5);
      const worst = (key) => Math.max(...how.stats.map((s) => s[key]));
      console.log(`      ${name}: ${how.stats.length} solves, residual ${
        worst('residual').toExponential(1)}, stationarity ${
        worst('stationarity').toExponential(1)}, gap ${
        worst('dualityGap').toExponential(1)}, iterations up to ${
        worst('iterations')}`);
      expect(how.stats.filter((s) => s.method !== 'banded')).to.have.length(0);
      expect(worst('residual')).to.be.below(limits.maxResidual);
      expect(worst('stationarity')).to.be.below(limits.maxStationarity);
      expect(worst('dualityGap')).to.be.below(limits.maxDualityGap);
    });
  }

  for (const [name, n, amplitude, stretch] of families) {
    it(`agrees with the dense solver in energy: ${name}`, () => {
      const {vertices, tetrahedra} = mesh(n, amplitude, stretch);
      const how = new HighOrderWeights(
          vertices, tetrahedra, {degree: 1, crossCheck: true});
      compute(how, 1);
      expect(how.checks.length).to.be.above(2);
      const worst = Math.max(...how.checks.map((c) => c.relativeEnergy));
      const ratio = Math.max(...how.checks.map((c) => c.energyRatio));
      console.log(`      ${name}: ${how.checks.length} solves, relative ` +
        `energy difference ${worst.toExponential(1)}, banded/dense energy ` +
        `${ratio.toFixed(12)}`);
      expect(worst).to.be.below(limits.maxEnergyDisagreement);
      // Never more energy than the reference beyond rounding.
      expect(ratio).to.be.below(1 + limits.maxEnergyDisagreement);
    });
  }
});
