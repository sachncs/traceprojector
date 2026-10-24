import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Reveal, RevealStagger } from "@/components/motion/reveal";

const API = [
  {
    sig: "new StableProjector(vertices, tetrahedra)",
    desc: "Bounded interior, exact boundary values. project(u, point, cell, l) evaluates the projection of a field at a point.",
  },
  {
    sig: "new BoundedCommutingProjector(vertices, tetrahedra)",
    desc: "Locally L²-bounded and commuting for every input; keeps no boundary values.",
  },
  {
    sig: "new CanonicalProjector(vertices, tetrahedra, { degree })",
    desc: "Interpolation onto Lagrange, Nédélec, Raviart–Thomas or discontinuous spaces of any degree.",
  },
  {
    sig: "new HigherOrderProjector(vertices, tetrahedra, { degree })",
    desc: "The Arnold–Guzmán projection: any degree, locally bounded, commuting for every L² field.",
  },
  {
    sig: "new Locator(mesh).findTetrahedron(point)",
    desc: "Point location in O(log N) after a one-time tree build. Returns the cell and the barycentric coordinates.",
  },
  {
    sig: "new Projector(mesh, whitney).projectAtPoint(u, point, l)",
    desc: "The canonical lowest-order projection with point location handled internally.",
  },
];

export function ApiGlance() {
  return (
    <section
      id="api"
      className="relative scroll-mt-24 border-t border-border/40 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                API surface
              </p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
                A small surface.
                <br />
                <span className="text-muted-foreground">Four form degrees.</span>
              </h2>
              <p className="mt-5 text-base text-muted-foreground">
                Pick the operator that gives the guarantees you need, then call
                project. No event emitters, no stream lifecycle — every call is
                deterministic.
              </p>
              <Link
                href="/docs/api/"
                className="mt-6 inline-flex items-center gap-1 text-sm text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
              >
                Read the full API reference
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="lg:col-span-8">
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30 backdrop-blur-md">
                <RevealStagger
                  delay={0.05}
                  gap={0.04}
                  className="divide-y divide-border/40"
                >
                  {API.map((item) => (
                    <div
                      key={item.sig}
                      className="group relative grid gap-2 px-5 py-4 transition-colors hover:bg-secondary/40 sm:grid-cols-12 sm:gap-6 sm:px-7 sm:py-5"
                    >
                      <code className="font-mono text-[13px] text-foreground sm:col-span-5">
                        {item.sig}
                      </code>
                      <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-7">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </RevealStagger>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
