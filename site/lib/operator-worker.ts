/// <reference lib="webworker" />
/**
 * The worker of the operator lab. The bounded operators solve a local problem
 * per entity, which takes seconds, so they run here and not on the page. It
 * builds an operator once per mesh and keeps it, so later points and checks
 * reuse the weights it has computed.
 */
import {
  BoundedCommutingProjector,
  CanonicalProjector,
  Locator,
  Mesh,
  Projector,
  StableProjector,
  TracePreservingProjector,
  ValidateError,
  Whitney,
  parseGmsh,
  refineTetrahedra,
  validateMeshInput,
} from "traceprojector";

import { findLabField, type OperatorId, type Vec3 } from "./lab-fields";

export interface MeshData {
  vertices: number[][];
  tetrahedra: number[][];
}

export type Request =
  | { id: number; type: "parse-json"; text: string }
  | { id: number; type: "parse-msh"; text: string }
  | {
      id: number;
      type: "evaluate";
      meshKey: number;
      mesh: MeshData;
      operator: OperatorId;
      fieldId: string;
      centre: Vec3;
      points: Vec3[];
    }
  | {
      id: number;
      type: "residuals";
      meshKey: number;
      mesh: MeshData;
      operator: OperatorId;
      fieldId: string;
      centre: Vec3;
    }
  | {
      id: number;
      type: "refine";
      mesh: MeshData;
      centre: Vec3;
      radius: number;
    };

export interface PointResult {
  value: number | null;
  error: string | null;
}

export type Response =
  | { id: number; ok: true; type: "mesh"; mesh: MeshData; note: string }
  | {
      id: number;
      ok: true;
      type: "evaluate";
      results: PointResult[];
      milliseconds: number;
    }
  | {
      id: number;
      ok: true;
      type: "residuals";
      commuting: { value: number | null; note: string };
      trace: { value: number | null; note: string };
      milliseconds: number;
    }
  | { id: number; ok: false; error: string };

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Positive orientation for Mesh and Locator, whichever way the input is. */
function oriented(mesh: MeshData): MeshData {
  const tetrahedra = mesh.tetrahedra.map((t) => {
    const [a, b, c, d] = t.map((i) => mesh.vertices[i]!) as number[][];
    const u = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
    const v = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
    const w = [d![0]! - a![0]!, d![1]! - a![1]!, d![2]! - a![2]!];
    const det =
      u[0]! * (v[1]! * w[2]! - v[2]! * w[1]!) -
      u[1]! * (v[0]! * w[2]! - v[2]! * w[0]!) +
      u[2]! * (v[0]! * w[1]! - v[1]! * w[0]!);
    return det < 0 ? [t[0]!, t[2]!, t[1]!, t[3]!] : t;
  });
  return { vertices: mesh.vertices, tetrahedra };
}

interface Built {
  meshKey: number;
  mesh: Mesh;
  locator: Locator;
  data: MeshData;
  operators: Map<OperatorId, unknown>;
}

let built: Built | null = null;

function ensure(meshKey: number, data: MeshData): Built {
  if (built && built.meshKey === meshKey) return built;
  const fixed = oriented(data);
  validateMeshInput(fixed.vertices, fixed.tetrahedra);
  const mesh = new Mesh(fixed.vertices, fixed.tetrahedra);
  built = {
    meshKey,
    mesh,
    locator: new Locator(mesh),
    data: fixed,
    operators: new Map(),
  };
  return built;
}

type Field = (p: number[]) => number;
type Gradient = (p: number[]) => number[];

interface Operator {
  /** Value of the projection at a point of a cell. */
  project: (u: Field, du: Gradient, p: number[], cell: number) => number;
  /** The Whitney coefficient of vertex v (the boundary value). */
  vertexValue: (u: Field, du: Gradient, v: number) => number;
  /** The projector itself, for the checks that need more than a value. */
  raw: unknown;
}

