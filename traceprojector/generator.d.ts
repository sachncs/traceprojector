import type {Mesh} from './mesh.js';

/**
 * A mesh of the unit cube `[0, 1]^3` with `n` cubes per side, each cut into
 * six tetrahedra (`6 n^3` in all), for tests, examples and convergence studies.
 * @param n - Cubes per side (an integer of at least 1).
 */
export function generateUnitCubeMesh(n: number): Mesh;

/** A mesh with the single reference tetrahedron. */
export function generateSingleTetMesh(): Mesh;
