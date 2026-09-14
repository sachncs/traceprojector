import Link from "next/link";
import { ArrowRight, GitFork, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";

export function FinalCTA() {
  return (
    <section
      id="cta"
      className="relative scroll-mt-24 overflow-hidden border-t border-border/40 py-28 sm:py-36"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-aurora opacity-60"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        aria-hidden
      />

      <div className="mx-auto max-w-5xl px-6 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            MIT licensed · Open source · v0.1.0
          </span>
          <h2 className="mt-6 text-balance font-display text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Ready to project?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Spin up the playground, pick a function, and watch the trace
            projectors do their thing on a live tetrahedral mesh — all in
            your browser, no install required.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="xl">
              <Link href="/playground">
                Open the playground
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <a
                href="https://github.com/sachncs/traceprojector"
                target="_blank"
                rel="noreferrer"
              >
                <Star className="mr-1.5 h-4 w-4" />
                Star on GitHub
              </a>
            </Button>
            <Button asChild size="xl" variant="ghost">
              <a
                href="https://github.com/sachncs/traceprojector/fork"
                target="_blank"
                rel="noreferrer"
              >
                <GitFork className="mr-1.5 h-4 w-4" />
                Fork it
              </a>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="text-primary">⌘</span> npm install
            traceprojector
          </p>
        </Reveal>
      </div>
    </section>
  );
}
