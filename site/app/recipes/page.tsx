import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { RECIPE_PAGES, pageHref } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Recipes · traceprojector",
  description:
    "What you can do with traceprojector, as short programs that run: each one shows the code and what it prints.",
};

export default function RecipesHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <h1 className="text-4xl font-semibold tracking-tight">
          What can I do with it?
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Each recipe is a short program from the repository&apos;s{" "}
          <code>examples/</code> directory, with the output it prints. The test
          suite runs every one of them, so what you read here is what the
          library does today. Each says what it assumes of your data and what
          it costs.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {RECIPE_PAGES.map((page) => (
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
      </main>
      <SiteFooter />
    </div>
  );
}
