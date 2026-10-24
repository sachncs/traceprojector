import {expect} from 'chai';
import {Mesh} from '../traceprojector/mesh.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {refineTetrahedra} from '../traceprojector/bisection.js';
import {relativeVolume} from '../traceprojector/utils.js';
import {ValidateError} from '../traceprojector/errors.js';

const cube = generateUnitCubeMesh(2);
const vertices = cube.getVertices();
const tets = cube.getTetrahedra();

const volume = (vs, cells) => cells.reduce((sum, t) => {
  const [a, b, c, d] = t.map((i) => vs[i]);
  const u = b.map((q, i) => q - a[i]);
  const v = c.map((q, i) => q - a[i]);
  const w = d.map((q, i) => q - a[i]);
  return sum + Math.abs(u[0] * (v[1] * w[2] - v[2] * w[1]) -
    u[1] * (v[0] * w[2] - v[2] * w[0]) +
    u[2] * (v[0] * w[1] - v[1] * w[0])) / 6;
}, 0);

describe('longest-edge bisection', () => {
  it('refines one tetrahedron into a conforming mesh', () => {
    const out = refineTetrahedra(vertices, tets, [5]);
    expect(out.tetrahedra.length).to.be.above(tets.length);
    expect(() => new Mesh(out.vertices, out.tetrahedra)).to.not.throw();
  });

  it('preserves the volume and the orientation of every cell', () => {
    const out = refineTetrahedra(vertices, tets, [0, 7, 20]);
    expect(volume(out.vertices, out.tetrahedra))
        .to.be.closeTo(volume(vertices, tets), 1e-12);
    for (const t of out.tetrahedra) {
      expect(relativeVolume(t.map((i) => out.vertices[i]))).to.be.above(0);
    }
  });

  it('bisects every marked tetrahedron and records the parents', () => {
    const marked = [3, 11];
    const out = refineTetrahedra(vertices, tets, marked);
    expect(out.parent.length).to.equal(out.tetrahedra.length);
    for (const m of marked) {
      expect(out.parent.filter((p) => p === m).length).to.be.at.least(2);
    }
  });

  it('keeps the original vertices and adds only midpoints', () => {
    const out = refineTetrahedra(vertices, tets, [1]);
    expect(out.vertices.slice(0, vertices.length)).to.deep.equal(vertices);
    expect(out.vertices.length).to.be.above(vertices.length);
  });

  it('stays conforming and keeps its shape over repeated refinement', () => {
    let state = {vertices, tetrahedra: tets};
    for (let round = 0; round < 3; round++) {
      // Mark every cell touching the corner of the cube.
      const marked = state.tetrahedra.map((t, i) => [t, i])
          .filter(([t]) => t.some(
              (v) => Math.hypot(...state.vertices[v]) < 0.3))
          .map(([, i]) => i);
      state = refineTetrahedra(state.vertices, state.tetrahedra, marked);
      expect(() => new Mesh(state.vertices, state.tetrahedra)).to.not.throw();
    }
    const worst = Math.min(...state.tetrahedra.map((t) =>
      relativeVolume(t.map((i) => state.vertices[i]))));
    expect(worst).to.be.above(1e-4);
  });

  it('rejects a marked index that is not a cell', () => {
    expect(() => refineTetrahedra(vertices, tets, [tets.length]))
        .to.throw(ValidateError);
  });
});
