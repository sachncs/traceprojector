import {expectType, expectError, expectAssignable} from 'tsd';
import {
  Mesh, Whitney, Projector, StableProjector, ZeroTraceProjector,
  ValidateError, ProjectError, SingularError,
} from '../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';

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
