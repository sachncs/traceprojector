import Link from "next/link";
import { ArrowUpRight, Star, FileText } from "lucide-react";

import { Logo } from "@/components/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Playground", href: "/playground", external: false },
      {
        label: "npm package",
        href: "https://www.npmjs.com/package/traceprojector",
        external: true,
      },
      {
        label: "Source code",
        href: "https://github.com/sachncs/traceprojector",
        external: true,
      },
      {
        label: "Releases",
        href: "https://github.com/sachncs/traceprojector/releases",
        external: true,
      },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Getting started", href: "/docs/getting-started/", external: false },
      { label: "Choosing an operator", href: "/docs/operators/", external: false },
      { label: "API reference", href: "/docs/api/", external: false },
      { label: "Mathematical background", href: "/docs/math/", external: false },
      { label: "Validation", href: "/docs/validation/", external: false },
    ],
  },
  {
    title: "Reference",
    links: [
      {
        label: "Paper (arXiv)",
        href: "https://arxiv.org/abs/2604.28103",
        external: true,
      },
      { label: "Performance", href: "/docs/performance/", external: false },
      { label: "Limits", href: "/docs/limits/", external: false },
      { label: "Developer guide", href: "/docs/developer-guide/", external: false },
      { label: "Changelog", href: "/docs/changelog/", external: false },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border/40 bg-card/30">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-10">
        <div className="grid grid-cols-2 gap-10 lg:grid-cols-12">
          <div className="col-span-2 lg:col-span-5">
            <Logo size="lg" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Commuting, discrete-trace preserving projections for
              the 3D de Rham complex. Pure JavaScript, MIT-licensed, open
              source.
            </p>

            <div className="mt-7 flex items-center gap-2">
              <Link
                href="https://github.com/sachncs/traceprojector"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:border-border hover:text-foreground"
                aria-label="Star traceprojector on GitHub"
              >
                <Star className="h-3.5 w-3.5" />
                Star
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </Link>
              <Link
                href="https://arxiv.org/abs/2604.28103"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:border-border hover:text-foreground"
                aria-label="arXiv paper"
              >
                <FileText className="h-3.5 w-3.5" />
                arXiv
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </Link>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {col.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer" : undefined}
                      className="group inline-flex items-center gap-1 text-sm text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {link.label}
                      {link.external && (
                        <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-1">
            <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Legal
            </h2>
            <ul className="mt-5 space-y-3">
              <li>
                <Link
                  href="https://github.com/sachncs/traceprojector/blob/master/LICENSE"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                >
                  MIT License
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/sachncs/traceprojector/blob/master/SECURITY.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                >
                  Security
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/sachncs/traceprojector/blob/master/CODE_OF_CONDUCT.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                >
                  Code of Conduct
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-border/40 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© 2026 Sachin. Released under the MIT License.</p>
          <p className="font-mono">
            Built with Next.js · Three.js · zero runtime dependencies for the
            math kernel.
          </p>
        </div>
      </div>
    </footer>
  );
}
