/**
 * Computes projections on a fixed mesh and prints the raw bits of every output,
 * so two processes can be compared for bit-identical results.
 */
import {
  Mesh,
  Whitney,
  Projector,
  StableProjector,
} from '../../traceprojector/traceprojector.js';
import {generateUnitCubeMesh} from '../../traceprojector/generator.js';
import {seededRandom} from './random.js';
import {randomPolynomial, randomVectorPolynomial} from './polynomial.js';

const cube = generateUnitCubeMesh(3);
const random = seededRandom(99);
const vertices = cube
    .getVertices()
    .map((v) =>
      v.map((q) => (q > 0 && q < 1 ? q + 0.04 * (random() - 0.5) : q)),
    );
const tetrahedra = cube.getTetrahedra();
const mesh = new Mesh(vertices, tetrahedra);
const projector = new Projector(mesh, new Whitney(mesh), {onWarning: () => {}});
projector.computeBoundaryWeights();
projector.buildLocator();

const scalar = randomPolynomial(random, 2);
const vector = randomVectorPolynomial(random, 2);
const out = [];
for (let i = 0; i < 40; i++) {
  const point = [
    0.05 + 0.9 * random(),
    0.05 + 0.9 * random(),
    0.05 + 0.9 * random(),
  ];
  const hit = projector.projectAtPoint((x) => scalar.evaluate(x), point, 0);
  out.push(hit.tIdx, hit.value);
  out.push(
      ...projector.projectHcurl(
          (x) => vector.map((p) => p.evaluate(x)),
          point,
          hit.tIdx,
      ),
  );
  out.push(
      ...projector.projectHdiv(
          (x) => vector.map((p) => p.evaluate(x)),
          point,
          hit.tIdx,
      ),
  );
  out.push(projector.projectL2((x) => scalar.evaluate(x), hit.tIdx));
}
// Shared-face points exercise the locator's tie-break.
const t = tetrahedra[10];
const faceCentre = [0, 1, 2].map(
    (k) => (vertices[t[1]][k] + vertices[t[2]][k] + vertices[t[3]][k]) / 3,
);
out.push(projector.locator.findTetrahedron(faceCentre).tIdx);

const stable = new StableProjector(vertices, tetrahedra, {quadratureOrder: 4});
out.push(stable.project((x) => scalar.evaluate(x), [0.4, 0.4, 0.4], 20, 0));
console.log(Buffer.from(new Float64Array(out).buffer).toString('hex'));
