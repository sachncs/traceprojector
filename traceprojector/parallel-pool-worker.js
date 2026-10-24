/**
 * Worker thread of `CoefficientPool`: builds one operator on the mesh and
 * answers requests for the coefficients of a list of entities. The operator
 * and the weights it has computed live as long as the worker.
 */

import {parentPort, workerData} from 'node:worker_threads';
import {BoundedCommutingProjector} from './bounded-commuting-projector.js';
import {HighOrderWeights} from './high-order-weights.js';
import {ZeroTraceProjector} from './zero-trace-projector.js';

const {vertices, tetrahedra, operator, degree, options} = workerData;
const fields = new Map();

/** @return {function(number[], number, number): number} */
function build() {
  if (operator === 'higher-order') {
    const weights = new HighOrderWeights(vertices, tetrahedra,
        {...options, degree});
    return (u, l, entity) => weights.pair(l, entity, (x) => u(x));
  }
  const Operator = operator === 'zero-trace' ? ZeroTraceProjector :
    BoundedCommutingProjector;
  const projector = new Operator(vertices, tetrahedra, options);
  return (u, l, entity) => projector.coefficient(u, l, entity);
}

let coefficient = null;

parentPort.on('message', async ({id, field, l, entities}) => {
  try {
    if (!coefficient) coefficient = build();
    if (!fields.has(field)) fields.set(field, (await import(field)).default);
    const u = fields.get(field);
    const values = Float64Array.from(
        entities, (entity) => coefficient(u, l, entity));
    parentPort.postMessage({id, values: Array.from(values)});
  } catch (error) {
    parentPort.postMessage({id, error: `${error.name}: ${error.message}`});
  }
});
