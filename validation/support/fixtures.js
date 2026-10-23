import {Whitney, Projector} from '../../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {shapeRegularity} from './mesh-quality.js';

/**
 * Builds a unit-cube projector with boundary weights computed, as the
 * documented usage requires.
 * @param {number} n - Cubes per axis.
 * @param {number=} quadratureOrder
 * @return {{mesh: !Mesh, projector: !Projector, rho: number}}
 */
export function cubeFixture(n, quadratureOrder = 3) {
  const mesh = generateUnitCubeMesh(n);
  const whitney = new Whitney(mesh);
  const projector = new Projector(mesh, whitney, {
    quadratureOrder,
    onWarning: () => {},
  });
  projector.computeBoundaryWeights();
  const rho = shapeRegularity(mesh.getVertices(), mesh.getTetrahedra());
  return {mesh, projector, rho};
}

/** Point with the given barycentric coordinates in cell tIdx. */
export function pointIn(mesh, tIdx, bary) {
  const v = mesh.getVertices();
  const t = mesh.getTetrahedra()[tIdx];
  const p = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 3; k++) p[k] += bary[i] * v[t[i]][k];
  }
  return p;
}

/** Random barycentric coordinates, strictly interior. */
export function randomBary(random) {
  const w = [
    0.05 + random(),
    0.05 + random(),
    0.05 + random(),
    0.05 + random(),
  ];
  const s = w[0] + w[1] + w[2] + w[3];
  return w.map((x) => x / s);
}

/** Cell indices to sample: every cell for small meshes, otherwise an even
 * stride. */
export function sampleCells(mesh, maxCount) {
  const total = mesh.tetrahedronCount;
  const stride = Math.max(1, Math.floor(total / maxCount));
  const out = [];
  for (let i = 0; i < total; i += stride) out.push(i);
  return out;
}

/** Projects with the documented full operator Pi^l. */
export function applyPi(projector, u, point, tIdx, l) {
  return projector.project(u, point, tIdx, l);
}

export function maxAbs(values) {
  return Math.max(0, ...values.map(Math.abs));
}

export function sub(a, b) {
  return typeof a === 'number' ? a - b : a.map((x, i) => x - b[i]);
}
