import {expect} from 'chai';
import {AgSpace} from '../traceprojector/ag-space.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

const cube = generateUnitCubeMesh(2);

describe('the Arnold-Guzman finite element space on a mesh', function() {
  this.timeout(300000);

  for (const p of [0, 1]) {
    const space = new AgSpace(cube.getVertices(), cube.getTetrahedra(),
        {degree: p});
    for (const l of [0, 1, 2, 3]) {
      it(`p = ${p}, l = ${l}: dofs of a function give back its coefficients`, () => {
        const size = space.size(l);
        const coefficients = Float64Array.from(
            {length: size}, (_, i) => Math.sin(1.3 * i + 0.4));
        const cells = space.complex.cells.length;
        // The function, cell by cell; its derivative from the reference matrix.
        const owner = (x) => {
          for (let c = 0; c < cells; c++) {
            const b = space.complex.barycentric(c, x);
            if (b.every((q) => q > -1e-12)) return c;
          }
          return -1;
        };
        const u = (x) => space.evaluate(coefficients, x, owner(x), l);
        const du = l < 3 ? (x) => space.derivative(
            coefficients, x, owner(x), l) : null;
        const back = space.coefficients(u, l, du);
        back.forEach((value, i) => {
          expect(value).to.be.closeTo(coefficients[i], 1e-8);
        });
      });
    }
  }

  for (const p of [1, 2]) {
    it(`p = ${p}: traces are continuous across interior faces`, () => {
      const space = new AgSpace(cube.getVertices(), cube.getTetrahedra(),
          {degree: p});
      const complex = space.complex;
      const dot = (x, y) => x.reduce((acc, q, i) => acc + q * y[i], 0);
      for (const l of [0, 1, 2]) {
        const c = Float64Array.from({length: space.size(l)},
            (_, i) => Math.cos(0.7 * i + 0.2));
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
          const [left, right] = owners.map(
              (cell) => space.evaluate(c, point, cell, l));
          if (l === 0) {
            expect(left).to.be.closeTo(right, 1e-8);
          } else if (l === 1) {
            tangents.forEach((t) =>
              expect(dot(left, t)).to.be.closeTo(dot(right, t), 1e-8));
          } else {
            expect(dot(left, normal)).to.be.closeTo(dot(right, normal), 1e-8);
          }
        });
      }
    });
  }
});
