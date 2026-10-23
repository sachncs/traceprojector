import {expect} from 'chai';
import {Mesh} from '../traceprojector/mesh.js';
import {Whitney} from '../traceprojector/whitney.js';
import {Projector} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

describe('the library does not modify the arrays it is given', () => {
  const cube = generateUnitCubeMesh(2);
  const fresh = () => ({
    vertices: cube.getVertices().map((v) => [...v]),
    tetrahedra: cube.getTetrahedra().map((t) => [...t]),
  });

  it('computeBoundaryWeights leaves the caller\'s vertices and tetrahedra unchanged', () => {
    const {vertices, tetrahedra} = fresh();
    const before = JSON.stringify({vertices, tetrahedra});
    const mesh = new Mesh(vertices, tetrahedra);
    const projector = new Projector(mesh, new Whitney(mesh), {
      onWarning: () => {},
    });
    projector.computeBoundaryWeights();
    expect(JSON.stringify({vertices, tetrahedra})).to.equal(before);
  });

  it('a mesh built twice from the same arrays is the same mesh', () => {
    const {vertices, tetrahedra} = fresh();
    const first = new Mesh(vertices, tetrahedra);
    new Projector(first, new Whitney(first), {
      onWarning: () => {},
    }).computeBoundaryWeights();
    const second = new Mesh(vertices, tetrahedra);
    expect(second.getVertices().length).to.equal(cube.getVertices().length);
  });

  it('changing the arrays after construction does not change the mesh', () => {
    const {vertices, tetrahedra} = fresh();
    const mesh = new Mesh(vertices, tetrahedra);
    const volume = mesh.getVolume(0);
    vertices[tetrahedra[0][1]][0] += 0.01;
    expect(mesh.getVolume(0)).to.equal(volume);
    expect(mesh.getVertices()[tetrahedra[0][1]][0]).to.not.equal(
        vertices[tetrahedra[0][1]][0],
    );
  });
});
