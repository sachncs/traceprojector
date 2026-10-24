/**
 * Assumption 2.4 of Arnold and Guzman (ESAIM M2AN 55, 2021): the constant of
 * the right inverse of the exterior derivative on the extended star of an
 * entity, for fields with vanishing trace on the star's boundary, is bounded
 * uniformly. The paper cannot prove it for stars that are not star-shaped with
 * respect to a ball, so it assumes it.
 *
 * Here it is measured, in the discrete spaces the projector uses: for each
 * sampled entity sigma and each degree k, the constant is
 *   C = sup |rho| / (diam(es(sigma)) |d rho|)  over rho with zero trace,
 * computed exactly from the smallest nonzero eigenvalue of the generalized
 * problem B^T M_to B x = mu M_from x (HighOrderWeights.extensionConstant).
 * Pre-registered rule: validation/tolerances.json, "extensionConstant".
 *
 * Measured is not proved: this checks finitely many stars of finitely many
 * meshes. It would catch a mesh family whose stars degenerate (a growing
 * constant), and it does not prove that none exists.
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

/** The unit cube with interior vertices jittered by `amplitude` h and
 * stretched by `stretch` along x. */
function mesh(n, amplitude, stretch) {
  const cube = generateUnitCubeMesh(n);
  const random = seeded(5);
  const vertices = cube.getVertices().map((v) => {
    const interior = v.every((q) => q > 1e-9 && q < 1 - 1e-9);
    return v.map((q, i) => {
      const moved = interior ? q + amplitude * (1 / n) * (2 * random() - 1) : q;
      return i === 0 ? moved * stretch : moved;
    });
  });
  return {vertices, tetrahedra: cube.getTetrahedra()};
}

/** Largest constant over a sample of entities of every degree, per k. */
function worst({vertices, tetrahedra}, degree, perDegree = 12) {
  const weights = new HighOrderWeights(vertices, tetrahedra, {degree});
  const counts = [
    vertices.length,
    weights.base.edges.length,
    weights.base.faces.length,
    weights.base.cells.length,
  ];
  const out = [0, 0, 0];
  for (const l of [0, 1, 2, 3]) {
    const step = Math.max(1, Math.floor(counts[l] / perDegree));
    for (let sigma = 0; sigma < counts[l]; sigma += step) {
      for (const k of [0, 1, 2]) {
        const {constant} = weights.extensionConstant(l, sigma, k);
        expect(Number.isFinite(constant), `l=${l} sigma=${sigma} k=${k}`)
            .to.equal(true);
        out[k] = Math.max(out[k], constant);
      }
    }
  }
  return out;
}

describe('Assumption 2.4: right inverse of d on extended stars', function() {
  this.timeout(1800000);
  const {maxConstant, maxGrowthPerHalvingOfH} = tolerances.extensionConstant;

  // [name, n, jitter, stretch, degree, entities per degree]
  const cases = [
    ['regular mesh', 6, 0, 1, 0, 12],
    ['jitter 0.2 h', 6, 0.2, 1, 0, 12],
    ['jitter 0.3 h', 6, 0.3, 1, 0, 12],
    ['stretch 10', 6, 0, 10, 0, 12],
    ['stretch 100', 6, 0, 100, 0, 12],
    ['p = 1, jitter 0.2 h', 4, 0.2, 1, 1, 2],
  ];
  for (const [name, n, amplitude, stretch, degree, sample] of cases) {
    it(`is bounded: ${name}`, () => {
      const constants = worst(mesh(n, amplitude, stretch), degree, sample);
      console.log(`      ${name}: C_0, C_1, C_2 = ${
        constants.map((c) => c.toFixed(3)).join(', ')}`);
      constants.forEach((c) => expect(c).to.be.below(maxConstant));
    });
  }

  it('does not grow under refinement of a jittered mesh', () => {
    const coarse = worst(mesh(4, 0.25, 1), 0);
    const fine = worst(mesh(8, 0.25, 1), 0);
    console.log(`      n=4: ${coarse.map((c) => c.toFixed(3))}; n=8: ${
      fine.map((c) => c.toFixed(3))}`);
    fine.forEach((c, k) => {
      expect(c).to.be.below(maxGrowthPerHalvingOfH * coarse[k] + 1e-12);
    });
  });
});
