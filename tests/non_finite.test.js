import {expect} from 'chai';
import {Whitney} from '../traceprojector/whitney.js';
import {Projector} from '../traceprojector/traceprojector.js';
import {ProjectError} from '../traceprojector/errors.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

describe('Projector rejects non-finite projection values', () => {
  const mesh = generateUnitCubeMesh(2);
  const projector = new Projector(mesh, new Whitney(mesh), {
    onWarning: () => {},
  });
  const center = [0.5, 0.5, 0.5];
  const vertexIndex = mesh
      .getVertices()
      .findIndex((v) => v.every((q, k) => q === center[k]));
  const tIdx = mesh.getTetrahedra().findIndex((t) => t.includes(vertexIndex));
  const point = [0.45, 0.5, 0.5];

  // |x - c|^(-0.4) is in H^1 of the cube but unbounded at the mesh vertex c.
  const singular = (x) =>
    Math.hypot(x[0] - 0.5, x[1] - 0.5, x[2] - 0.5) ** -0.4;

  it('project() throws ProjectError instead of returning Infinity', () => {
    expect(() => projector.project(singular, point, tIdx, 0)).to.throw(
        ProjectError,
        /non-finite/,
    );
  });

  it('projectH1() throws ProjectError instead of returning Infinity', () => {
    expect(() => projector.projectH1(singular, point, tIdx)).to.throw(
        ProjectError,
        /non-finite/,
    );
  });

  it('projectHcurl() throws ProjectError on a NaN field', () => {
    expect(() =>
      projector.projectHcurl(() => [NaN, 0, 0], point, tIdx),
    ).to.throw(ProjectError, /non-finite/);
  });

  it('still returns finite values for finite fields', () => {
    expect(projector.projectH1((x) => x[0], point, tIdx)).to.be.closeTo(
        0.45,
        1e-12,
    );
  });
});
