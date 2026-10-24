#!/usr/bin/env node
// Regenerates docs/exceptions.md from the `code: '...'` string
// literals in traceprojector/**/*.js.  Each entry's message template
// is the next string literal on the same `onWarning({ code, ..., message: '...'
// })`
// call.  Run with `--check` to exit non-zero if the docs are stale.
import {execSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

const CHECK = process.argv.includes('--check');

function collectEntries() {
  const files = execSync('rg --files traceprojector/ --glob \'*.js\'', {
    encoding: 'utf8',
  })
      .trim()
      .split('\n');

  const entries = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const re = /code:\s*'([A-Z_0-9]+)'[,\s\S]*?message:\s*(`[^`]+`|'[^']+')/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      let msg = m[2];
      if (msg.startsWith('`')) msg = msg.slice(1, -1);
      else msg = msg.slice(1, -1);
      entries.push({code: m[1], message: msg, file});
    }
  }
  return entries.sort((a, b) => a.code.localeCompare(b.code));
}

const HEADER = `# Errors and warnings

The library raises one of three error classes, all in \`errors.js\` and exported
from the package. A malformed mesh, a non-finite value or a point outside the
mesh is always one of them, never a silent wrong answer. Catch them by class:

\`\`\`javascript
import { ValidateError, ProjectError, SingularError } from 'traceprojector';

try {
  projector.project(u, point, tIdx, 0);
} catch (error) {
  if (error instanceof ValidateError) { /* the input mesh or arguments are wrong */ }
  else if (error instanceof ProjectError) { /* the call cannot be answered */ }
  else if (error instanceof SingularError) { /* a local problem has no solution */ }
  else throw error;
}
\`\`\`

## ValidateError

The input is invalid: the mesh, or an argument that describes a mesh or an
element.

| Condition | Message pattern |
|---|---|
| no vertices, or no tetrahedra | \`vertices must be a non-empty array\`, \`tetrahedra must be a non-empty array\` |
| a coordinate that is not a finite number | \`Vertex ... must be an array of 3 finite numbers\` |
| a tetrahedron repeats a vertex | \`Tetrahedron ... contains duplicate vertex indices\` |
| a vertex index that does not exist | \`Tetrahedron ... contains out-of-bounds vertex index ...\` |
| zero volume, or negative orientation | \`Tetrahedron ... has non-positive or degenerate volume (signedVol=..., relative volume ...)\` |
| a mesh that is not conforming | \`inconsistent meshes\` |
| \`generateUnitCubeMesh\` with a bad size | \`n must be a positive integer\` |
| a bad polynomial degree | \`degree must be a nonnegative integer\` |
| a projector that needs the derivative of the field was not given it | \`the derivative of u is needed\` |

**Recovery**: fix the input. For a flipped tetrahedron, swap two of its vertex
numbers.

## ProjectError

The arguments are well formed but the call cannot be answered.

| Condition | Message pattern |
|---|---|
| \`tIdx\` is not an integer, or is out of range | \`tIdx must be an integer, got ...\`, \`tIdx=... out of range [0, ...]\` |
| a point that is not three finite numbers | \`point must be an array of 3 finite numbers, got ...\` |
| a point outside the mesh | \`Point [...] not found in any tetrahedron\` |
| the field returns \`NaN\` or \`Infinity\` at a degree of freedom | \`... produced a non-finite value ...\`, \`a degree of freedom is not finite\`, \`coefficient of degree ... entity ... is not finite\` |
| a form degree that does not exist | \`Invalid form degree l=...\` |
| \`Projector.projectHp\` for \`l = 1, 2\` with \`p > 0\` | \`Higher-order projections for l=..., p=... not yet implemented\` (use \`CanonicalProjector\`) |

**Recovery**: check the field at the reported point; locate the point with
\`Locator\` before projecting; use \`CanonicalProjector\` or \`HigherOrderProjector\`
for higher degrees.

## SingularError

A local linear problem has no solution or the matrix is not definite.

| Condition | Message pattern |
|---|---|
| a \`3x3\` matrix with zero determinant | \`Singular 3x3 matrix\`, \`Singular or near-singular matrix\` |
| a local mass or stiffness matrix that is not positive definite | \`matrix is not positive definite\` |
| an extended star that is not a topological ball | \`the extended star of the vertex is not contractible\`, \`... of the edge ...\` |
| no field with the required derivative in a star | \`no field with the required differential in the star of entity ...\`, \`no flux field with the required divergence\` |
| a boundary weight that reaches outside its star | \`a boundary weight leaves the star\` |

**Recovery**: the mesh is too coarse near the reported entity for the local
problem to exist, or it has a degenerate element. Refine it, or repair the
element.

`;

