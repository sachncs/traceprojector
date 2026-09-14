import {
  Box,
  Code2,
  Cpu,
  GitBranch,
  Layers,
  Sigma,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  span?: "wide" | "tall";
  tag?: string;
  accent?: "violet" | "cyan" | "magenta" | "amber";
}

const FEATURES: Feature[] = [
  {
    icon: Layers,
    title: "Full 3D de Rham complex",
    body: "Π⁰ over H¹, Π¹ over H(curl), Π² over H(div), Π³ over L². The complete discrete de Rham complex, lowest order, lowest friction.",
    span: "wide",
    tag: "Core",
    accent: "violet",
  },
  {
    icon: Target,
    title: "Exact boundary traces",
    body: "Vertex values u(v), edge tangentials ∫_e u·t ds, and face normal fluxes ∫_f u·n dA reproduced to machine precision on every boundary simplex.",
    tag: "Section 6.3",
    accent: "cyan",
  },
  {
    icon: Sigma,
    title: "Boundary weight cascade",
    body: "Vertex, edge, and face duality functionals on P¹, N₀, and RT₀, built from the barycenter tent μ and the local mass matrix on each star.",
    tag: "Weights",
    accent: "magenta",
  },
  {
    icon: Box,
    title: "Zero runtime dependencies",
    body: "LU solve, 3×3 inverse, barycentric gradients, surface differential operators — every kernel routine is hand-rolled in pure JavaScript.",
    span: "tall",
    tag: "Kernel",
    accent: "amber",
  },
  {
    icon: Cpu,
    title: "AABB point location",
    body: "O(log N) point-in-tet queries after a one-time balanced tree build. Pick any point inside the unit cube and get the projected value in microseconds.",
    tag: "Performance",
    accent: "cyan",
  },
  {
    icon: Code2,
    title: "Higher-order enrichment",
    body: "Scalar bubble basis for H¹ (p ≥ 4) and an L² monomial basis for L² (p ≥ 1). Hand-written .d.ts for every module.",
    tag: "Extensibility",
    accent: "violet",
  },
];

const ACCENT_MAP = {
  violet: {
    bg: "from-primary/30 via-primary/5",
    icon: "text-primary",
    iconBg: "bg-primary/10 border-primary/30",
    glow: "bg-primary/15",
    line: "via-primary/40",
  },
  cyan: {
    bg: "from-accent/30 via-accent/5",
    icon: "text-accent",
    iconBg: "bg-accent/10 border-accent/30",
    glow: "bg-accent/15",
    line: "via-accent/40",
  },
  magenta: {
    bg: "from-fuchsia-400/25 via-fuchsia-400/5",
    icon: "text-fuchsia-300",
    iconBg: "bg-fuchsia-400/10 border-fuchsia-400/30",
    glow: "bg-fuchsia-400/15",
    line: "via-fuchsia-400/40",
  },
  amber: {
    bg: "from-amber-300/25 via-amber-300/5",
    icon: "text-amber-300",
    iconBg: "bg-amber-300/10 border-amber-300/30",
    glow: "bg-amber-300/15",
    line: "via-amber-300/40",
  },
} as const;

function FeatureCard({ feature }: { feature: Feature }) {
  const accent = ACCENT_MAP[feature.accent ?? "violet"];
  const Icon = feature.icon;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-sm",
        "transition-all duration-500 hover:border-border hover:bg-card/60",
        feature.span === "wide" && "sm:col-span-2",
        feature.span === "tall" && "sm:row-span-2",
      )}
    >
      {/* gradient sheen */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100",
          accent.bg,
        )}
        aria-hidden
      />
      {/* moving glow */}
      <div
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100",
          accent.glow,
        )}
        aria-hidden
      />
      {/* hairline accent at top */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
          accent.line,
        )}
        aria-hidden
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-md",
              accent.iconBg,
              accent.icon,
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.6} />
          </div>
          {feature.tag && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {feature.tag}
            </span>
          )}
        </div>

        <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground">
          {feature.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {feature.body}
        </p>

        <div
          className={cn(
            "mt-auto pt-6",
            feature.span === "tall" && "flex items-center gap-2 pt-8",
          )}
        >
          {feature.span === "tall" ? (
            <>
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <p className="text-xs text-muted-foreground">
                Hot-path code paths. Sub-millisecond per projection on 10k
                tetrahedra.
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              <GitBranch className="h-3 w-3" />
              <span>Verified by 192 unit tests</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function Features() {
  return (
    <section
      id="capabilities"
      className="relative scroll-mt-24 border-t border-border/40 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Capabilities
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
              Everything you need to project
              <br className="hidden sm:block" />{" "}
              <span className="text-muted-foreground">
                onto the discrete de Rham complex.
              </span>
            </h2>
            <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
              One library. Four form degrees. Three trace spaces. Zero
              transpilation. The same code runs in Node 24+, the browser, and
              the sandboxed playground.
            </p>
          </div>
        </Reveal>

        <RevealStagger
          delay={0.1}
          gap={0.06}
          className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
