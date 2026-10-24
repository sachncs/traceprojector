#!/usr/bin/env node
/**
 * Benchmarks of the numerical kernels and the weight pipeline.
 *
 *   node scripts/bench.mjs            print the table, write reports/bench.json
 *   node scripts/bench.mjs --check    also fail if a scenario is slower or
 *                                     larger than the committed baseline
 *   node scripts/bench.mjs --update   rewrite the committed baseline
 *
 * Wall-clock times differ between machines, so every time is also reported in
 * units of a calibration loop (a dense matrix product) run on the same
 * machine just before; the baseline stores those units. Space (factor
 * entries) and iteration counts do not depend on the machine and are compared
 * to within 10%.
 *
 * Each scenario runs once untimed (JIT and caches), then a few times; the
 * median is reported.
 */
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {availableParallelism, cpus} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {generateUnitCubeMesh} from '../traceprojector/generator.js';
import {HighOrderWeights} from '../traceprojector/high-order-weights.js';
import {
  BoundedCommutingProjector,
  Projector,
  Whitney,
} from '../traceprojector/traceprojector.js';
import {
  minimumNormSolveBanded,
} from '../traceprojector/banded-linear-algebra.js';
import {SparseMatrix} from '../traceprojector/sparse-linear-algebra.js';
import {CoefficientPool} from '../traceprojector/parallel.js';

const root = resolve(import.meta.dirname, '..');
const BASELINE = join(root, 'validation/benchmarks/baseline.json');
const REPORT = join(root, 'reports/bench.json');
const RUNS = 3;
const TIME_FACTOR = 1.75;
const SPACE_FACTOR = 1.1;

const args = new Set(process.argv.slice(2));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** A deterministic pseudo-random generator. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function time(fn, runs = RUNS) {
  fn();
  const samples = [];
  let value;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    value = fn();
    samples.push(performance.now() - start);
  }
  return {ms: median(samples), value};
}

/** Time of a fixed dense product: the unit in which times are compared. */
function calibrate() {
  const n = 160;
  const a = Float64Array.from({length: n * n}, (_, i) => Math.sin(i));
  const b = Float64Array.from({length: n * n}, (_, i) => Math.cos(i));
  const c = new Float64Array(n * n);
  return time(() => {
    c.fill(0);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const aik = a[i * n + k];
        for (let j = 0; j < n; j++) c[i * n + j] += aik * b[k * n + j];
      }
    }
    return c[0];
  }, 5).ms;
}

/** A sparse minimum-norm problem on a k x k x k grid of unknowns. */
function gridProblem(k) {
  const n = k ** 3;
  const random = seeded(k);
  const mass = Array.from({length: n}, () => new Map());
  const id = (i, j, l) => (i * k + j) * k + l;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < k; l++) {
        const a = id(i, j, l);
        mass[a].set(a, 6.5);
        for (const [di, dj, dl] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
          if (i + di < k && j + dj < k && l + dl < k) {
            const b = id(i + di, j + dj, l + dl);
            mass[a].set(b, -1);
            mass[b].set(a, -1);
          }
        }
      }
    }
  }
  const m = Math.floor(n / 2);
  const rows = Array.from({length: m}, () => {
    const row = new Map();
    const centre = Math.floor(random() * n);
    for (let t = 0; t < 4; t++) {
      const offset = Math.floor((random() - 0.5) * 2 * k * k);
      row.set(Math.min(n - 1, Math.max(0, centre + offset)),
          Math.round(4 * random() - 2) || 1);
    }
    return row;
  });
  const constraints = new SparseMatrix(m, n, rows);
  const x0 = Float64Array.from({length: n}, () => random() - 0.5);
  return {
    n,
    m,
    constraints,
    mass: new SparseMatrix(n, n, mass),
    r: constraints.multiply(x0),
  };
}

