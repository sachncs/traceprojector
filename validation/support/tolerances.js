import {readFileSync} from 'node:fs';

const raw = JSON.parse(
    readFileSync(new URL('../tolerances.json', import.meta.url), 'utf8'),
);

export const tolerances = raw;

/**
 * Pre-registered roundoff bound for an identity residual.
 * @param {number} rho - Shape regularity of the mesh (max h / theta).
 * @param {number} scale - max(1, max |field|).
 * @return {number}
 */
export function identityTolerance(rho, scale) {
  const {c, nOps} = raw.identity;
  return c * nOps * raw.machineEpsilon * rho * Math.max(1, scale);
}
