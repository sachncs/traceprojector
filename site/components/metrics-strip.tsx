import { Gauge, ShieldCheck, Sparkles, Workflow } from "lucide-react";

import { Reveal, RevealStagger } from "@/components/motion/reveal";

const METRICS = [
  {
    kpi: "192",
    unit: "tests",
    label: "Passing test cases",
    sub: "Mocha + Chai across the full surface",
    icon: ShieldCheck,
    accent: "text-emerald-300",
    bg: "bg-emerald-400/10 border-emerald-400/30",
  },
  {
    kpi: "0",
    unit: "deps",
    label: "Runtime dependencies",
    sub: "Hand-rolled linear-algebra kernel",
    icon: Sparkles,
    accent: "text-amber-300",
    bg: "bg-amber-400/10 border-amber-400/30",
  },
  {
    kpi: "O(log N)",
    unit: "per query",
    label: "Point-in-tet lookup",
    sub: "Balanced AABB tree",
    icon: Gauge,
    accent: "text-primary",
    bg: "bg-primary/10 border-primary/30",
  },
  {
    kpi: "l = 0,1,2,3",
    unit: "form degrees",
    label: "Discrete de Rham complex",
    sub: "Π⁰ · Π¹ · Π² · Π³",
    icon: Workflow,
    accent: "text-accent",
    bg: "bg-accent/10 border-accent/30",
  },
];

export function MetricsStrip() {
  return (
    <section
      id="numbers"
      className="relative scroll-mt-24 border-t border-border/40 py-24 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                By the numbers
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                Small surface. Honest numbers.
              </h2>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Everything you need to evaluate traceprojector before you import
              it. No marketing gymnastics, no inflated benchmarks.
            </p>
          </div>
        </Reveal>

        <RevealStagger
          delay={0.08}
          gap={0.05}
          className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md transition-colors hover:border-border hover:bg-card/60"
            >
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${m.bg}`}
              >
                <m.icon className={`h-4 w-4 ${m.accent}`} strokeWidth={1.6} />
              </div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-4xl">
                  {m.kpi}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {m.unit}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                {m.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
            </div>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
