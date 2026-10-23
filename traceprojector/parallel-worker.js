/**
 * Worker thread for `projectInParallel`: builds a projector on the mesh it is
 * given, loads the field from its module, and projects its share of points.
 */

import {parentPort, workerData} from 'node:worker_threads';
import {Mesh} from './mesh.js';
import {Whitney} from './whitney.js';
import {Projector} from './traceprojector.js';

const {vertices, tetrahedra, field, points, l, p, options} = workerData;
try {
  const mesh = new Mesh(vertices, tetrahedra);
  const projector = new Projector(mesh, new Whitney(mesh), {
    ...options,
    onWarning: () => {},
  });
  projector.computeBoundaryWeights();
  const {default: u} = await import(field);
  parentPort.postMessage({values: projector.sampler(points, l, p)(u)});
} catch (error) {
  parentPort.postMessage({error: `${error.name}: ${error.message}`});
}
