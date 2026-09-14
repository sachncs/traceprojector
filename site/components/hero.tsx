"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Star,
  Terminal,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HeroMesh = dynamic(
  () => import("@/components/hero-mesh").then((m) => m.HeroMesh),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="h-72 w-72 animate-pulse-soft rounded-full bg-primary/20 blur-3xl" />
      </div>
    ),
  },
);

const STATS = [
  { k: "0", label: "Runtime deps", sub: "Pure ESM kernel" },
  { k: "4", label: "Form degrees", sub: "Π⁰ · Π¹ · Π² · Π³" },
  { k: "O(log N)", label: "Point location", sub: "Balanced AABB" },
  { k: "MIT", label: "License", sub: "Open source" },
];

export function Hero() {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section className="relative isolate overflow-hidden">
      {/* Aurora backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[820px] bg-aurora"
        aria-hidden
      />
      {/* Grid */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] bg-grid"
        aria-hidden
      />
      {/* 3D mesh layer */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] opacity-90"
        aria-hidden
      >
        <HeroMesh />
      </div>
      {/* Top/bottom masks to fade mesh into page */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-background to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-background to-transparent"
        aria-hidden
      />

      <div className="mx-auto flex min-h-[760px] max-w-7xl flex-col px-6 pb-20 pt-28 sm:pt-32 lg:pt-40">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <motion.div
            initial={mounted && !reduce ? { opacity: 0, y: 14 } : false}
            animate={mounted && !reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 backdrop-blur-md",
              "text-xs text-muted-foreground",
            )}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <Sparkles className="h-3 w-3 text-primary" />
            <span>
              v0.1.0 — Section 6.3 boundary-weight cascade is live
            </span>
            <ArrowRight className="h-3 w-3 opacity-50 transition-transform group-hover:translate-x-0.5" />
          </motion.div>

          <motion.h1
            initial={mounted && !reduce ? { opacity: 0, y: 22 } : false}
            animate={mounted && !reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.8,
              delay: 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "mt-7 text-balance font-display",
              "text-[clamp(2.5rem,7vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.035em]",
            )}
          >
            <span className="block">Trace-preserving</span>
            <span className="block text-gradient-aurora">
              finite-element projections
            </span>
          </motion.h1>

          <motion.p
            initial={mounted && !reduce ? { opacity: 0, y: 22 } : false}
            animate={mounted && !reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.8,
              delay: 0.16,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mx-auto mt-7 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            A small, dependency-free JavaScript reference implementation of{" "}
            <span className="font-mono text-foreground">Π⁰, Π¹, Π², Π³</span>{" "}
            for the 3D de Rham complex. Bounded, commuting, exact on the
            boundary. Built for engineers who care about the math.
          </motion.p>

          <motion.div
            initial={mounted && !reduce ? { opacity: 0, y: 18 } : false}
            animate={mounted && !reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.8,
              delay: 0.24,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button size="lg" className="h-11 rounded-full px-6" asChild>
              <Link href="/playground">
                Open the playground
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 rounded-full px-6"
              asChild
            >
              <a
                href="https://github.com/sachncs/traceprojector"
                target="_blank"
                rel="noreferrer"
              >
                <Star className="mr-1.5 h-4 w-4" />
                Star on GitHub
              </a>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 rounded-full px-5 text-muted-foreground"
              asChild
            >
              <a href="#install">
                <Terminal className="mr-1.5 h-4 w-4" />
                npm install traceprojector
              </a>
            </Button>
          </motion.div>

          <motion.div
            initial={mounted && !reduce ? { opacity: 0, y: 18 } : false}
            animate={mounted && !reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.8,
              delay: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-16 grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/40 text-left sm:grid-cols-4"
          >
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1.5 bg-card/60 px-5 py-5 backdrop-blur-md"
              >
                <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="font-mono text-2xl font-medium tracking-tight text-foreground">
                  {s.k}
                </dd>
                <dd className="text-[11px] text-muted-foreground/80">
                  {s.sub}
                </dd>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
