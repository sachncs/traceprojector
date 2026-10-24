import Link from "next/link";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import {
  SECTIONS,
  pageHref,
  type DocPage,
  type Heading,
} from "@/lib/docs";

const REPO = "https://github.com/sachncs/traceprojector";

function Sidebar({ current }: { current?: string }) {
  return (
    <nav aria-label="Documentation" className="space-y-7 text-sm">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.pages.map((page) => (
              <li key={page.slug}>
                <Link
                  href={pageHref(page)}
                  aria-current={page.slug === current ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1.5 transition-colors",
                    page.slug === current
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Toc({ headings, wide }: { headings: Heading[]; wide: boolean }) {
  const shown = headings.filter((h) => h.depth <= (wide ? 3 : 2));
  if (shown.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-[13px]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        On this page
      </p>
      <ul className="max-h-[70vh] space-y-1 overflow-y-auto border-l border-border/60 pr-2">
        {shown.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block py-0.5 text-muted-foreground transition-colors hover:text-foreground",
                h.depth === 2 ? "pl-3" : "pl-6",
              )}
            >
              {h.text.replace(/`/g, "")}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DocShell({
  page,
  html,
  headings,
  previous,
  next,
}: {
  page: DocPage;
  html: string;
  headings: Heading[];
  previous?: DocPage;
  next?: DocPage;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-6 py-10 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_220px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Sidebar current={page.slug} />
          </div>
        </aside>

        <main className="min-w-0">
          <details className="mb-6 rounded-lg border border-border/60 p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">
              All documentation
            </summary>
            <div className="mt-4">
              <Sidebar current={page.slug} />
            </div>
          </details>
          <article
            className="doc"
            // The Markdown is this repository's own documentation, rendered
            // at build time.
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
            <a
              href={`${REPO}/edit/master/${page.file}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit this page on GitHub
            </a>
            <div className="flex gap-3">
              {previous && (
                <Link
                  href={pageHref(previous)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 hover:bg-muted"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {previous.title}
                </Link>
              )}
              {next && (
                <Link
                  href={pageHref(next)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 hover:bg-muted"
                >
                  {next.title}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <Toc headings={headings} wide={page.slug !== "api"} />
          </div>
        </aside>
      </div>
      <SiteFooter />
    </div>
  );
}
