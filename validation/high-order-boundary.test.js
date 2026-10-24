/**
 * The higher-order boundary operator of Ern, Guzman and Potu (Section 7), at
 * p = 1 on the 2 x 2 x 2 cube.
 *
 * The boundary weight of a bubble degree of freedom must be dual to the
 * bubble basis, both as a surface pairing and through its extension into the
 * bulk, so that the operator reproduces the discrete trace and commutes with
 * the exterior derivative on the boundary. Each property is checked against
 * the definitions, not against another implementation.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {HighOrderBoundary} from '../traceprojector/high-order-boundary.js';
import {differential} from '../traceprojector/polynomial-forms.js';
import {valueOf} from '../traceprojector/boundary-traces.js';

const cube = generateUnitCubeMesh(2);
const boundary = new HighOrderBoundary(
    cube.getVertices(), cube.getTetrahedra(), {degree: 1});
const {space, traces} = boundary;

/** The Whitney form of an entity as a field and its derivative. */
function whitneyField(l, entity) {
  const index = (c) => space.complex.cellEntities(c, l).indexOf(entity);
  const none = l === 0 ? 0 : [0, 0, 0];
  const noneD = l === 2 ? 0 : [0, 0, 0];
  return {
    u: (x, c) => (index(c) < 0 ? none :
      valueOf(traces.whitneyForms(c, l)[index(c)], x)),
    du: (x, c) => (index(c) < 0 ? noneD : valueOf(
        differential(traces.whitneyForms(c, l)[index(c)], l), x)),
  };
}

describe('weights of the bubble degrees of freedom (p = 1)', function() {
  this.timeout(600000);
  const cases = [
    [0, 'coclosed', 1], [0, 'coclosed', 40],
    [1, 'closed', 3], [1, 'closed', 50], [1, 'coclosed', 3],
    [2, 'closed', 3], [2, 'closed', 60],
  ];
  for (const [l, kind, which] of cases) {
    it(`l = ${l}, ${kind} bubble ${which}: dual to every basis function of its star`, () => {
      const catalog = boundary.catalog(l).list.filter((e) => e.kind === kind);
      const target = catalog[which];
      const weight = boundary.weight(l, target.dof);
      const star = new Set(weight.faces.map((f) => f.f));
      const tests = [];
      for (const face of weight.faces) {
        for (const a of boundary.lowestEntities(l, face)) {
          tests.push({type: 'W', entity: a});
        }
      }
      for (const b of boundary.catalog(l).list) {
        if (b.faces.some((f) => star.has(f.f))) {
          tests.push({type: 'B', dof: b.dof});
        }
      }
      const seen = new Set();
      for (const t of tests) {
        const key = t.type + (t.entity ?? t.dof);
        if (seen.has(key)) continue;
        seen.add(key);
        const traceOf = (face) => (t.type === 'W' ?
          traces.whitneyTrace(l, t.entity, face) :
          traces.basisTrace(l, t.dof, face));
        const field = t.type === 'W' ? whitneyField(l, t.entity) :
          boundary.basisField(l, t.dof);
        const expected = t.type === 'B' && t.dof === target.dof ? 1 : 0;
        // The surface pairing, and the volume formula with the extension.
        expect(boundary.pair(weight, traceOf), `${key} (surface)`)
            .to.be.closeTo(expected, 1e-9);
        expect(boundary.alpha(l, target.dof, field.u, field.du),
            `${key} (volume)`).to.be.closeTo(expected, 1e-9);
      }
    });
  }
});

