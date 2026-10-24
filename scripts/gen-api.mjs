#!/usr/bin/env node
/**
 * Regenerates docs/api.md from the hand-written declaration files of the
 * public entry points in package.json ("exports"), so the reference lists
 * exactly what a consumer can import and nothing else. Run with `--check`
 * to exit non-zero when the file is stale.
 *
 * The declaration files are regular enough to scan without a compiler: a
 * statement is a run of text up to a `;` outside brackets, and a class or
 * interface body is a list of such statements, each optionally preceded by a
 * doc comment.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const CLASS_LIKE =
  /^export\s+(declare\s+)?(abstract\s+)?(class|interface)\b/;

/** Index of the matching closer for the opener at `i`, or -1. */
function matching(text, i) {
  const opens = '([{';
  let depth = 0;
  for (let k = i; k < text.length; k++) {
    const c = text[k];
    if (text.startsWith('/*', k)) {
      k = text.indexOf('*/', k + 2) + 1;
    } else if (text.startsWith('//', k)) {
      k = text.indexOf('\n', k);
      if (k < 0) return -1;
    } else if (c === '\'' || c === '"' || c === '`') {
      k = text.indexOf(c, k + 1);
    } else if (opens.includes(c)) {
      depth++;
    } else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/** End (exclusive) of the statement that starts at `i`. */
function statementEnd(text, i, allowBody) {
  for (let k = i; k < text.length; k++) {
    const c = text[k];
    if (text.startsWith('/*', k)) {
      k = text.indexOf('*/', k + 2) + 1;
    } else if (text.startsWith('//', k)) {
      k = text.indexOf('\n', k);
    } else if (c === '\'' || c === '"' || c === '`') {
      k = text.indexOf(c, k + 1);
    } else if (c === '(' || c === '[' || c === '{') {
      const close = matching(text, k);
      if (allowBody && c === '{') return close + 1;
      k = close;
    } else if (c === ';') {
      return k + 1;
    }
  }
  return text.length;
}

/** The statements of a block, each with the doc comment before it. */
function statements(text, bodyKinds) {
  const out = [];
  let i = 0;
  let doc = null;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
    } else if (text.startsWith('/**', i)) {
      const end = text.indexOf('*/', i + 3) + 2;
      doc = text.slice(i, end);
      i = end;
    } else if (text.startsWith('/*', i)) {
      i = text.indexOf('*/', i + 2) + 2;
    } else if (text.startsWith('//', i)) {
      i = text.indexOf('\n', i);
      if (i < 0) break;
    } else {
      const body = bodyKinds.test(text.slice(i, i + 80));
      const end = statementEnd(text, i, body);
      out.push({doc, text: text.slice(i, end).trim()});
      doc = null;
      i = end;
    }
  }
  return out;
}

const link = (s) => s.replace(/\{@link\s+([^}\s]+)[^}]*\}/g, '`$1`');

/** A doc comment as Markdown text: description, parameters, returns. */
function renderDoc(doc) {
  if (!doc) return '';
  const lines = doc.replace(/^\/\*\*|\*\/$/g, '').split('\n')
      .map((line) => line.replace(/^\s*\* ?/, '').trimEnd());
  const description = [];
  const tags = [];
  for (const line of lines) {
    const tag = line.match(/^@(\w+)\s*(.*)$/);
    if (tag) tags.push({name: tag[1], text: tag[2]});
    else if (tags.length) tags[tags.length - 1].text += ' ' + line.trim();
    else description.push(line);
  }
  const parts = [link(description.join('\n').trim())];
  const params = tags.filter((t) => t.name === 'param');
  if (params.length) {
    parts.push('**Parameters**\n\n' + params.map((t) => {
      const m = t.text.trim().match(/^(\S+)\s*-?\s*(.*)$/s);
      return `- \`${m[1]}\`: ${link(m[2].trim())}`;
    }).join('\n'));
  }
  const returns = tags.find(
      (t) => t.name === 'returns' || t.name === 'return');
  if (returns) parts.push('**Returns** ' + link(returns.text.trim()));
  return parts.filter(Boolean).join('\n\n');
}

const code = (s) => '```ts\n' + s + '\n```';
const oneLine = (s) => s.replace(/\s+/g, ' ');

