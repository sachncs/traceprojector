# site/

Product landing page and live playground for **traceprojector**.

This is the source for the public marketing site (GitHub Pages). It is a
Next.js 16 + shadcn/ui + Three.js app that consumes the library via the
root npm workspace and ships as a fully static export.

## Structure

```
site/
  app/
    layout.tsx            Root layout, fonts, metadata
    page.tsx              Composed product landing page
    globals.css           Design system (tokens, utilities, motion)
    playground/page.tsx   Interactive playground (3D viewer + convergence)
  components/
    hero.tsx              Cinematic hero with live 3D mesh
    hero-mesh.tsx         Three.js procedural tetrahedral mesh
    features.tsx          Capability grid
    code-preview.tsx      Tabbed code sample with light syntax tint
    math-section.tsx      Architecture: master equation, cascade, commutativity
    playground-showcase.tsx  Embedded live mesh on the landing page
    api-glance.tsx        Six-method API surface
    metrics-strip.tsx     Credibility metrics
    final-cta.tsx         Closing CTA
    site-header.tsx       Sticky, scroll-aware header
    site-footer.tsx       Site footer with project links
    logo.tsx              Brand mark + wordmark
    motion/reveal.tsx     Scroll-triggered reveal primitives
    mesh-viewer.tsx       Playground mesh viewer (3D)
    convergence-chart.tsx Playground L² convergence plot
    code-preview.tsx      Playground code export
    ui/                   shadcn/ui primitives
  lib/
    functions.ts          Test functions (scalar, vector)
    trace-bridge.ts       Adapter for the traceprojector library
    format.ts             Number formatting + code snippet generator
    utils.ts              `cn` helper
  public/                 Favicon and static assets
  next.config.ts          Static export config
```

## Develop

From the repo root:

```bash
npm run site:dev     # http://localhost:3000
npm run site:build   # static export into site/out
```

The library is symlinked into this workspace as `"traceprojector": "file:.."`
from the root `package.json` `workspaces` field, so changes in
`traceprojector/` show up here without a rebuild.

## Deploy

The `.github/workflows/pages.yml` workflow runs `npm ci && npm run
site:build` on every push to `master`, then uploads `site/out` to GitHub
Pages.