function interiorEntity(how, l) {
  const base = how.base;
  const count = [base.vertices.length, base.edges.length, base.faces.length,
    base.cells.length][l];
  for (let k = 0; k < count; k++) {
    const e = Math.floor(count / 2) + k;
    if (e < count && !how.topology.isBoundary(l, e)) return e;
  }
  throw new Error('no interior entity');
}

const scenarios = [];

for (const k of [8, 11, 14, 17]) {
  scenarios.push({
    name: `solver/minimum-norm grid ${k}^3`,
    run() {
      const problem = gridProblem(k);
      const {ms, value} = time(() => minimumNormSolveBanded(
          problem.constraints, problem.mass, problem.r));
      return {
        ms,
        unknowns: problem.n,
        entries: value.entries,
        iterations: value.iterations,
        residual: value.residual / value.scale,
        stationarity: value.stationarity,
        dualityGap: value.dualityGap,
      };
    },
  });
}

for (const l of [1, 2, 3]) {
  scenarios.push({
    name: `weights/p=1 l=${l} (6x6x6 cube, cold)`,
    run() {
      const cube = generateUnitCubeMesh(6);
      const vertices = cube.getVertices();
      const tetrahedra = cube.getTetrahedra();
      const probe = new HighOrderWeights(vertices, tetrahedra, {degree: 1});
      const entity = interiorEntity(probe, l);
      const {ms, value} = time(() => {
        const how = new HighOrderWeights(vertices, tetrahedra, {degree: 1});
        how.weight(l, entity);
        return how.stats;
      });
      return {
        ms,
        solves: value.length,
        unknowns: Math.max(...value.map((s) => s.unknowns)),
        entries: value.reduce((a, s) => a + s.entries, 0),
        iterations: value.reduce((a, s) => a + s.iterations, 0),
        residual: Math.max(...value.map((s) => s.residual)),
        stationarity: Math.max(...value.map((s) => s.stationarity)),
        dualityGap: Math.max(...value.map((s) => s.dualityGap)),
      };
    },
  });
}

scenarios.push({
  name: 'bounded/lowest-order all coefficients (3x3x3 cube)',
  run() {
    const cube = generateUnitCubeMesh(3);
    const {ms, value} = time(() => {
      const op = new BoundedCommutingProjector(
          cube.getVertices(), cube.getTetrahedra());
      const base = op.weights.base;
      const counts = [base.vertices.length, base.edges.length,
        base.faces.length, base.cells.length];
      const fields = [(p) => p[0] + p[1], (p) => [p[1], p[2], p[0]],
        (p) => [p[0], p[1], p[2]], (p) => p[0] * p[1]];
      let total = 0;
      for (let l = 0; l < 4; l++) {
        for (let e = 0; e < counts[l]; e++) {
          op.coefficient(fields[l], l, e);
          total++;
        }
      }
      return total;
    }, 1);
    return {ms, entities: value, msPerEntity: ms / value};
  },
});

scenarios.push({
  name: 'canonical/Projector build + 2000 projections (6x6x6 cube)',
  run() {
    const cube = generateUnitCubeMesh(6);
    const {ms, value} = time(() => {
      const projector = new Projector(cube, new Whitney(cube),
          {onWarning: () => {}});
      projector.computeBoundaryWeights();
      projector.buildLocator();
      const u = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2]);
      let sum = 0;
      const random = seeded(3);
      for (let i = 0; i < 2000; i++) {
        sum += projector.projectAtPoint(
            u, [0.05 + 0.9 * random(), 0.05 + 0.9 * random(),
              0.05 + 0.9 * random()], 0).value;
      }
      return sum;
    });
    return {ms, checksum: value};
  },
});

