/**
 * A pool of worker threads that computes the coefficients of the bounded
 * operators (Node.js).
 *
 * Every coefficient is the integral of the field against the weight function
 * of one mesh entity, and the weights are independent local problems, so the
 * entities can be computed on any number of threads. Each worker owns a
 * complete operator (mesh, weights, caches) and shares no mutable state with
 * the others, so there is nothing to lock and the result does not depend on
 * how many workers there are or in which order they finish: a coefficient is
 * computed by exactly one worker, with the same arithmetic as a serial run.
 * The weights a worker has computed stay in its caches, so a second field
 * over the same entities costs only its own quadrature.
 *
 * A function cannot be sent to another thread, so the field is given as the
 * URL of an ES module whose default export is the field.
 */

import {Worker} from 'node:worker_threads';
import {availableParallelism} from 'node:os';
import {ProjectError, ValidateError} from './errors.js';

const WORKER = new URL('./parallel-pool-worker.js', import.meta.url);
const OPERATORS = ['bounded-commuting', 'zero-trace', 'higher-order'];

export class CoefficientPool {
  /**
   * @param {{vertices: number[][], tetrahedra: number[][], operator:
   *     (string|undefined), degree: (number|undefined), workers:
   *     (number|undefined), options: (!Object|undefined)}} job `operator` is
   *     `bounded-commuting` (default), `zero-trace` or `higher-order`
   *     (the weights of the lowest-order degrees of freedom of the
   *     Arnold-Guzman operator, of degree `degree`); `workers` defaults to the
   *     number of cores.
   */
  constructor(job) {
    const operator = job.operator ?? 'bounded-commuting';
    if (!OPERATORS.includes(operator)) {
      throw new ValidateError(
          `operator must be one of ${OPERATORS.join(', ')}`);
    }
    const count = job.workers ?? availableParallelism();
    if (!Number.isInteger(count) || count < 1) {
      throw new ValidateError('workers must be a positive integer');
    }
    this.size = count;
    this.nextId = 0;
    this.pending = new Map();
    this.workers = Array.from({length: count}, () => {
      const worker = new Worker(WORKER, {
        resourceLimits: job.resourceLimits,
        workerData: {
          vertices: job.vertices,
          tetrahedra: job.tetrahedra,
          operator,
          degree: job.degree ?? 0,
          options: job.options ?? {},
        },
      });
      const state = {worker, busy: false};
      worker.on('message', (message) => {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        state.busy = false;
        if (message.error) entry.reject(new ProjectError(message.error));
        else entry.resolve(message.values);
        this.dispatch();
      });
      worker.on('error', (error) => {
        for (const entry of this.pending.values()) entry.reject(error);
        this.pending.clear();
      });
      return state;
    });
    this.queue = [];
  }

  /** Hands queued chunks to idle workers. @private */
  dispatch() {
    for (const state of this.workers) {
      if (state.busy || this.queue.length === 0) continue;
      const chunk = this.queue.shift();
      state.busy = true;
      this.pending.set(chunk.id, chunk);
      state.worker.postMessage({
        id: chunk.id,
        field: chunk.field,
        l: chunk.l,
        entities: chunk.entities,
      });
    }
  }

  /**
   * The coefficient of every requested entity for one field.
   * @param {{field: string, l: number, entities: !Array<number>}} job
   *     `field` is the `file:` URL (or absolute path) of the field module.
   * @return {!Promise<!Float64Array>} The coefficients, in the order of
   *     `entities`.
   */
  async coefficients({field, l, entities}) {
    if (typeof field !== 'string') {
      throw new ValidateError(
          'field must be the URL of a module with a default export');
    }
    const url = field.startsWith('file:') ? field :
      new URL(`file://${field}`).href;
    // Small chunks, dealt out as workers become free, balance the very
    // different costs of the entities.
    const size = Math.max(1, Math.ceil(entities.length / (this.size * 8)));
    const parts = [];
    for (let start = 0; start < entities.length; start += size) {
      parts.push(new Promise((resolve, reject) => {
        this.queue.push({
          id: this.nextId++,
          field: url,
          l,
          entities: entities.slice(start, start + size),
          resolve,
          reject,
        });
      }));
    }
    this.dispatch();
    const values = await Promise.all(parts);
    return Float64Array.from(values.flat());
  }

  /** Stops the workers. */
  async close() {
    await Promise.all(this.workers.map(({worker}) => worker.terminate()));
  }
}
