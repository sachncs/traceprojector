import {parentPort} from 'node:worker_threads';
import {Mesh, Whitney, Projector} from '../../traceprojector/traceprojector.js';
import {
  ValidateError,
  ProjectError,
  SingularError,
} from '../../traceprojector/errors.js';

const isTyped = (e) =>
  e instanceof ValidateError ||
  e instanceof ProjectError ||
  e instanceof SingularError;

/** Builds the library objects and projects an affine field exactly at a cell
 * centroid. */
function run(c) {
  const mesh = new Mesh(c.vertices, c.tetrahedra);
  const projector = new Projector(mesh, new Whitney(mesh), {
    onWarning: () => {},
  });
  projector.computeBoundaryWeights();
  const vertices = mesh.getVertices();
  const tet = mesh.getTetrahedra()[0];
  const point = [0, 1, 2].map((k) =>
    tet.reduce((s, v) => s + vertices[v][k] / 4, 0),
  );
  const field = (x) => 0.5 * x[0] - 1.25 * x[1] + 2 * x[2] + 3;
  const value = projector.projectH1(field, point, 0);
  const scale = Math.max(1, ...point.map(Math.abs), Math.abs(field(point)));
  return {
    error: Math.abs(value - field(point)) / scale,
    finite: Number.isFinite(value),
  };
}

parentPort.on('message', (c) => {
  try {
    parentPort.postMessage({id: c.id, outcome: 'ok', ...run(c)});
  } catch (e) {
    parentPort.postMessage({
      id: c.id,
      outcome: isTyped(e) ? 'typed-error' : 'untyped-error',
      name: e?.constructor?.name,
      message: String(e?.message ?? e).slice(0, 200),
    });
  }
});
