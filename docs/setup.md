# Setup

## Requirements

- Node.js >= 26
- npm >= 11

## Installation

### From npm (when published)

```bash
npm install traceprojector
```

### From source

```bash
git clone https://github.com/sachncs/traceprojector.git
cd traceprojector
npm install
```

## Verify Installation

```bash
npm test
```

You should see all tests pass (193 tests as of v0.1.0).

## Usage in a Project

### ESM (modern bundlers, Node.js)

```javascript
import { Mesh, Whitney, Projector } from 'traceprojector'

const mesh = new Mesh(vertices, tetrahedra)
const whitney = new Whitney(mesh)
const traceProjector = new Projector(mesh, whitney, { quadratureOrder: 3 })
```

### CommonJS (legacy Node.js)

```javascript
const { Mesh, Whitney, Projector } = require('traceprojector')
```

### Browser (UMD via CDN)

```html
<script src="https://cdn.jsdelivr.net/npm/traceprojector/dist/traceprojector.umd.js"></script>
<script>
  // The bundle exposes the canonical `window.TraceProjector` namespace and
  // also aliases each export to `window.*` for convenience:
  const { Mesh, Whitney, Projector } = window.TraceProjector;
  // ...or use the aliased top-level names:
  const p = new Projector(mesh, whitney, { quadratureOrder: 3 });
</script>
```

## TypeScript

Hand-written `.d.ts` files are included in `traceprojector/`. If your bundler does not resolve them automatically, add the package to your `tsconfig.json` `types` array or reference the declaration files directly.
