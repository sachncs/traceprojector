/**
 * Computes the dot product of two 3D vectors.
 */
export function dot(a: number[], b: number[]): number;

/**
 * Computes the cross product of two 3D vectors.
 */
export function cross(a: number[], b: number[]): number[];

/**
 * Subtracts vector b from vector a.
 */
export function subtract(a: number[], b: number[]): number[];

/**
 * Computes the Euclidean norm of a vector.
 */
export function norm(v: number[]): number;

/**
 * In-place vector subtraction: out = a - b.
 */
export function subtractInto(a: number[], b: number[], out: number[]): number[];

/**
 * In-place cross product: out = a x b.
 */
export function crossInto(a: number[], b: number[], out: number[]): number[];

/**
 * Computes the area of a triangle given its three vertices.
 */
export function triangleArea(p1: number[], p2: number[], p3: number[]): number;

/**
 * Creates a zero-initialized dense matrix.
 */
export function zeros(rows: number, cols: number): number[][];

/**
 * Computes the infinity norm (maximum absolute row sum) of a matrix.
 */
export function infinityNorm(a: number[][]): number;

/**
 * Solves Ax = b using Gaussian elimination with partial pivoting and row
 * equilibration (pivot scaling).
 *
 * @param a - Dense square matrix (not modified).
 * @param b - Right-hand side vector.
 * @returns Solution vector x.
 */
export function luSolve(a: number[][], b: number[]): number[];

/**
 * Computes the inverse of a 3x3 matrix.
 */
export function inverse3x3(m: number[][]): number[][];

/**
 * Solves a 3x3 linear system Ax = b using Cramer's rule.
 */
export function solve3x3(a: number[][], b: number[]): number[];

/** Maximum n for which n! fits in a JavaScript Number without overflowing. */
export const MAX_SAFE_FACTORIAL: number;

/**
 * Computes the determinant (scalar triple product) of a tetrahedron.
 */
export function tetDeterminant(v0: number[], v1: number[], v2: number[], v3: number[]): number;

/**
 * Computes the geometric volume of a tetrahedron.
 */
export function tetVolume(v0: number[], v1: number[], v2: number[], v3: number[]): number;

/**
 * Smallest accepted ratio of a tetrahedron's volume determinant to the cube of
 * its longest edge. Independent of the unit system.
 */
export const MIN_RELATIVE_VOLUME: number;

/**
 * Length of the longest edge of a tetrahedron.
 * @param vertices - The four vertices.
 */
export function longestEdge(vertices: number[][]): number;

/**
 * Signed volume determinant divided by the cube of the longest edge: a
 * dimensionless measure of how far a tetrahedron is from flat.
 * @param vertices - The four vertices.
 */
export function relativeVolume(vertices: number[][]): number;

/**
 * Computes the factorial n!.
 * @throws Error if n > MAX_SAFE_FACTORIAL.
 */
export function factorial(n: number): number;

/**
 * Numerical gradient of a scalar function using central differences.
 */
export function numericalGradient(u: (pt: number[]) => number, pt: number[], h?: number): number[];