function operatorFor(b: Built, id: OperatorId): Operator {
  const cached = b.operators.get(id);
  if (cached) return cached as Operator;
  const { vertices, tetrahedra } = b.data;
  let operator: Operator;
  switch (id) {
    case "projector": {
      const projector = new Projector(b.mesh, new Whitney(b.mesh), {
        quadratureOrder: 4,
        onWarning: () => {},
      });
      projector.computeBoundaryWeights();
      projector.buildLocator();
      const canonical = new CanonicalProjector(vertices, tetrahedra);
      operator = {
        project: (u, _du, p) =>
          projector.projectAtPoint(u, p, 0, 0).value as number,
        vertexValue: (u, _du, v) => canonical.coefficients(u, 0)[v]!,
        raw: projector,
      };
      break;
    }
    case "canonical": {
      const canonical = new CanonicalProjector(vertices, tetrahedra);
      operator = {
        project: (u, _du, p, cell) => canonical.project(u, p, cell, 0) as number,
        vertexValue: (u, _du, v) => canonical.coefficients(u, 0)[v]!,
        raw: canonical,
      };
      break;
    }
    case "bounded-commuting": {
      const bounded = new BoundedCommutingProjector(vertices, tetrahedra);
      operator = {
        project: (u, _du, p, cell) => bounded.project(u, p, cell, 0) as number,
        vertexValue: (u, _du, v) => bounded.coefficient(u, 0, v),
        raw: bounded,
      };
      break;
    }
    case "stable": {
      const stable = new StableProjector(vertices, tetrahedra);
      operator = {
        project: (u, _du, p, cell) => stable.project(u, p, cell, 0) as number,
        vertexValue: (u, _du, v) => stable.coefficient(u, 0, v),
        raw: stable,
      };
      break;
    }
    case "trace-preserving": {
      const traced = new TracePreservingProjector(vertices, tetrahedra);
      operator = {
        project: (u, du, p, cell) =>
          traced.project(u, du, p, cell, 0) as number,
        vertexValue: (u, du, v) => traced.coefficient(u, du, 0, v),
        raw: traced,
      };
      break;
    }
  }
  b.operators.set(id, operator);
  return operator;
}

function evaluate(req: Extract<Request, { type: "evaluate" }>): Response {
  const b = ensure(req.meshKey, req.mesh);
  const field = findLabField(req.fieldId).make({ centre: req.centre });
  const start = performance.now();
  const operator = operatorFor(b, req.operator);
  const results = req.points.map((point): PointResult => {
    try {
      const found = b.locator.findTetrahedron(point);
      if (!found) throw new Error("the point is outside the mesh");
      const value = operator.project(field.u, field.grad, point, found.tIdx);
      return { value, error: null };
    } catch (error) {
      return { value: null, error: describe(error) };
    }
  });
  return {
    id: req.id,
    ok: true,
    type: "evaluate",
    results,
    milliseconds: performance.now() - start,
  };
}

function residuals(req: Extract<Request, { type: "residuals" }>): Response {
  const b = ensure(req.meshKey, req.mesh);
  const field = findLabField(req.fieldId).make({ centre: req.centre });
  const start = performance.now();
  const operator = operatorFor(b, req.operator);
  const { vertices, tetrahedra } = b.data;

  // Boundary values: how far the vertex coefficients on the boundary are from
  // the values of u there.
  let trace: { value: number | null; note: string };
  try {
    const boundary = [...b.mesh.boundaryNodes].sort((x, y) => x - y);
    const step = Math.max(1, Math.floor(boundary.length / 12));
    const sample = boundary.filter((_, i) => i % step === 0);
    let worst = 0;
    for (const v of sample) {
      worst = Math.max(
        worst,
        Math.abs(operator.vertexValue(field.u, field.grad, v) - field.u(vertices[v]!)),
      );
    }
    trace = {
      value: worst,
      note: `largest |coefficient − u(vertex)| over ${sample.length} boundary vertices`,
    };
  } catch (error) {
    trace = { value: null, note: describe(error) };
  }

  // Commuting: grad of the projection against the projection of the gradient.
  let commuting: { value: number | null; note: string };
  try {
    if (!findLabField(req.fieldId).smoothGradient) {
      commuting = {
        value: null,
        note: "not measured for this field: its gradient is not square integrable, so quadrature cannot compute the coefficients of the gradient and the number would show quadrature error, not the operator. Use a smooth field.",
      };
    } else if (req.operator === "bounded-commuting") {
      const projector = operator.raw as BoundedCommutingProjector;
      const edges = projector.count(1);
      const step = Math.max(1, Math.floor(edges / 10));
      let worst = 0;
      let used = 0;
      for (let e = 0; e < edges; e += step) {
        const [from, to] = projector.edge(e);
        const edge = projector.coefficient((p) => field.grad(p), 1, e);
        const difference =
          projector.coefficient(field.u, 0, to) -
          projector.coefficient(field.u, 0, from);
        worst = Math.max(worst, Math.abs(edge - difference));
        used++;
      }
      commuting = {
        value: worst,
        note: `edge coefficient of grad u against the difference of the vertex coefficients, ${used} edges`,
      };
    } else if (req.operator === "projector" || req.operator === "canonical") {
      const canonical = new CanonicalProjector(vertices, tetrahedra);
      const coefficients = canonical.coefficients(field.u, 0);
      let worst = 0;
      const probes: Vec3[] = [
        [0.31, 0.22, 0.4],
        [0.7, 0.45, 0.15],
        [0.52, 0.61, 0.66],
      ];
      for (const point of probes) {
        const found = b.locator.findTetrahedron(point);
        if (!found) continue;
        const left = canonical.derivative(coefficients, point, found.tIdx, 0) as number[];
        const right = canonical.project(field.grad, point, found.tIdx, 1) as number[];
        left.forEach((q, i) => (worst = Math.max(worst, Math.abs(q - right[i]!))));
      }
      commuting = {
        value: worst,
        note: "grad of the projection against the projection of the grad, at three points",
      };
    } else {
      commuting = {
        value: null,
        note: "not measured here: for this operator commuting is proved for fields whose boundary trace is a discrete trace, and the check needs the derivative of the projection",
      };
    }
  } catch (error) {
    commuting = { value: null, note: describe(error) };
  }

  return {
    id: req.id,
    ok: true,
    type: "residuals",
    commuting,
    trace,
    milliseconds: performance.now() - start,
  };
}