/** The symbols a declaration file declares, and what it re-exports. */
function parseModule(file) {
  const text = readFileSync(file, 'utf8');
  const symbols = new Map();
  const reexports = [];
  for (const {doc, text: s} of statements(text, CLASS_LIKE)) {
    const re = s.match(/^export\s*\{([^}]*)\}\s*from\s*'([^']+)'/);
    if (re) {
      for (const name of re[1].split(',').map((n) => n.trim())) {
        if (!name) continue;
        reexports.push({
          name,
          from: resolve(dirname(file), re[2].replace(/\.js$/, '.d.ts')),
        });
      }
      continue;
    }
    const decl = s.match(/^export\s+(?:declare\s+)?(?:abstract\s+)?(class|interface|function|const|type)\s+([A-Za-z_$][\w$]*)/);
    if (!decl) continue;
    const [, kind, name] = decl;
    if (kind === 'function' && symbols.has(name)) {
      symbols.get(name).signatures.push({doc, text: s});
      continue;
    }
    const symbol = {kind, name, doc, header: '', members: [],
      signatures: [{doc, text: s}]};
    if (kind === 'class' || kind === 'interface') {
      const open = s.indexOf('{', s.search(/\bclass\b|\binterface\b/));
      symbol.header = s.slice(0, open).trim();
      symbol.members = statements(s.slice(open + 1, s.lastIndexOf('}')),
          /^$/).filter((m) => !/^(private|protected)\b/.test(m.text));
    }
    symbols.set(name, symbol);
  }
  return {symbols, reexports};
}

const cache = new Map();
function load(file) {
  if (!cache.has(file)) cache.set(file, parseModule(file));
  return cache.get(file);
}

/** The exports of an entry point, re-exports resolved, in source order. */
function exportsOf(file) {
  const {symbols, reexports} = load(file);
  const out = [...symbols.values()];
  for (const {name, from} of reexports) {
    const target = load(from).symbols.get(name);
    if (!target) throw new Error(`${name} is not declared in ${from}`);
    if (!out.includes(target)) out.push(target);
  }
  return out;
}

const METHOD = /^(?:readonly\s+|static\s+)*[A-Za-z_$][\w$]*\??\s*[(<]/;

function renderSymbol(symbol) {
  const lines = [`### \`${symbol.name}\``, ''];
  if (symbol.kind === 'class' || symbol.kind === 'interface') {
    lines.push(code(oneLine(symbol.header)), '');
    const doc = renderDoc(symbol.doc);
    if (doc) lines.push(doc, '');
    for (const m of symbol.members) {
      const name = m.text.match(
          /^(?:readonly\s+|static\s+)*([A-Za-z_$][\w$]*)/);
      const title = /^constructor\b/.test(m.text) ? 'constructor' :
        (name ? name[1] : m.text.slice(0, 20));
      const suffix = METHOD.test(m.text) ? '' : ' (property)';
      lines.push(`#### \`${title}\`${suffix}`, '',
          code(m.text.replace(/;$/, '')), '');
      const text = renderDoc(m.doc);
      if (text) lines.push(text, '');
    }
  } else {
    for (const sig of symbol.signatures) {
      lines.push(code(sig.text.replace(/^export\s+/, '').replace(/;$/, '')),
          '');
      const text = renderDoc(sig.doc);
      if (text) lines.push(text, '');
    }
  }
  return lines.join('\n');
}

function build() {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const entries = Object.entries(pkg.exports);
  const path = (sub) => (sub === '.' ? pkg.name :
    `${pkg.name}/${sub.slice(2)}`);
  const out = [
    '# API reference',
    '',
    'Generated by `npm run docs` from the declaration files (`.d.ts`) of the',
    'public entry points, so it lists what a consumer can import and nothing',
    'else. For which operator to use, see [Choosing an operator](operators.md).',
    '',
    '| Import path | Exports |',
    '|---|---|',
  ];
  for (const [sub, def] of entries) {
    const names = exportsOf(resolve(root, def.types)).map((s) => s.name);
    out.push(`| \`${path(sub)}\` | ${names.map((n) => `\`${n}\``).join(', ')} |`);
  }
  out.push('');
  const shown = new Set();
  for (const [sub, def] of entries) {
    out.push(`## \`${path(sub)}\``, '');
    for (const symbol of exportsOf(resolve(root, def.types))) {
      if (shown.has(symbol.name)) {
        out.push(`### \`${symbol.name}\``, '',
            `The same as [\`${symbol.name}\`](#${symbol.name.toLowerCase()})` +
            ' above.', '');
        continue;
      }
      shown.add(symbol.name);
      out.push(renderSymbol(symbol));
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

const next = build();
const target = resolve(root, 'docs/api.md');
if (CHECK) {
  if (readFileSync(target, 'utf8') !== next) {
    console.error('docs/api.md is stale: run npm run docs');
    process.exit(1);
  }
  console.log('docs/api.md is up to date');
} else {
  writeFileSync(target, next);
  console.log(`wrote docs/api.md (${next.split('\n').length} lines)`);
}
