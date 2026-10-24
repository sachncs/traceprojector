// Many points, or many coefficients, on worker threads. Each worker owns its
// own copy of the operator, so nothing is shared, and the answer is exactly
// the one a single thread gives, for any number of workers.
import {
  BoundedCommutingProjector, Mesh, Projector, Whitney,
} from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';
import {CoefficientPool, projectInParallel} from 'traceprojector/parallel';

const mesh = generateUnitCubeMesh(4);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();

// A worker cannot receive a function, so the field is a module whose default
// export is the function; pass its file URL.
const field = new URL('_parallel-field.js', import.meta.url).href;
const u = (await import(field)).default;

// 1. One field at many points, on two workers (the canonical operator).
const points = [];
for (let i = 1; i < 6; i++) points.push([i / 7, ((i * 2) % 6) / 7 + 0.05, 0.4]);
const parallel = await projectInParallel({
  vertices, tetrahedra, field, points, l: 0, workers: 2,
});
const projector = new Projector(new Mesh(vertices, tetrahedra),
    new Whitney(mesh));
projector.computeBoundaryWeights();
const serial = projector.sampler(points, 0)(u);
console.log('points projected on 2 workers:', parallel.length);
console.log('identical to one thread:', parallel.every((v, i) =>
  v === serial[i]));

// 2. The coefficients of a bounded operator on a pool of workers. The pool
//    stays alive between calls, so each worker keeps the weights it computed.
const entities = Array.from({length: 12}, (_, i) => i * 3);
const pool = new CoefficientPool({
  vertices, tetrahedra, operator: 'bounded-commuting', workers: 2,
});
const pooled = await pool.coefficients({field, l: 0, entities});
await pool.close();
const single = new BoundedCommutingProjector(vertices, tetrahedra);
console.log('coefficients computed on the pool:', pooled.length);
console.log('identical to one thread, bit for bit:',
    entities.every((e, i) => pooled[i] === single.coefficient(u, 0, e)));
