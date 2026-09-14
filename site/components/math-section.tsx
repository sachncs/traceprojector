import { ArrowDown, ChevronRight, Sigma, Workflow } from "lucide-react";

import { Reveal, RevealStagger } from "@/components/motion/reveal";

const DECOMPOSITION = [
  {
    label: "Π_∂ˡ",
    name: "Boundary projector",
    body: "Prescribes the boundary data exactly. Built on Alfeld (boundary faces) or Worsey–Farin (bulk tet) splits.",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/30",
  },
  {
    label: "Π_ringˡ",
    name: "Interior projector",
    body: "Stable local problem with vanishing trace on the boundary. Decouples from boundary geometry.",
    color: "text-accent",
    bg: "bg-accent/10 border-accent/30",
  },
];

const CASCADE = [
  {
    eq: "ζ⁰₀,ᵥ",
    space: "P¹",
    note: "eq. 6.25 — vertex scalar duality",
  },
  {
    eq: "ζ¹₀,ₑ",
    space: "N₀",
    note: "eq. 6.31 — Whitney edge tangential",
  },
  {
    eq: "ζ²₀,ƒ",
    space: "RT₀",
    note: "eq. 6.36 — Raviart–Thomas face flux",
  },
];

const COMMUTES = [
  "grad Π⁰ = Π¹ grad",
  "curl Π¹ = Π² curl",
  "div Π² = Π³ div",
];

export function MathSection() {
  return (
    <section
      id="architecture"
      className="relative scroll-mt-24 border-t border-border/40 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Architecture
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
              Built on a clean decomposition.
            </h2>
            <p className="mt-5 text-base text-muted-foreground sm:text-lg">
              Every projector splits into a boundary-preserving part and an
              interior ring part. Both are computed in stable local solves on
              Alfeld- or Worsey–Farin-subdivided patches — no global system,
              no iterative refinement.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="mx-auto mt-14 max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-10 backdrop-blur-md sm:p-14">
            <div
              className="pointer-events-none absolute inset-0 bg-aurora opacity-30"
              aria-hidden
            />
            <div className="relative flex flex-col items-center gap-5 sm:gap-6">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                The master equation
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">
                <span className="text-foreground">Πˡ</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-primary">Π_∂ˡ</span>
                <span className="text-muted-foreground">+</span>
                <span className="text-accent">Π_ringˡ</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-foreground">(I − Π_∂ˡ)</span>
              </div>
              <p className="mt-3 max-w-xl text-center text-sm text-muted-foreground">
                Π_∂ˡ prescribes the boundary data exactly. Π_ringˡ is the
                interior projector with vanishing trace. Together they form a
                single, commuting, bounded operator.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-5xl gap-4 lg:grid-cols-2">
          {DECOMPOSITION.map((d, i) => (
            <Reveal key={d.label} delay={0.12 + i * 0.06}>
              <div
                className={`relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border font-mono text-base ${d.bg} ${d.color}`}
                  >
                    {d.label.replace("Π", "Π")}
                  </div>
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {d.name}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {d.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-4 lg:grid-cols-2">
          <Reveal delay={0.2}>
            <div className="h-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sigma className="h-4 w-4 text-primary" />
                Boundary weight cascade
              </div>
              <RevealStagger
                delay={0.25}
                gap={0.04}
                className="mt-5 space-y-1"
              >
                {CASCADE.map((c, i) => (
                  <div
                    key={c.eq}
                    className="rounded-lg border border-border/40 bg-background/40 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-mono text-sm text-foreground">
                        <ChevronRight className="h-3.5 w-3.5 text-primary" />
                        {c.eq}{" "}
                        <span className="text-muted-foreground">on</span>{" "}
                        <span className="text-accent">{c.space}</span>
                      </div>
                      {i < CASCADE.length - 1 && (
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </div>
                    <p className="mt-1.5 pl-5 text-xs text-muted-foreground">
                      {c.note}
                    </p>
                  </div>
                ))}
              </RevealStagger>
            </div>
          </Reveal>

          <Reveal delay={0.25}>
            <div className="h-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Workflow className="h-4 w-4 text-accent" />
                Commuting diagram
              </div>
              <RevealStagger
                delay={0.3}
                gap={0.05}
                className="mt-5 space-y-2"
              >
                {COMMUTES.map((c) => (
                  <div
                    key={c}
                    className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3 font-mono text-sm text-foreground"
                  >
                    <ChevronRight className="h-3.5 w-3.5 text-accent" />
                    {c}
                  </div>
                ))}
                <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
                  The discrete operators{" "}
                  <span className="font-mono text-foreground">
                    {"{grad, curl, div}"}
                  </span>{" "}
                  and the projectors{" "}
                  <span className="font-mono text-foreground">{"{Π⁰, Π¹, Π², Π³}"}</span>{" "}
                  commute term-by-term on every mesh.
                </p>
              </RevealStagger>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.3}>
          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
            Algorithm and analysis from{" "}
            <a
              href="https://arxiv.org/abs/2604.28103"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
            >
              Ern, Guzmán, Potu (2026) — arXiv:2604.28103
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