describe('pairing of the lowest-order weights with the bubbles (p = 1)', function() {
  this.timeout(600000);
  for (const l of [0, 1, 2]) {
    it(`l = ${l}: the surface integral equals the volume formula`, () => {
      const list = boundary.lowestEntities0(l);
      let checked = 0;
      let worst = 0;
      for (const b of boundary.catalog(l).list.slice(0, 60)) {
        const star = new Set(b.faces.map((f) => f.f));
        const {u, du} = boundary.basisField(l, b.dof);
        for (const a of list) {
          if (![...star].some((f) => a.faces.has(f))) continue;
          const volume = a.alpha(u, du);
          const surface = boundary.lowestPairing(l, a, b.dof);
          worst = Math.max(worst, Math.abs(volume - surface));
          checked++;
        }
      }
      console.log(`      l = ${l}: ${checked} pairs, worst difference ${
        worst.toExponential(1)}`);
      expect(checked).to.be.above(20);
      expect(worst).to.be.below(1e-9);
    });
  }
});

describe('the boundary operator (p = 1)', function() {
  this.timeout(1800000);
  const trace = (l, v, n) => {
    if (l === 0) return [v];
    const along = v.reduce((s, q, i) => s + q * n[i], 0);
    return l === 1 ? v.map((q, i) => q - along * n[i]) : [along];
  };
  const faces = [...traces.faces.values()];

  for (const l of [0, 1, 2]) {
    it(`l = ${l}: preserves the trace of a finite element function`, () => {
      const c = Float64Array.from({length: space.size(l)},
          (_, i) => Math.sin(1.7 * i + 0.3));
      const u = (x, cell) => space.evaluate(c, x, cell, l);
      const du = (x, cell) => space.derivative(c, x, cell, l);
      const field = boundary.lazyField(u, du, l);
      let worst = 0;
      for (const face of faces) {
        for (const w of [[0.2, 0.3, 0.5], [0.6, 0.1, 0.3],
          [0.34, 0.33, 0.33]]) {
          const x = [0, 1, 2].map((d) => w[0] * face.points[0][d] +
            w[1] * face.points[1][d] + w[2] * face.points[2][d]);
          const want = trace(l, [].concat(u(x, face.cell)), face.normal);
          const got = trace(l, [].concat(field.value(x, face.cell)),
              face.normal);
          want.forEach((q, i) => (worst = Math.max(worst,
              Math.abs(q - got[i]))));
        }
      }
      console.log(`      l = ${l}: trace error ${worst.toExponential(1)}`);
      expect(worst).to.be.below(1e-9);
    });
  }

  for (const [l, name] of [[0, 'grad'], [1, 'curl']]) {
    it(`${name}: tr d Pi u = tr Pi du for a polynomial field`, () => {
      const u = l === 0 ?
        (x) => x[0] ** 3 + x[1] * x[2] ** 2 - 0.5 * x[0] * x[1] * x[2] + x[2] :
        (x) => [x[1] * x[2] + x[0] ** 2, x[0] * x[2] ** 2 - x[1],
          x[0] * x[1] + x[2] ** 3];
      const du = l === 0 ?
        (x) => [3 * x[0] ** 2 - 0.5 * x[1] * x[2],
          x[2] ** 2 - 0.5 * x[0] * x[2],
          2 * x[1] * x[2] - 0.5 * x[0] * x[1] + 1] :
        (x) => [x[0] - 2 * x[0] * x[2], 0, x[2] ** 2 - x[2]];
      const zero = l === 0 ? () => [0, 0, 0] : () => 0;
      const lower = boundary.lazyField((x) => u(x), (x) => du(x), l);
      const upper = boundary.lazyField((x) => du(x), zero, l + 1);
      let worst = 0;
      for (const face of faces) {
        for (const w of [[0.2, 0.3, 0.5], [0.6, 0.1, 0.3]]) {
          const x = [0, 1, 2].map((d) => w[0] * face.points[0][d] +
            w[1] * face.points[1][d] + w[2] * face.points[2][d]);
          const left = trace(l + 1, [].concat(lower.derivative(x, face.cell)),
              face.normal);
          const right = trace(l + 1, [].concat(upper.value(x, face.cell)),
              face.normal);
          left.forEach((q, i) => (worst = Math.max(worst,
              Math.abs(q - right[i]))));
        }
      }
      console.log(`      ${name}: ${worst.toExponential(1)}`);
      expect(worst).to.be.below(1e-9);
    });
  }
});
