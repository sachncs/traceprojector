// Time-dependent data: locate the evaluation points once, then project each
// new time step cheaply. The expensive part of evaluating a projection at a
// point is finding the tetrahedron that contains it, and that does not change.
import {Projector, Whitney} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(6);
const projector = new Projector(mesh, new Whitney(mesh));

const probes = [[0.2, 0.3, 0.4], [0.5, 0.5, 0.5], [0.8, 0.6, 0.1]];
const sample = projector.sampler(probes, 0); // l = 0: a potential

// A travelling wave u(x, t).
const field = (t) => (p) => Math.sin(2 * (p[0] - t)) * Math.cos(p[1] + p[2]);

for (const t of [0, 0.5, 1, 1.5]) {
  const u = field(t);
  const projected = sample(u);
  const error = Math.max(...projected.map((v, i) => Math.abs(v -
    u(probes[i]))));
  console.log('t =', t.toFixed(1),
      ' projected', projected.map((v) => v.toFixed(3)).join(' '),
      ' largest error', error.toFixed(3));
}
console.log('points outside the mesh are an error, found when you build the ' +
    'sampler:');
try {
  projector.sampler([[0.5, 0.5, 0.5], [3, 3, 3]], 0);
} catch (error) {
  console.log(' ', error.constructor.name + ':', error.message);
}
