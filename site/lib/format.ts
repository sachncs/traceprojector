export function formatNumber(n: number, digits = 6): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-12) return n.toExponential(2);
  return n.toFixed(digits);
}

export function formatBary(b: [number, number, number, number]): string {
  return `[${b.map((v) => v.toFixed(3)).join(", ")}]`;
}

/** The fields of the classic view as source, scalar and vector. */
const SOURCES: Record<string, { scalar: string; vector: string }> = {
  sincos: {
    scalar: "(p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2])",
    vector: "(p) => [Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]), 0, 0]",
  },
  quadratic: {
    scalar: "(p) => p[0] ** 2 + p[1] ** 2 + p[2] ** 2",
    vector: "(p) => [2 * p[0], 2 * p[1], 2 * p[2]]",
  },
  linear: {
    scalar: "(p) => p[0] + p[1] + p[2]",
    vector: "() => [1, 1, 1]",
  },
  trig: {
    scalar:
      "(p) => Math.sin(Math.PI * p[0]) * Math.sin(Math.PI * p[1]) * Math.sin(Math.PI * p[2])",
    vector: `(p) => [
  Math.PI * Math.cos(Math.PI * p[0]) * Math.sin(Math.PI * p[1]) * Math.sin(Math.PI * p[2]),
  Math.PI * Math.sin(Math.PI * p[0]) * Math.cos(Math.PI * p[1]) * Math.sin(Math.PI * p[2]),
  Math.PI * Math.sin(Math.PI * p[0]) * Math.sin(Math.PI * p[1]) * Math.cos(Math.PI * p[2]),
]`,
  },
  exponential: {
    scalar: "(p) => Math.exp(p[0] + p[1] + p[2])",
    vector:
      "(p) => [Math.exp(p[0] + p[1] + p[2]), Math.exp(p[0] + p[1] + p[2]), Math.exp(p[0] + p[1] + p[2])]",
  },
};

/**
 * A program that reproduces the classic view: the same mesh, field and point.
 * It uses only what the package exports, so it runs as written.
 */
export function generateCode(args: {
  functionId: string;
  subdivision: number;
  point: [number, number, number];
  p: number;
  quadratureOrder: number;
  form: number;
}): string {
  const { functionId, subdivision, point, p, quadratureOrder, form } = args;
  const sources = SOURCES[functionId] ?? SOURCES.sincos!;
  const field = form === 1 || form === 2 ? sources.vector : sources.scalar;
  return `import { Projector, Whitney } from 'traceprojector';
import { generateUnitCubeMesh } from 'traceprojector/generator';

const mesh = generateUnitCubeMesh(${subdivision});
const projector = new Projector(mesh, new Whitney(mesh), {
  quadratureOrder: ${quadratureOrder},
});
projector.computeBoundaryWeights();

// form degree ${form}: ${form === 1 || form === 2 ? "a vector field" : "a scalar field"}
const u = ${field};

const { value, tIdx } = projector.projectAtPoint(u, [${point.join(", ")}], ${form}, ${p});
console.log('tetrahedron', tIdx, 'projection', value);
`;
}
