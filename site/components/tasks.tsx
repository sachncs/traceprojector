import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { RECIPE_PAGES, pageHref } from "@/lib/docs";

/**
 * What a developer comes to do, in their words, each linked to the recipe that
 * shows it with code that runs. The slug must name a recipe: a missing one
 * stops the build instead of leaving a dead card.
 */
const TASKS: { slug: string; want: string; get: string }[] = [
  {
    slug: "quick-start",
    want: "Project a function onto finite elements",
    get: "Ten lines: a mesh, a function, the value at a point.",
  },
  {
    slug: "singular-field",
    want: "Handle data that is infinite at a point",
    get: "The canonical interpolation refuses it; the bounded operators stay finite.",
  },
  {
    slug: "gmsh-mesh",
    want: "Use a mesh from Gmsh",
    get: "Read an ASCII .msh file; anything unusable is an error that says why.",
  },
  {
    slug: "commuting",
    want: "Check that curl-free stays curl-free",
    get: "The residual of grad Π = Π grad, for both kinds of operator.",
  },
  {
    slug: "boundary-trace",
    want: "Keep the values on the boundary",
    get: "Which operators reproduce them, and which trade that for needing less.",
  },
  {
    slug: "refinement",
    want: "Refine only where it matters",
    get: "Bisect around a feature, keep the mesh conforming, watch the error fall.",
  },
];

const known = new Set(RECIPE_PAGES.map((p) => p.slug));
for (const task of TASKS) {
  if (!known.has(task.slug)) {
    throw new Error(`the landing page links to a recipe that does not exist: ${task.slug}`);
  }
}

export function Tasks() {
  return (
    <section
      id="recipes"
      className="relative scroll-mt-24 border-t border-border/40 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                What you can do
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                Start from the job, not the API.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every recipe is a short program that runs, shown with what it
                prints and what it costs. The test suite runs them, so they
                say what the library does today.
              </p>
            </div>
            <Link
              href="/recipes/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              All {RECIPE_PAGES.length} recipes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
        <RevealStagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map((task) => {
            const page = RECIPE_PAGES.find((p) => p.slug === task.slug)!;
            return (
              <Link
                key={task.slug}
                href={pageHref(page)}
                className="group block h-full rounded-xl border border-border/60 bg-card/40 p-5 transition-colors hover:border-primary/50 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{task.want}</span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{task.get}</p>
              </Link>
            );
          })}
        </RevealStagger>
      </div>
    </section>
  );
}
