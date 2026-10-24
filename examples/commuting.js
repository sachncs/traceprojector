// Checking that the projection commutes with differentiation:
//   the gradient of the projected function equals the projection of the
//   gradient, so a curl-free field stays curl-free after discretization.
// Two ways to look at it, for the two kinds of operator.
import {BoundedCommutingProjector, CanonicalProjector, Locator}
  from 'traceprojector';
import {generateUnitCubeMesh} from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(3);
const vertices = mesh.getVertices();
const tetrahedra = mesh.getTetrahedra();

const u = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]);
const gradU = (p) => [
  Math.cos(p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
  -Math.sin(p[0]) * Math.sin(p[1]) * Math.exp(p[2]),
  Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
];

// 1. A canonical operator gives the projection as a finite element function
//    and its derivative, so compare grad(Pi0 u) with Pi1(grad u) pointwise.
const canonical = new CanonicalProjector(vertices, tetrahedra);
const coefficients = canonical.coefficients(u, 0);
const locator = new Locator(mesh);
let worst = 0;
const points = [[0.31, 0.22, 0.4], [0.7, 0.45, 0.15], [0.52, 0.81, 0.66]];
for (const point of points) {
  const {tIdx} = locator.findTetrahedron(point);
  const left = canonical.derivative(coefficients, point, tIdx, 0);
  const right = canonical.project(gradU, point, tIdx, 1);
  worst = Math.max(worst, ...left.map((q, i) => Math.abs(q - right[i])));
}
// Exact in exact arithmetic; what remains is the quadrature of u.
console.log('canonical: |grad Pi0 u - Pi1 grad u| below 1e-9:', worst < 1e-9);

// 2. The bounded operator is built from weights, so it commutes through its
//    coefficients: the coefficient of grad u on an edge is the difference of
//    the coefficients of u at the edge's two ends.
const bounded = new BoundedCommutingProjector(vertices, tetrahedra,
    {quadratureOrder: 6});

worst = 0;
for (const edge of [0, 5, 17, 40]) {
  const [from, to] = bounded.edge(edge);
  const direct = bounded.coefficient(gradU, 1, edge);
  const difference = bounded.coefficient(u, 0, to) -
    bounded.coefficient(u, 0, from);
  worst = Math.max(worst, Math.abs(direct - difference));
}
console.log('bounded:   edge coefficient of grad u = difference of vertex ' +
    'coefficients to 1e-8:', worst < 1e-8);
