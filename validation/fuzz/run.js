/**
 * Runs fuzz cases in worker threads with a heap ceiling and a per-case
 * watchdog, so a hang or an out-of-memory case is reported, not fatal.
 */
import {Worker} from 'node:worker_threads';
import {makeCases} from './cases.js';

const WORKER = new URL('./worker.js', import.meta.url);

/**
 * @param {{cases: number, timeoutMs: number, heapCeilingMb: number, seed:
 *     (number|undefined)}} options
 * @return {Promise<!Array<!Object>>} One verdict per case.
 */
export async function runFuzz({cases, timeoutMs, heapCeilingMb, seed = 1}) {
  const verdicts = [];
  let worker = null;
  const start = () =>
    new Worker(WORKER, {
      resourceLimits: {maxOldGenerationSizeMb: heapCeilingMb},
    });

  for (const c of makeCases(cases, seed)) {
    worker ??= start();
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => finish({outcome: 'hang'}), timeoutMs);
      const onMessage = (r) => finish(r);
      const onError = (e) =>
        finish({
          outcome: /memory/i.test(String(e?.code ?? e?.message)) ?
            'out-of-memory' :
            'crash',
          message: String(e?.message ?? e).slice(0, 200),
        });
      const finish = (r) => {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('error', onError);
        resolve(r);
      };
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.postMessage(c);
    });
    if (
      result.outcome === 'hang' ||
      result.outcome === 'out-of-memory' ||
      result.outcome === 'crash'
    ) {
      await worker.terminate();
      worker = null;
    }
    verdicts.push({
      id: c.id,
      generator: c.generator,
      category: c.category,
      expect: c.expect,
      ...result,
    });
  }
  if (worker) await worker.terminate();
  return verdicts;
}

/**
 * Whether a verdict is acceptable: typed rejection where the input is invalid,
 * and a correct finite answer where it is valid.
 * @param {!Object} v
 * @return {?string} The reason it is not, or null.
 */
export function judge(v) {
  if (
    v.outcome === 'hang' ||
    v.outcome === 'out-of-memory' ||
    v.outcome === 'crash'
  ) {
    return v.outcome;
  }
  if (v.outcome === 'untyped-error') return `untyped ${v.name}: ${v.message}`;
  if (v.expect === 'error' && v.outcome === 'ok') {
    return 'accepted invalid input';
  }
  if (v.expect === 'ok' && v.outcome === 'typed-error') {
    return `rejected valid input: ${v.message}`;
  }
  if (v.outcome === 'ok' && !(v.finite && v.error <= 1e-8)) {
    return `wrong answer (relative error ${v.error})`;
  }
  return null;
}
