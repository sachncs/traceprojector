#!/usr/bin/env node
// Regenerates docs/exceptions.md from the `code: '...'` string
// literals in traceprojector/**/*.js.  Each entry's message template
// is the next string literal on the same `onWarning({ code, ..., message: '...' })`
// call.  Run with `--check` to exit non-zero if the docs are stale.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const CHECK = process.argv.includes('--check')

function collectEntries () {
  const files = execSync(
    "rg --files traceprojector/ --glob '*.js'",
    { encoding: 'utf8' }
  ).trim().split('\n')

  const entries = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const re = /code:\s*'([A-Z_0-9]+)'[,\s\S]*?message:\s*(`[^`]+`|'[^']+')/g
    let m
    while ((m = re.exec(src)) !== null) {
      let msg = m[2]
      if (msg.startsWith('`')) msg = msg.slice(1, -1)
      else msg = msg.slice(1, -1)
      entries.push({ code: m[1], message: msg, file })
    }
  }
  return entries.sort((a, b) => a.code.localeCompare(b.code))
}

const HEADER = `# Error Taxonomy

This library uses a small hierarchy of custom error classes to provide actionable diagnostics.

## ValidateError

Thrown by \`Mesh\` (and mesh generators) when input data is geometrically or topologically invalid.

| Condition | Message pattern |
|-----------|-----------------|
| Empty tetrahedra array | \`Mesh must contain at least one tetrahedron\` |
| Non-finite vertex coordinate | \`Vertex ... contains non-finite value\` |
| Duplicate vertex indices in a tet | \`Tetrahedron ... contains duplicate vertex indices\` |
| Out-of-bounds vertex index | \`Tetrahedron ... references out-of-bounds vertex index\` |
| Non-integer tetrahedron index | \`Tetrahedron ... contains non-integer vertex index\` |
| Negative orientation (det <= 0) | \`Tetrahedron ... is degenerate or negatively oriented\` |

**Recovery**: Fix the input mesh data and re-instantiate \`Mesh\`.

## ProjectError

Thrown by \`Projector\` and projector classes when arguments are invalid or operations cannot proceed.

| Condition | Message pattern |
|-----------|-----------------|
| Invalid \`tIdx\` type | \`tIdx must be a non-negative integer\` |
| Out-of-range \`tIdx\` | \`tIdx ... is out of range\` |
| Invalid point type | \`point must be an array of 3 finite numbers\` |
| Point outside mesh | \`Point ... not found in mesh\` |
| Unimplemented higher-order vector projection | \`Higher-order vector projection (l=1 or l=2, p>0) is not yet implemented\` |

**Recovery**: Validate inputs before calling projection methods; ensure the point locator is built for global queries.

## SingularError

Thrown by linear algebra routines in \`utils.js\` when a matrix is singular or numerically rank-deficient.

| Condition | Message pattern |
|-----------|-----------------|
| Zero pivot during LU | \`Singular matrix encountered\` |
| Zero determinant in \`inverse3x3\` | \`Singular matrix encountered\` |
| Zero determinant in \`solve3x3\` | \`Singular matrix encountered\` |

**Recovery**: Check mesh validity (degenerate elements cause singular Jacobians) or verify the input matrix.

`

const FOOTER = `
**Recovery**: Ensure the tetrahedron has strictly positive volume.

## Solver Warnings

\`Solver\` warns on ill-conditioned local solves rather than throwing.

| Code | Message | Meaning |
|------|---------|---------|
| \`LOCAL_SOLVER_ILL_CONDITIONED\` | \`Solver: matrix is ill-conditioned (norm=...). Results may be inaccurate.\` | The local stiffness matrix is numerically ill-conditioned; the solve may be inaccurate. |

**Recovery**: Inspect the local star geometry for inverted or degenerate elements.

## Projector Warnings

\`Projector\` warns at construction if the mesh contains degenerate or near-degenerate tetrahedra.

| Code | Message | Meaning |
|------|---------|---------|
| \`TRACEPROJECTOR_DEGENERATE_MESH\` | \`Projector: mesh contains N degenerate or near-degenerate tetrahedra. Projections may fail.\` | The mesh has tetrahedra with signed volume below \`1e-12\`. |

**Recovery**: Re-mesh or repair the input mesh before computing projections.
`

function escapeBackticks (s) {
  return s.replace(/`/g, '\\`')
}

function buildDoc (entries) {
  let doc = HEADER

  doc += '## Weight Warnings\n\n'
  doc += '`Weight` logs warnings via an injected `warn` function rather than throwing, because per-vertex failures should not halt the entire computation.  Construct with `{ strict: true }` to opt into fail-fast behaviour: in that mode the same per-simplex failure path re-throws a `ProjectError` instead of emitting a warning.\n\n'
  doc += '| Code | Message | Meaning |\n'
  doc += '|------|---------|---------|\n'
  for (const e of entries.filter((e) => e.code.startsWith('BWC_'))) {
    doc += `| \`${e.code}\` | \`${escapeBackticks(e.message)}\` | See \`${e.file}\` for the call site. |\n`
  }
  doc += '\n**Recovery**: Inspect the mesh near the reported simplex for degenerate or inverted elements.\n\n'

  doc += '## Bubble Warnings\n\n'
  doc += '`Bubble` also warns rather than throwing for singular mass matrices.\n\n'
  doc += '| Code | Message | Meaning |\n'
  doc += '|------|---------|---------|\n'
  for (const e of entries.filter((e) => e.code.startsWith('HOP_'))) {
    doc += `| \`${e.code}\` | \`${escapeBackticks(e.message)}\` | See \`${e.file}\` for the call site. |\n`
  }
  doc += FOOTER
  return doc
}

const entries = collectEntries()
const want = buildDoc(entries)
const have = readFileSync('docs/exceptions.md', 'utf8')

if (CHECK) {
  if (want !== have) {
    console.error('docs/exceptions.md: stale (would update)')
    process.exit(2)
  }
  console.log('docs/exceptions.md: in sync')
} else {
  if (want !== have) {
    writeFileSync('docs/exceptions.md', want)
    console.log('docs/exceptions.md: regenerated')
  } else {
    console.log('docs/exceptions.md: already in sync')
  }
}