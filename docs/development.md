# Development Workflow

This repository follows a zero-config philosophy: every script is a single `npm run <command>` away.

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Lint | `npm run lint` | Check StandardJS style on source and tests |
| Lint Fix | `npm run lint:fix` | Auto-fix StandardJS violations |
| Test | `npm test` | Run the full Mocha test suite (214 tests) |
| Test Watch | `npm run test:watch` | Run tests in watch mode during development |
| Coverage | `npm run test:coverage` | Run tests with c8; outputs text, HTML, and lcov |
| Build | `npm run build` | Build Rollup bundles: ESM, CJS, UMD |
| Docs | `npm run docs` | Regenerate `docs/api.md` from JSDoc comments |
| Full Build | `npm run build:full` | Build + docs in one step |
| Web Dev | `npm run site:dev` | Start the Next.js 16 playground in `site/` |
| Web Build | `npm run site:build` | Build the Next.js 16 playground for production |

## Typical PR Workflow

1. Make changes in `traceprojector/` or `tests/`.
2. Run `npm run lint:fix` to auto-format.
3. Run `npm test` to verify behavior.
4. Run `npm run build` to ensure bundles compile.
5. Commit and push.

## Adding a New Test

Create a file in `tests/` ending in `.test.js`. Mocha will pick it up automatically.

```javascript
import { expect } from 'chai'
import { Mesh } from '../traceprojector/mesh.js'

describe('My new feature', () => {
  it('does something', () => {
    const mesh = new Mesh(...)
    expect(mesh.tetrahedronCount).to.equal(1)
  })
})
```

## Code Style

We follow the [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html),
enforced by ESLint with `eslint-config-google` (see `eslint.config.js`).
`npm run lint` checks; `npm run lint:fix` applies the automatic fixes.

Key rules:
- 2 spaces indentation, lines of at most 80 columns (long strings, template
  literals and regular expressions are exempt)
- Semicolons
- Single quotes
- Trailing commas in multi-line literals and calls
- No spaces inside braces of object literals and imports: `{a, b}`
- Camel case identifiers
