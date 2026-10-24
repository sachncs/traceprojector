/**
 * Projection of one field at many points on worker threads (Node.js).
 *
 * A function cannot be sent to another thread, so the field is given as the
 * URL of an ES module whose default export is the field. Each worker builds
 * its own projector on the mesh, so the work that is shared (the mesh and the
 * boundary weights) is repeated once per worker and the gain is in the
 * per-point projections.
 */

import {Worker} from 'node:worker_threads';
import {availableParallelism} from 'node:os';
import {ProjectError, ValidateError} from './errors.js';

const WORKER = new URL('./parallel-worker.js', import.meta.url);

/**
 * @param {{vertices: number[][], tetrahedra: number[][], field: string,
 *     points: number[][], l: (number|undefined), p: (number|undefined),
 *     workers: (number|undefined), options: (!Object|undefined)}} job
 *     `field` is the `file:` URL (or an absolute path) of the module that
 *     default-exports the field; `workers` defaults to the number of cores.
 * @return {!Promise<!Array<(number|!Array<number>)>>} The values, in the order
 *     of `points`.
 */
export async function projectInParallel(job) {
  const {vertices, tetrahedra, field, points} = job;
  if (typeof field !== 'string') {
    throw new ValidateError(
        'field must be the URL of a module with a default export');
  }
  const url = field.startsWith('file:') ? field : new URL(`file://${field}`).href;
  const count = Math.max(1, Math.min(
      job.workers ?? availableParallelism(), points.length));
  const chunk = Math.ceil(points.length / count);
  const jobs = [];
  for (let start = 0; start < points.length; start += chunk) {
    jobs.push(new Promise((resolve, reject) => {
      const worker = new Worker(WORKER, {
        workerData: {
          vertices,
          tetrahedra,
          field: url,
          points: points.slice(start, start + chunk),
          l: job.l ?? 0,
          p: job.p ?? 0,
          options: job.options ?? {},
        },
      });
      worker.once('message', (message) => {
        if (message.error) reject(new ProjectError(message.error));
        else resolve(message.values);
      });
      worker.once('error', reject);
    }));
  }
  return (await Promise.all(jobs)).flat();
}
