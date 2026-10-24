import { findLabField, type OperatorId, type Vec3 } from "./lab-fields";

/**
 * A program that reproduces what the lab shows: it builds the same mesh,
 * defines the same field and prints the operator's value at each point. It
 * uses only what the package exports, so it runs as written.
 */
export function labCode(args: {
  operator: OperatorId;
  fieldId: string;
  centre: Vec3;
  points: Vec3[];
  mesh: { kind: "cube"; n: number } | { kind: "custom" };
}): string {
  const { operator, fieldId, centre, points, mesh } = args;
  const field = findLabField(fieldId).make({ centre });
  const names: Record<OperatorId, string> = {
    projector: "Projector, Whitney",
    canonical: "CanonicalProjector",
    "bounded-commuting": "BoundedCommutingProjector",
    stable: "StableProjector",
    "trace-preserving": "TracePreservingProjector",
  };
  const meshLines =
    mesh.kind === "cube"
      ? `import { generateUnitCubeMesh } from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(${mesh.n});`
      : `import { readFileSync } from 'node:fs';

// Your mesh: an ASCII Gmsh file (or build the two arrays yourself).
const { vertices, tetrahedra } = parseGmsh(readFileSync('mesh.msh', 'utf8'));
const mesh = new Mesh(vertices, tetrahedra);`;
  const imports =
    mesh.kind === "cube"
      ? `import { Locator, ${names[operator]} } from 'traceprojector';`
      : `import { Locator, Mesh, parseGmsh, ${names[operator]} } from 'traceprojector';`;
  const arrays =
    mesh.kind === "cube"
      ? "const vertices = mesh.getVertices();\nconst tetrahedra = mesh.getTetrahedra();\n"
      : "";
  const gradient =
    operator === "trace-preserving"
      ? `const grad = ${gradientSource(fieldId, centre)};\n`
      : "";
  const build: Record<OperatorId, string> = {
    projector:
      "const projector = new Projector(mesh, new Whitney(mesh));\nprojector.computeBoundaryWeights();",
    canonical: "const projector = new CanonicalProjector(vertices, tetrahedra);",
    "bounded-commuting":
      "const projector = new BoundedCommutingProjector(vertices, tetrahedra);",
    stable: "const projector = new StableProjector(vertices, tetrahedra);",
    "trace-preserving":
      "const projector = new TracePreservingProjector(vertices, tetrahedra);",
  };
  const call: Record<OperatorId, string> = {
    projector: "projector.projectAtPoint(u, point, 0).value",
    canonical: "projector.project(u, point, tIdx, 0)",
    "bounded-commuting": "projector.project(u, point, tIdx, 0)",
    stable: "projector.project(u, point, tIdx, 0)",
    "trace-preserving": "projector.project(u, grad, point, tIdx, 0)",
  };
  const list = points
    .map((p) => `  [${p.map((q) => +q.toFixed(4)).join(", ")}]`)
    .join(",\n");
  return `${imports}
${meshLines}
${arrays}
const u = ${field.source};
${gradient}${build[operator]}
const locator = new Locator(mesh);

const points = [
${list},
];
for (const point of points) {
  const found = locator.findTetrahedron(point);
  if (!found) continue;
  const { tIdx } = found;
  // A ProjectError here means the operator cannot read this field.
  console.log(point.join(', '), u(point), ${call[operator]});
}
`;
}

/** The gradient of a lab field as source text, for the trace-preserving operator. */
function gradientSource(fieldId: string, centre: Vec3): string {
  const [cx, cy, cz] = centre;
  switch (fieldId) {
    case "singular":
      return `(p) => {
  const r = Math.hypot(p[0] - ${cx}, p[1] - ${cy}, p[2] - ${cz});
  const f = -0.5 / (r * r * Math.sqrt(r));
  return [f * (p[0] - ${cx}), f * (p[1] - ${cy}), f * (p[2] - ${cz})];
}`;
    case "bump":
      return `(p) => {
  const f = -120 * Math.exp(-60 * ((p[0] - ${cx}) ** 2 + (p[1] - ${cy}) ** 2 + (p[2] - ${cz}) ** 2));
  return [f * (p[0] - ${cx}), f * (p[1] - ${cy}), f * (p[2] - ${cz})];
}`;
    default:
      return `(p) => [
  Math.cos(p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
  -Math.sin(p[0]) * Math.sin(p[1]) * Math.exp(p[2]),
  Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]),
]`;
  }
}
