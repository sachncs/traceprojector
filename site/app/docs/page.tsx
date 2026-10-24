import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageHref, SECTIONS } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation · traceprojector",
  description:
    "Guides, reference and evidence for traceprojector: install it, choose an operator, read the mathematics and the validation.",
};

export default function DocsHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <h1 className="text-4xl font-semibold tracking-tight">Documentation</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Everything is on this site. Start with{" "}
          <Link
            href="/docs/getting-started/"
            className="text-primary underline-offset-4 hover:underline"
          >
            Getting started
          </Link>{" "}
          to project your first field, then read how to choose an operator,
          what each one guarantees, and the evidence behind those guarantees.
        </p>
        <div className="mt-12 space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {section.title}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.pages.map((page) => (
                  <Link
                    key={page.slug}
                    href={pageHref(page)}
                    className="group rounded-xl border border-border/60 bg-card/40 p-5 transition-colors hover:border-primary/50 hover:bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{page.title}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {page.summary}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
