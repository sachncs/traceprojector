#!/usr/bin/env node
// Replaces the documented test count in docs/setup.md and
// docs/development.md with the live passing-test count from
// `npm test`.  Run with `--check` to exit non-zero if the docs are
// stale instead of overwriting.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const CHECK = process.argv.includes('--check')

function liveCount () {
  const out = execSync('npm test', { encoding: 'utf8' })
  const m = out.match(/(\d+) passing/)
  if (!m) throw new Error('Could not parse passing count from npm test output')
  return parseInt(m[1], 10)
}

function patch (path, pattern) {
  const before = readFileSync(path, 'utf8')
  const m = before.match(pattern)
  if (!m) {
    console.error(`${path}: pattern did not match; bailing`)
    process.exit(1)
  }
  const docCount = parseInt(m[2], 10)
  const count = liveCount()
  if (CHECK) {
    if (docCount !== count) {
      console.error(`${path}: stale (doc=${docCount}, live=${count})`)
      process.exit(2)
    }
    console.log(`${path}: in sync (count=${count})`)
    return
  }
  const after = before.replace(pattern, `$1${count}$3`)
  if (docCount === count) {
    console.log(`${path}: already in sync (count=${count})`)
    return
  }
  writeFileSync(path, after)
  console.log(`${path}: rewrote ${docCount} -> ${count}`)
}

patch('docs/setup.md', /(You should see all tests pass \()(\d+)( tests as of)/)
patch('docs/development.md', /(Mocha test suite \()(\d+)( tests)/)