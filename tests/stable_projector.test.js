import {expect} from 'chai';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {LocalWeights} from '../traceprojector/local-weights.js';
import {ZeroTraceProjector} from '../traceprojector/zero-trace-projector.js';
import {StableProjector} from '../traceprojector/stable-projector.js';
import {SimplicialComplex} from '../traceprojector/simplicial-complex.js';
import {
  ProjectError,
  SingularError,
  ValidateError,
} from '../traceprojector/errors.js';

// A cell near the centre of a 6 x 6 x 6 cube mesh: its stars do not touch the
// boundary,
// so the local problems are small and the test is fast.
const mesh = generateUnitCubeMesh(6);
const vertices = mesh.getVertices();
const cells = mesh.getTetrahedra();
const centreCell = cells
    .map((t, i) => {
      const c = [0, 1, 2].map((k) =>
        t.reduce((sum, v) => sum + vertices[v][k] / 4, 0),
      );
      return {i, d: Math.hypot(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5)};
    })
    .reduce((best, x) => (x.d < best.d ? x : best)).i;
const centroid = (c) =>
  [0, 1, 2].map((k) => cells[c].reduce((s, v) => s + vertices[v][k] / 4, 0));

describe('stable projection (fast regression checks)', function() {
  this.timeout(60000);
  const interior = new ZeroTraceProjector(vertices, cells);
  const stable = new StableProjector(vertices, cells, {interior});

  it('reproduces an affine scalar field in a cell away from the boundary', () => {
    const u = (x) => 0.4 * x[0] - 1.1 * x[1] + 2.5 * x[2] + 0.3;
    const x = centroid(centreCell);
    expect(Math.abs(stable.project(u, x, centreCell, 0) - u(x))).to.be.below(
        1e-10,
    );
  });

  it('reproduces a constant vector field with degree 1 and degree 2 forms', () => {
    const a = (x) => [0.5, -0.25, 1.5];
    const x = centroid(centreCell);
    for (const l of [1, 2]) {
      const value = stable.project(a, x, centreCell, l);
      value.forEach((v, k) =>
        expect(Math.abs(v - [0.5, -0.25, 1.5][k])).to.be.below(1e-10),
      );
    }
  });

  it('the weight of an interior vertex integrates to one', () => {
    const weights = new LocalWeights(vertices, cells);
    const v = cells[centreCell][0];
    expect(Math.abs(weights.pair(0, v, () => 1) - 1)).to.be.below(1e-10);
  });

  it('stays finite for a field unbounded at a mesh vertex', () => {
    const v = cells[centreCell][0];
    const c = vertices[v];
    const singular = (x) =>
      Math.hypot(x[0] - c[0], x[1] - c[1], x[2] - c[2]) ** -0.4;
    expect(
        Number.isFinite(
            stable.project(singular, centroid(centreCell), centreCell, 0),
        ),
    ).to.equal(true);
  });

  it('rejects a boundary degree of freedom that is not finite', () => {
    const corner = cells.findIndex((t) =>
      t.some((v) => vertices[v].every((q) => q === 0)),
    );
    expect(() =>
      stable.project(() => NaN, centroid(corner), corner, 0),
    ).to.throw(ProjectError);
  });

  it('a one-cell mesh has no interior entity, so there is nothing to project', () => {
    const tiny = generateUnitCubeMesh(1);
    const weights = new LocalWeights(tiny.getVertices(), tiny.getTetrahedra());
    expect(
        tiny.getVertices().filter((_, i) => !weights.isBoundary(0, i)),
    ).to.have.length(0);
  });
});

describe('oriented complex', () => {
  const complex = new SimplicialComplex(vertices, cells);
  it('has consistent counts: Euler characteristic of a ball', () => {
    expect(
        complex.vertices.length -
        complex.edges.length +
        complex.faces.length -
        complex.cells.length,
    ).to.equal(1);
  });
  it('knows its boundary faces', () => {
    const boundary = complex.faces.filter((_, f) =>
      complex.isBoundaryFace(f),
    ).length;
    expect(boundary).to.equal(6 * 2 * 6 * 6);
  });
});

