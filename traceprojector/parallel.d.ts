/**
 * Projection of one field at many points on worker threads (Node.js only).
 */
export function projectInParallel(job: {
  vertices: number[][];
  tetrahedra: number[][];
  /** The `file:` URL (or absolute path) of an ES module whose default export is the field. */
  field: string;
  points: number[][];
  l?: number;
  p?: number;
  /** Number of workers (default: the number of cores). */
  workers?: number;
  options?: { quadratureOrder?: number };
}): Promise<Array<number | number[]>>;

/**
 * A pool of worker threads that computes the coefficients of the bounded
 * operators. Each worker owns a complete operator and shares no state, so the
 * result is bitwise the same for any number of workers.
 */
export class CoefficientPool {
  constructor(job: {
    vertices: number[][];
    tetrahedra: number[][];
    /** `bounded-commuting` (default), `zero-trace` or `higher-order` (the lowest-order weights of degree `degree`). */
    operator?: 'bounded-commuting' | 'zero-trace' | 'higher-order';
    degree?: number;
    /** Number of workers (default: the number of cores). */
    workers?: number;
    options?: { quadratureOrder?: number };
    /** Limits of each worker thread (see worker_threads). */
    resourceLimits?: { maxOldGenerationSizeMb?: number; maxYoungGenerationSizeMb?: number };
  });
  /** Number of workers. */
  readonly size: number;
  /** The coefficient of every listed entity of form degree l, in order. */
  coefficients(job: {
    /** The `file:` URL (or absolute path) of an ES module whose default export is the field. */
    field: string;
    l: number;
    entities: number[];
  }): Promise<Float64Array>;
  /** Stops the workers. */
  close(): Promise<void>;
}
