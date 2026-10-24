/**
 * The geometry and the surface operators of the boundary toolkit, checked
 * against closed-form values: the pieces tile a face, the bump mu is one at
 * the face centre and zero on the face boundary, and the surface divergence of
 * a field is its divergence minus the normal derivative of the normal part.
 */
import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {AgSpace} from '../traceprojector/ag-space.js';
import {
  BoundaryTraces,
  sdiv,
} from '../traceprojector/boundary-traces.js';
import {Polynomial} from '../traceprojector/polynomial-forms.js';

const cube = generateUnitCubeMesh(1);
const space = new AgSpace(cube.getVertices(), cube.getTetrahedra(),
    {degree: 1});
const traces = new BoundaryTraces(space);

describe('BoundaryTraces', () => {
  it('has the quadrature order 2r + 4 by default', () => {
    expect(traces.order).to.equal(2 * space.r + 4);
  });

  it('tiles each boundary face with its three pieces', () => {
    for (const face of traces.faces.values()) {
      const total = face.pieces.reduce((s, piece) => s + piece.area, 0);
      expect(total).to.be.closeTo(face.area, 1e-14);
      const [a, b, c] = face.points;
      const cross = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ];
      expect(face.area).to.be.closeTo(Math.hypot(...cross) / 2, 1e-14);
    }
  });

  it('has a bump that is 1 at the centre and 0 on the face boundary', () => {
    for (const face of traces.faces.values()) {
      face.pieces.forEach((piece) => {
        const [centre, p1, p2] = piece.corners;
        expect(piece.mu.evaluate(centre)).to.be.closeTo(1, 1e-13);
        expect(piece.mu.evaluate(p1)).to.be.closeTo(0, 1e-13);
        expect(piece.mu.evaluate(p2)).to.be.closeTo(0, 1e-13);
      });
    }
  });

  it('orients the normal of every boundary face outward', () => {
    for (const face of traces.faces.values()) {
      const away = face.centre.map((q) => q - 0.5);
      const along = away.reduce((s, q, i) => s + q * face.normal[i], 0);
      expect(along).to.be.above(0);
    }
  });
});

describe('sdiv', () => {
  it('removes the normal derivative of the normal part', () => {
    // F = (x0, 0, 0) on a plane with normal (1, 1, 1) / sqrt(3):
    // div_s F = (1 - n0 n0) dF0/dx0 = 2/3.
    const n = [1, 1, 1].map((q) => q / Math.sqrt(3));
    const x0 = Polynomial.monomial([1, 0, 0]);
    const out = sdiv([x0, Polynomial.zero(), Polynomial.zero()], n);
    expect(out.evaluate([0.3, 0.2, 0.1])).to.be.closeTo(2 / 3, 1e-14);
  });
});
