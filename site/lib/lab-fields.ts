/**
 * The fields of the operator lab. They live in one module that the page and
 * the worker both import, because a function cannot be sent to a worker: the
 * page sends a field's id and its parameters, and each side builds the same
 * function from them.
 */

export type Vec3 = [number, number, number];

export interface FieldParams {
  /** The point a singular or localized field is centred on. */
  centre: Vec3;
}

export interface Field {
  id: string;
  label: string;
  /** What the field shows about the operators. */
  note: string;
  /**
   * Whether quadrature can integrate the gradient accurately. The commuting
   * check pairs the gradient with weights, so it is only meaningful then.
   */
  smoothGradient: boolean;
  /** u(x), and its gradient (used by the commuting check). */
  make: (params: FieldParams) => {
    u: (p: number[]) => number;
    grad: (p: number[]) => Vec3;
    /** Source of u for the exported snippet. */
    source: string;
  };
}

const dist = (p: number[], c: Vec3) =>
  Math.hypot(p[0]! - c[0], p[1]! - c[1], p[2]! - c[2]);

export const LAB_FIELDS: Field[] = [
  {
    id: "smooth",
    label: "smooth: sin(x) cos(y) eᶻ",
    note: "Every operator handles this one. It is the baseline.",
    smoothGradient: true,
    make: () => ({
      u: (p) => Math.sin(p[0]!) * Math.cos(p[1]!) * Math.exp(p[2]!),
      grad: (p) => [
        Math.cos(p[0]!) * Math.cos(p[1]!) * Math.exp(p[2]!),
        -Math.sin(p[0]!) * Math.sin(p[1]!) * Math.exp(p[2]!),
        Math.sin(p[0]!) * Math.cos(p[1]!) * Math.exp(p[2]!),
      ],
      source: "(p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2])",
    }),
  },
  {
    id: "singular",
    label: "singular: 1/√r at a vertex",
    note: "Infinite at a mesh vertex, but in L². The canonical operators cannot read it; the bounded ones can.",
    smoothGradient: false,
    make: ({ centre }) => ({
      u: (p) => 1 / Math.sqrt(dist(p, centre)),
      grad: (p) => {
        const r = dist(p, centre);
        const f = -0.5 / (r * r * Math.sqrt(r));
        return [
          f * (p[0]! - centre[0]),
          f * (p[1]! - centre[1]),
          f * (p[2]! - centre[2]),
        ];
      },
      source: `(p) => 1 / Math.sqrt(Math.hypot(p[0] - ${centre[0]}, p[1] - ${centre[1]}, p[2] - ${centre[2]}))`,
    }),
  },
  {
    id: "bump",
    label: "localized bump",
    note: "A narrow Gaussian: refine the mesh near it to watch the error fall.",
    smoothGradient: true,
    make: ({ centre }) => ({
      u: (p) => Math.exp(-60 * dist(p, centre) ** 2),
      grad: (p) => {
        const f = -120 * Math.exp(-60 * dist(p, centre) ** 2);
        return [
          f * (p[0]! - centre[0]),
          f * (p[1]! - centre[1]),
          f * (p[2]! - centre[2]),
        ];
      },
      source: `(p) => Math.exp(-60 * ((p[0] - ${centre[0]}) ** 2 + (p[1] - ${centre[1]}) ** 2 + (p[2] - ${centre[2]}) ** 2))`,
    }),
  },
];

export const findLabField = (id: string): Field =>
  LAB_FIELDS.find((f) => f.id === id) ?? LAB_FIELDS[0]!;

export type OperatorId =
  | "projector"
  | "canonical"
  | "bounded-commuting"
  | "stable"
  | "trace-preserving";

export interface OperatorInfo {
  id: OperatorId;
  label: string;
  /** What it guarantees and what it needs, in one line. */
  summary: string;
  /** Whether it reads point values, edge integrals and face fluxes. */
  canonical: boolean;
  /** Expected cost class, shown before it is run. */
  cost: string;
}

export const OPERATORS: OperatorInfo[] = [
  {
    id: "projector",
    label: "Projector",
    summary:
      "Canonical interpolation with the paper's boundary weights. Smooth input.",
    canonical: true,
    cost: "milliseconds",
  },
  {
    id: "canonical",
    label: "CanonicalProjector",
    summary:
      "Canonical interpolation of any degree. Smooth input; keeps traces; commutes.",
    canonical: true,
    cost: "milliseconds",
  },
  {
    id: "bounded-commuting",
    label: "BoundedCommutingProjector",
    summary:
      "Bounded and commuting for every L² input; boundary values are not kept.",
    canonical: false,
    cost: "a local solve per entity (seconds)",
  },
  {
    id: "stable",
    label: "StableProjector",
    summary:
      "Bounded interior, exact boundary values; needs finite values on the boundary. Commutes for fields whose boundary trace is a lowest-order trace.",
    canonical: false,
    cost: "a local solve per entity (seconds)",
  },
  {
    id: "trace-preserving",
    label: "TracePreservingProjector",
    summary:
      "The paper's operator: bounded, keeps the discrete trace; commuting is proved for fields whose boundary trace is a discrete trace.",
    canonical: false,
    cost: "the dearest: boundary weights too (seconds to a minute)",
  },
];

export const findOperator = (id: string): OperatorInfo =>
  OPERATORS.find((o) => o.id === id) ?? OPERATORS[0]!;
