import { ArrowUpRight } from "lucide-react";

import { Reveal, RevealStagger } from "@/components/motion/reveal";

const API = [
  {
    sig: "new Projector(mesh, whitney, opts)",
    desc: "Orchestrates the four form-degree projectors and precomputes everything you need.",
  },
  {
    sig: "projector.projectH1(u, point, p)",
    desc: "Project onto P¹ at any point inside the unit cube. Returns the scalar field value.",
  },
  {
    sig: "projector.projectHcurl(u, point, p)",
    desc: "Project onto the Nédélec edge element space. Returns a 3-vector field.",
  },
  {
    sig: "projector.projectHdiv(u, point, p)",
    desc: "Project onto the Raviart–Thomas face element space. Returns a 3-vector field.",
  },
  {
    sig: "projector.projectL2(u, point, p)",
    desc: "Project onto cell-wise constants. Bounded in L² norm.",
  },
  {
    sig: "projector.projectAtPoint(u, point, p)",
    desc: "Project at any 3D point. AABB point location handled internally.",
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
                Six methods.
                <br />
                <span className="text-muted-foreground">Four form degrees.</span>
              </h2>
              <p className="mt-5 text-base text-muted-foreground">
                The whole public surface fits on a postcard. No event emitters,
                no stream lifecycle, no hidden state — every call is
                deterministic and side-effect-free.
              </p>
              <a
                href="https://github.com/sachncs/traceprojector/blob/master/docs/api.md"
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-1 text-sm text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
              >
                Read the full API reference
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
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
