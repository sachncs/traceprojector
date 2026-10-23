/**
 * Checks that every module reachable from the package `exports` map declares
 * in its `.d.ts` exactly the value exports that the JavaScript module has,
 * so the shipped types cannot silently drift from the code.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

/** Value exports declared in a .d.ts file. */
function declaredNames (path, seen = new Set()) {
  if (seen.has(path)) return new Set()
  seen.add(path)
  const text = readFileSync(path, 'utf8')
  const names = new Set()
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|let|var|enum)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1])
  }
  for (const m of text.matchAll(/export\s*\{([^}]+)\}\s*(?:from\s*'([^']+)')?/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name)
    }
  }
  return names
}

let failed = false
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  const jsPath = resolve(root, entry.default)
  const dtsPath = resolve(root, entry.types)
  const actual = new Set(Object.keys(await import(pathToFileURL(jsPath))))
  const declared = declaredNames(dtsPath)
  const undeclared = [...actual].filter((n) => !declared.has(n))
  const phantom = [...declared].filter((n) => !actual.has(n))
  if (undeclared.length || phantom.length) {
    failed = true
    console.error(`${subpath}: undeclared in .d.ts: [${undeclared}]; declared but not exported: [${phantom}]`)
  } else {
    console.log(`${subpath}: ${actual.size} exports, declarations match`)
  }
}
if (failed) process.exit(1)
