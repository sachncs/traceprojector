import {expect} from 'chai';
import {CanonicalProjector} from '../traceprojector/canonical-projector.js';
import {formSpace} from '../traceprojector/polynomial-forms.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {tetrahedronRule} from '../traceprojector/simplicial-complex.js';

const cube = generateUnitCubeMesh(2);
const vertices = cube.getVertices();
const cells = cube.getTetrahedra();

/** A fixed combination of the polynomial form space, as a field. */
function fieldOf(r, l) {
  const space = formSpace(r, l);
  const weights = space.map((_, i) => Math.sin(1.7 * i + 0.3));
  return (x) => {
    const values = space.map((form) => (Array.isArray(form) ?
      form.map((p) => p.evaluate(x)) : form.evaluate(x)));
    if (l === 0 || l === 3) {
      return values.reduce((s, v, i) => s + weights[i] * v, 0);
    }
    return [0, 1, 2].map((a) => values.reduce(
        (s, v, i) => s + weights[i] * v[a], 0));
  };
}

describe('canonical interpolation on P_r^- Lambda^k', function() {
  this.timeout(120000);

  for (const p of [0, 1, 2]) {
    const projector = new CanonicalProjector(vertices, cells, {degree: p});
    for (const l of [0, 1, 2, 3]) {
      it(`degree p = ${p}, l = ${l}: reproduces its own space`, () => {
        const u = fieldOf(p + 1, l);
        const coefficients = projector.coefficients(u, l);
        cells.forEach((cell, c) => {
          const {points} = projector.complex.geometry(c);
          const x = points[0].map((q, i) => 0.3 * q + 0.2 * points[1][i] +
            0.25 * points[2][i] + 0.25 * points[3][i]);
          const got = projector.evaluate(coefficients, x, c, l);
          const want = u(x);
          [].concat(got).forEach((q, i) =>
            expect(q).to.be.closeTo([].concat(want)[i], 1e-8));
        });
      });
    }
  }

  // A smooth non-polynomial form-degree-l field, with its exterior derivative.
  const smooth = {
    0: {
      u: (x) => Math.sin(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[0] * x[1],
      du: (x) => [
        Math.cos(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[1],
        0.5 * Math.cos(x[0] + 0.5 * x[1]) * Math.cos(x[2]) + x[0],
        -Math.sin(x[0] + 0.5 * x[1]) * Math.sin(x[2]),
      ],
    },
    1: {
      u: (x) => [Math.sin(x[1]) + x[2] * x[2], Math.cos(x[2]) * x[0],
        Math.exp(0.3 * x[0]) + x[1]],
      du: (x) => [
        1 + Math.sin(x[2]) * x[0],
        2 * x[2] - 0.3 * Math.exp(0.3 * x[0]),
        Math.cos(x[2]) - Math.cos(x[1]),
      ],
    },
    2: {
      u: (x) => [Math.sin(x[1]) * x[2], x[0] * x[0] + x[2], Math.cos(x[0])],
      du: () => 0,
    },
  };

  for (const p of [0, 1, 2]) {
    const projector = new CanonicalProjector(vertices, cells, {degree: p});
    for (const l of [0, 1, 2]) {
      it(`degree p = ${p}: d Pi^${l} u = Pi^${l + 1} du`, () => {
        const {u, du} = smooth[l];
        const left = projector.coefficients(u, l);
        const right = projector.coefficients(du, l + 1);
        cells.forEach((cell, c) => {
          const {points} = projector.complex.geometry(c);
          const x = points[0].map((q, i) => 0.4 * q + 0.2 * points[1][i] +
            0.2 * points[2][i] + 0.2 * points[3][i]);
          const want = projector.evaluate(right, x, c, l + 1);
          const got = projector.derivative(left, x, c, l);
          [].concat(got).forEach((q, i) =>
            expect(q).to.be.closeTo([].concat(want)[i], 1e-7));
        });
      });
    }
  }

  for (const p of [1, 2]) {
    const projector = new CanonicalProjector(vertices, cells, {degree: p});
    it(`degree p = ${p}: traces are continuous across interior faces`, () => {
      const complex = projector.complex;
      const fields = [0, 1, 2].map((l) => ({
        l, coefficients: projector.coefficients(smooth[l].u, l)}));
      complex.faces.forEach((face, f) => {
        const owners = complex.faceCells[f];
        if (owners.length !== 2) return;
        const [a, b, d] = face.map((v) => complex.vertices[v]);
        const point = a.map((q, i) => 0.2 * q + 0.3 * b[i] + 0.5 * d[i]);
        const normal = [
          (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
          (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
          (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
        ];
        const tangents = [b.map((q, i) => q - a[i]), d.map((q, i) => q - a[i])];
        const dot = (x, y) => x.reduce((acc, q, i) => acc + q * y[i], 0);
        for (const {l, coefficients} of fields) {
          const [left, right] = owners.map(
              (c) => projector.evaluate(coefficients, point, c, l));
          if (l === 0) {
            expect(left).to.be.closeTo(right, 1e-8);
          } else if (l === 1) {
            tangents.forEach((t) =>
              expect(dot(left, t)).to.be.closeTo(dot(right, t), 1e-8));
          } else {
            expect(dot(left, normal)).to.be.closeTo(dot(right, normal), 1e-8);
          }
        }
      });
    });
  }

  // L2 error of the interpolant on cube meshes of 1, 2, 4 cells per side.
  const smoothField = (l) => (l === 0 || l === 3 ? (l === 0 ? smooth[0].u :
    (x) => Math.sin(x[0] + x[1]) + x[2] * x[2]) : smooth[l].u);
  function error(n, p, l) {
    const mesh = generateUnitCubeMesh(n);
    const projector = new CanonicalProjector(
        mesh.getVertices(), mesh.getTetrahedra(), {degree: p});
    const u = smoothField(l);
    const coefficients = projector.coefficients(u, l);
    let sum = 0;
    projector.complex.cells.forEach((_, c) => {
      for (const {x, weight} of tetrahedronRule(
          projector.complex.geometry(c).points, 6)) {
        const got = [].concat(projector.evaluate(coefficients, x, c, l));
        const want = [].concat(u(x));
        sum += weight * got.reduce((s, q, i) => s + (q - want[i]) ** 2, 0);
      }
    });
    return Math.sqrt(sum);
  }
  for (const p of [0, 1]) {
    for (const l of [0, 1, 2, 3]) {
      const expected = l === 0 ? p + 2 : p + 1;
      it(`degree p = ${p}, l = ${l}: L2 error converges at order ${expected}`, () => {
        const e = [2, 4].map((n) => error(n, p, l));
        const rate = Math.log2(e[0] / e[1]);
        expect(rate).to.be.at.least(expected - 0.3);
      });
    }
  }
});