scenarios.push({
  name: 'parallel/CoefficientPool strong scaling (4x4x4 cube, all faces)',
  async run() {
    const cube = generateUnitCubeMesh(4);
    const vertices = cube.getVertices();
    const tetrahedra = cube.getTetrahedra();
    const field = join(root, 'tests/fixtures/vector-field.mjs');
    const faces = new BoundedCommutingProjector(vertices, tetrahedra)
        .weights.base.faces.length;
    const entities = Array.from({length: faces}, (_, i) => i);
    const cores = availableParallelism();
    const counts = [1, 2, 4, 8].filter((c) => c <= cores);
    const times = {};
    for (const workers of counts) {
      const pool = new CoefficientPool({vertices, tetrahedra, workers});
      const start = performance.now();
      await pool.coefficients({field, l: 2, entities});
      times[workers] = performance.now() - start;
      await pool.close();
    }
    const top = counts[counts.length - 1];
    return {
      ms: times[1],
      cores,
      entities: faces,
      speedup: times[1] / times[top],
      efficiency: times[1] / times[top] / top,
      workersAtTop: top,
    };
  },
});

function slope(points) {
  const xs = points.map(([n]) => Math.log(n));
  const ys = points.map(([, t]) => Math.log(t));
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) /
    xs.reduce((a, x) => a + (x - mx) ** 2, 0);
}

const calibration = calibrate();
console.log(`calibration (dense 160^3 product): ${calibration.toFixed(2)} ms`);
const results = {};
for (const scenario of scenarios) {
  const out = await scenario.run();
  out.normalized = out.ms / calibration;
  results[scenario.name] = out;
  const parts = Object.entries(out)
      .filter(([key]) => !['ms', 'normalized'].includes(key))
      .map(([key, v]) => `${key}=${typeof v === 'number' &&
        !Number.isInteger(v) ? v.toExponential(2) : v}`);
  console.log(`${scenario.name}: ${out.ms.toFixed(1)} ms (${
    out.normalized.toFixed(2)} u)  ${parts.join(' ')}`);
}
const solverRows = Object.entries(results).filter(
    ([name]) => name.startsWith('solver/')).map(([, r]) => r);
const exponents = {
  solverTime: slope(solverRows.map((r) => [r.unknowns, r.ms])),
  solverSpace: slope(solverRows.map((r) => [r.unknowns, r.entries])),
};
console.log(`solver scaling: time ~ n^${exponents.solverTime.toFixed(2)}, ` +
  `space ~ n^${exponents.solverSpace.toFixed(2)}`);

const report = {
  node: process.version,
  cpu: cpus()[0].model,
  calibrationMs: calibration,
  exponents,
  results,
};
mkdirSync(dirname(REPORT), {recursive: true});
writeFileSync(REPORT, JSON.stringify(report, null, 2));

if (args.has('--update')) {
  mkdirSync(dirname(BASELINE), {recursive: true});
  writeFileSync(BASELINE, JSON.stringify(report, null, 2));
  console.log(`baseline written to ${BASELINE}`);
}

if (args.has('--check')) {
  if (!existsSync(BASELINE)) throw new Error('no baseline to check against');
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const failures = [];
  for (const [name, now] of Object.entries(results)) {
    const was = baseline.results[name];
    if (!was) continue;
    if (now.normalized > TIME_FACTOR * was.normalized) {
      failures.push(`${name}: ${now.normalized.toFixed(2)} u against ${
        was.normalized.toFixed(2)} u`);
    }
    for (const key of ['entries', 'iterations']) {
      if (was[key] && now[key] > SPACE_FACTOR * was[key] + 5) {
        failures.push(`${name}: ${key} ${now[key]} against ${was[key]}`);
      }
    }
    if (was.speedup && now.cores >= was.cores && now.speedup <
        0.6 * was.speedup) {
      failures.push(`${name}: speed-up ${now.speedup.toFixed(2)} against ${
        was.speedup.toFixed(2)}`);
    }
    for (const key of ['residual', 'stationarity', 'dualityGap']) {
      if (now[key] > 1e-9) {
        failures.push(`${name}: ${key} ${now[key]} (limit 1e-9)`);
      }
    }
  }
  if (failures.length) {
    console.error(`benchmark regressions:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log('benchmarks within the baseline');
}
