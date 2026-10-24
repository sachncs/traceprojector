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
