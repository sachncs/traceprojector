import {expectType, expectError, expectAssignable} from 'tsd';
import {
  Mesh, Whitney, Projector, StableProjector, ZeroTraceProjector,
  TracePreservingProjector,
  ValidateError, ProjectError, SingularError,
} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {CoefficientPool} from '../traceprojector/parallel.js';

const mesh = generateUnitCubeMesh(2);
expectType<Mesh>(mesh);
expectType<number>(mesh.tetrahedronCount);
expectType<number[][]>(mesh.getVertices());

const projector = new Projector(mesh, new Whitney(mesh), {quadratureOrder: 3});
expectType<number>(projector.projectH1((x) => x[0], [0.1, 0.1, 0.1], 0));
expectError(projector.projectH1((x) => x[0], 'not a point', 0));

const vertices: number[][] = mesh.getVertices();
const tetrahedra: number[][] = mesh.getTetrahedra();
const stable = new StableProjector(vertices, tetrahedra, {quadratureOrder: 4});
expectType<number | number[]>(stable.project((x) => x[0], [0.1, 0.1, 0.1], 0, 0));
expectType<number>(stable.coefficient((x) => x[0], 0, 0));
const zeroTrace = new ZeroTraceProjector(vertices, tetrahedra);
expectType<number>(zeroTrace.coefficient((x) => x[0], 0, 0));
expectType<StableProjector>(new StableProjector(vertices, tetrahedra, {interior: zeroTrace}));
expectError(new StableProjector(vertices));

expectAssignable<Error>(new ValidateError('x'));
expectAssignable<Error>(new ProjectError('x'));
expectAssignable<Error>(new SingularError('x'));

// The trace-preserving operator above the lowest order is evaluated with local.
const higher = new TracePreservingProjector(vertices, tetrahedra, {degree: 1, quadratureOrder: 8});
const lazy = higher.local((x) => x[0], (x) => [1, 0, 0], 0);
expectType<number | number[]>(lazy.value([0.1, 0.1, 0.1], 0));
expectType<number | number[]>(lazy.derivative([0.1, 0.1, 0.1], 0));
expectType<Float64Array>(
    new TracePreservingProjector(vertices, tetrahedra).coefficients((x) => x[0], (x) => [1, 0, 0], 0));
expectError(new TracePreservingProjector(vertices, tetrahedra, {degree: 'high'}));

// The coefficient pool.
const pool = new CoefficientPool({
  vertices, tetrahedra, operator: 'zero-trace', workers: 2,
  resourceLimits: {maxOldGenerationSizeMb: 512},
});
expectType<number>(pool.size);
expectType<Promise<Float64Array>>(pool.coefficients({field: 'file:///field.js', l: 0, entities: [0, 1]}));
expectType<Promise<void>>(pool.close());
expectError(new CoefficientPool({vertices, tetrahedra, operator: 'nonsense'}));
