// The field used by parallel.js. A worker thread cannot receive a function,
// so the field is a module whose default export is the function.
export default (p) => Math.sin(p[0] + 2 * p[1]) * Math.cos(p[2]) + p[0] * p[1];