const FOOTER = `
**Recovery**: Ensure the tetrahedron has strictly positive volume.

## Solver Warnings

\`Solver\` warns on ill-conditioned local solves rather than throwing.

| Code | Message | Meaning |
|------|---------|---------|
| \`LOCAL_SOLVER_ILL_CONDITIONED\` | \`Solver: matrix is ill-conditioned (norm=...). Results may be inaccurate.\` | The local stiffness matrix is numerically ill-conditioned; the solve may be inaccurate. |

**Recovery**: Inspect the local star geometry for inverted or degenerate
* elements.

## Projector Warnings

\`Projector\` warns at construction if the mesh contains degenerate or near-degenerate tetrahedra.

| Code | Message | Meaning |
|------|---------|---------|
| \`TRACEPROJECTOR_DEGENERATE_MESH\` | \`Projector: mesh contains N degenerate or near-degenerate tetrahedra. Projections may fail.\` | The mesh has tetrahedra whose volume relative to their longest edge cubed is below \`1e-10\` (see \`MIN_RELATIVE_VOLUME\`). |

**Recovery**: Re-mesh or repair the input mesh before computing projections.
`;

function escapeBackticks(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function buildDoc(entries) {
  let doc = HEADER;

  doc += '## Weight Warnings\n\n';
  doc +=
    '`Weight` logs warnings via an injected `warn` function rather than throwing, because per-vertex failures should not halt the entire computation.  Construct with `{ strict: true }` to opt into fail-fast behaviour: in that mode the same per-simplex failure path re-throws a `ProjectError` instead of emitting a warning.\n\n';
  doc += '| Code | Message | Meaning |\n';
  doc += '|------|---------|---------|\n';
  for (const e of entries.filter((e) => e.code.startsWith('BWC_'))) {
    doc += `| \`${e.code}\` | \`${escapeBackticks(e.message)}\` | See \`${e.file}\` for the call site. |\n`;
  }
  doc +=
    '\n**Recovery**: Inspect the mesh near the reported simplex for degenerate or inverted elements.\n\n';

  doc += '## Bubble Warnings\n\n';
  doc +=
    '`Bubble` also warns rather than throwing for singular mass matrices.\n\n';
  doc += '| Code | Message | Meaning |\n';
  doc += '|------|---------|---------|\n';
  for (const e of entries.filter((e) => e.code.startsWith('HOP_'))) {
    doc += `| \`${e.code}\` | \`${escapeBackticks(e.message)}\` | See \`${e.file}\` for the call site. |\n`;
  }
  doc += FOOTER;
  return doc;
}

const entries = collectEntries();
const want = buildDoc(entries);
const have = readFileSync('docs/exceptions.md', 'utf8');

if (CHECK) {
  if (want !== have) {
    console.error('docs/exceptions.md: stale (would update)');
    process.exit(2);
  }
  console.log('docs/exceptions.md: in sync');
} else {
  if (want !== have) {
    writeFileSync('docs/exceptions.md', want);
    console.log('docs/exceptions.md: regenerated');
  } else {
    console.log('docs/exceptions.md: already in sync');
  }
}