describe('stable projection: errors and edge cases', function() {
  this.timeout(60000);

  it('a mesh too coarse for the construction raises ValidateError', () => {
    const coarse = generateUnitCubeMesh(2);
    const weights = new LocalWeights(
        coarse.getVertices(),
        coarse.getTetrahedra(),
    );
    const vertex = coarse
        .getVertices()
        .findIndex((_, i) => !weights.isBoundary(0, i));
    expect(() => weights.weight(0, vertex)).to.throw(
        ValidateError,
        /admissible/,
    );
  });

  it('the residual guard raises SingularError for an inconsistent local problem', () => {
    const weights = new LocalWeights(vertices, cells);
    expect(() => weights.requireSmall('test', 1, 1, null)).to.throw(
        SingularError,
        /inconsistent/,
    );
    expect(() => weights.requireSmall('test', 1, 1, 10)).to.throw(
        SingularError,
        /inconsistent/,
    );
    expect(() => weights.requireSmall('test', 1e-20, 1, null)).to.not.throw();
  });

  it('the dense reference solvers give the same weight as the default solvers', () => {
    const dense = new LocalWeights(vertices, cells, {dense: true});
    const sparse = new LocalWeights(vertices, cells);
    const edge = complexEdgeNear(sparse);
    const a = sparse.weight(1, edge).dofs;
    const b = dense.weight(1, edge).dofs;
    for (const [key, value] of a) {
      expect(Math.abs(value - (b.get(key) ?? 0))).to.be.below(1e-9);
    }
  });

  it('the zero-trace projection handles vector fields and rejects non-finite coefficients', () => {
    const interior = new ZeroTraceProjector(vertices, cells);
    const x = centroid(centreCell);
    for (const l of [1, 2]) {
      const value = interior.project(() => [0.5, -0.25, 1.5], x, centreCell, l);
      value.forEach((v, k) =>
        expect(Math.abs(v - [0.5, -0.25, 1.5][k])).to.be.below(1e-10),
      );
    }
    expect(
        Math.abs(interior.project(() => 2, x, centreCell, 3) - 2),
    ).to.be.below(1e-10);
    expect(() => interior.project(() => Infinity, x, centreCell, 0)).to.throw(
        ProjectError,
        /not finite/,
    );
  });

  it('the stable projection of a degree-3 field uses the cell mean', () => {
    const stable = new StableProjector(vertices, cells);
    expect(
        Math.abs(
            stable.project((p) => p[0], centroid(centreCell), centreCell, 3) -
          cells[centreCell].reduce((s, v) => s + vertices[v][0] / 4, 0),
        ),
    ).to.be.below(1e-3);
  });
});

describe('oriented complex: degrees of freedom', () => {
  const single = new SimplicialComplex(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [[0, 1, 2, 3]],
  );
  it('vertex value, edge circulation, face flux and cell integral of simple fields', () => {
    expect(single.degreeOfFreedom(0, 3, (x) => x[2] + 2)).to.be.closeTo(
        3,
        1e-14,
    );
    expect(
        single.degreeOfFreedom(1, single.edgeIndex(0, 1), () => [3, 0, 0]),
    ).to.be.closeTo(3, 1e-13);
    expect(
        single.degreeOfFreedom(2, single.faceIndex(0, 1, 2), () => [0, 0, 2]),
    ).to.be.closeTo(1, 1e-13);
    expect(single.degreeOfFreedom(3, 0, () => 6)).to.be.closeTo(1, 1e-13);
  });
  it('reports missing entities with -1', () => {
    expect(single.edgeIndex(0, 9)).to.equal(-1);
    expect(single.faceIndex(0, 1, 9)).to.equal(-1);
  });
  it('lists the entities of a cell for every form degree', () => {
    expect(single.cellEntities(0, 0)).to.have.length(4);
    expect(single.cellEntities(0, 1)).to.have.length(6);
    expect(single.cellEntities(0, 2)).to.have.length(4);
    expect(single.cellEntities(0, 3)).to.deep.equal([0]);
  });
  it('the degree-3 Whitney form is one over the volume', () => {
    expect(single.whitney(0, 3, [0.1, 0.1, 0.1])[0]).to.be.closeTo(6, 1e-12);
  });
});

/** An interior edge of the 6 x 6 x 6 mesh whose star does not touch the
 * boundary. */
function complexEdgeNear(weights) {
  const edges = weights.base.cellEdges[centreCell];
  return edges.find((e) => !weights.isBoundary(1, e));
}