function refine(req: Extract<Request, { type: "refine" }>): Response {
  const { vertices, tetrahedra } = oriented(req.mesh);
  const marked: number[] = [];
  tetrahedra.forEach((t, i) => {
    const mid = [0, 1, 2].map(
      (k) => t.reduce((s, v) => s + vertices[v]![k]!, 0) / 4,
    );
    const d = Math.hypot(
      mid[0]! - req.centre[0],
      mid[1]! - req.centre[1],
      mid[2]! - req.centre[2],
    );
    if (d < req.radius) marked.push(i);
  });
  if (marked.length === 0) {
    throw new ValidateError("no cell is within the radius of the centre");
  }
  const refined = refineTetrahedra(vertices, tetrahedra, marked);
  return {
    id: req.id,
    ok: true,
    type: "mesh",
    mesh: { vertices: refined.vertices, tetrahedra: refined.tetrahedra },
    note: `bisected ${marked.length} cells`,
  };
}

function parseJson(req: Extract<Request, { type: "parse-json" }>): Response {
  let data: unknown;
  try {
    data = JSON.parse(req.text);
  } catch {
    throw new ValidateError("the text is not valid JSON");
  }
  const mesh = data as Partial<MeshData>;
  if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.tetrahedra)) {
    throw new ValidateError(
      'expected {"vertices": [[x, y, z], ...], "tetrahedra": [[a, b, c, d], ...]}',
    );
  }
  validateMeshInput(mesh.vertices, mesh.tetrahedra, { allowFlipped: true });
  return {
    id: req.id,
    ok: true,
    type: "mesh",
    mesh: oriented({ vertices: mesh.vertices, tetrahedra: mesh.tetrahedra }),
    note: "",
  };
}

function parseMsh(req: Extract<Request, { type: "parse-msh" }>): Response {
  const { vertices, tetrahedra, skipped } = parseGmsh(req.text);
  const extra = Object.entries(skipped)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(", ");
  return {
    id: req.id,
    ok: true,
    type: "mesh",
    mesh: { vertices, tetrahedra },
    note: extra ? `skipped ${extra}` : "",
  };
}

self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  try {
    let response: Response;
    switch (req.type) {
      case "parse-json":
        response = parseJson(req);
        break;
      case "parse-msh":
        response = parseMsh(req);
        break;
      case "evaluate":
        response = evaluate(req);
        break;
      case "residuals":
        response = residuals(req);
        break;
      case "refine":
        response = refine(req);
        break;
    }
    self.postMessage(response);
  } catch (error) {
    self.postMessage({ id: req.id, ok: false, error: describe(error) } satisfies Response);
  }
};
