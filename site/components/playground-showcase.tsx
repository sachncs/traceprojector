"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Box, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { findFn } from "@/lib/functions";
import { buildProjector } from "@/lib/trace-bridge";

const MeshViewer = dynamic(
  () => import("@/components/mesh-viewer").then((m) => m.MeshViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Building tetrahedral mesh…
        </div>
      </div>
    ),
  },
);

export function PlaygroundShowcase() {
  const [projector, setProjector] = useState<ReturnType<
    typeof buildProjector
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      try {
        const bundle = buildProjector(4, 3);
        setProjector(bundle);
      } catch {
        /* swallow — UI shows fallback */
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const fn = useMemo(() => findFn("sincos"), []);

  return (
    <section
      id="playground"
      className="relative scroll-mt-24 border-t border-border/40 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-stretch gap-10 lg:grid-cols-12">
          <Reveal className="flex flex-col lg:col-span-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-md">
                <Play className="h-3 w-3 text-primary" />
                Live in browser
              </span>
            </div>

            <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
              Pick a function.
              <br />
              <span className="text-muted-foreground">
                Watch the projector do the math.
              </span>
            </h2>

            <p className="mt-5 text-base text-muted-foreground">
              The bundled playground runs the full library in your browser.
              Rotate the mesh, change the function, change the form degree,
              and watch the L² error converge as you refine the mesh.
            </p>

            <div className="mt-7 space-y-3">
              {[
                {
                  icon: Box,
                  title: "3D tetrahedral viewer",
                  body: "Inspect the projected field on a live rotating mesh.",
                },
                {
                  icon: Sparkles,
                  title: "Five canonical test functions",
                  body: "Sincos, quadratic, linear, trig, exponential.",
                },
                {
                  icon: ArrowRight,
                  title: "Convergence plot",
                  body: "L² error vs. mesh size, h = 1/n on the unit cube.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/30 p-4 backdrop-blur-md"
                >
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <f.icon className="h-4 w-4" strokeWidth={1.6} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {f.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {f.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild className="rounded-full" size="lg">
                <Link href="/playground">
                  Open the full playground
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                No install. Runs entirely in your browser.
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-8">
            <div className="relative h-full">
              <div
                className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/20 via-accent/15 to-transparent opacity-50 blur-md"
                aria-hidden
              />
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/40 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                    </div>
                    <div className="ml-2 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-zinc-400">
                      traceprojector / playground
                    </div>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    {fn.formula}
                  </span>
                </div>
                <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
                  <div className="absolute inset-0">
                    <MeshViewer
                      projector={projector?.projector ?? null}
                      functionId="sincos"
                      p={0}
                      form={0}
                      showEdges
                    />
                  </div>
                  <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/10 bg-zinc-950/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 backdrop-blur-md">
                    Drag to rotate · Scroll to zoom
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
