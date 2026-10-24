/**
 * count(l) and edge(index): the entity numbers coefficient() takes, and the
 * vertices of an edge, so a caller needs nothing from the projector's
 * internals to loop over every coefficient or relate an edge to its ends.
 */
import {expect} from 'chai';
import {
  BoundedCommutingProjector, Mesh, StableProjector, ValidateError,
  ZeroTraceProjector,
} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

const cube = generateUnitCubeMesh(3);
const vertices = cube.getVertices();
const tetrahedra = cube.getTetrahedra();
const mesh = new Mesh(vertices, tetrahedra);

for (const [name, make] of Object.entries({
  ZeroTraceProjector: () => new ZeroTraceProjector(vertices, tetrahedra),
  BoundedCommutingProjector: () =>
    new BoundedCommutingProjector(vertices, tetrahedra),
  StableProjector: () => new StableProjector(vertices, tetrahedra),
})) {
  describe(`${name} entity numbering`, () => {
    const projector = make();

    it('counts the vertices, edges, faces and cells of the mesh', () => {
      expect(projector.count(0)).to.equal(vertices.length);
      expect(projector.count(1)).to.equal(mesh.edges.length);
      expect(projector.count(2)).to.equal(mesh.faces.length);
      expect(projector.count(3)).to.equal(tetrahedra.length);
    });

    it('gives the two vertices of every edge, each once', () => {
      const seen = new Set();
      for (let e = 0; e < projector.count(1); e++) {
        const [a, b] = projector.edge(e);
        expect(a).to.not.equal(b);
        expect(a).to.be.within(0, vertices.length - 1);
        expect(b).to.be.within(0, vertices.length - 1);
        seen.add(Math.min(a, b) * vertices.length + Math.max(a, b));
      }
      expect(seen.size).to.equal(mesh.edges.length);
    });

    it('rejects a form degree or an edge that does not exist', () => {
      for (const l of [-1, 4, 1.5]) {
        expect(() => projector.count(l), `degree ${l}`)
            .to.throw(ValidateError);
      }
      for (const e of [-1, projector.count(1), 0.5]) {
        expect(() => projector.edge(e), `edge ${e}`).to.throw(ValidateError);
      }
    });
  });
}
