"use client";

import Link from "next/link";
import { ArrowRight, Star, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Capabilities", href: "#capabilities" },
  { label: "Architecture", href: "#architecture" },
  { label: "Playground", href: "/playground" },
  { label: "Docs", href: "https://github.com/sachncs/traceprojector#readme" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/40 bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-background/30 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <a
              href="https://github.com/sachncs/traceprojector"
              target="_blank"
              rel="noreferrer"
            >
              <Star className="mr-1.5 h-3.5 w-3.5" />
              Star
            </a>
          </Button>
          <Button size="sm" asChild className="rounded-full px-4">
            <Link href="/playground">
              Open playground
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <button
          type="button"
          className="md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1 px-6 py-4">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-full"
                asChild
              >
                <a
                  href="https://github.com/sachncs/traceprojector"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Star className="mr-1.5 h-4 w-4" />
                  Star
                </a>
              </Button>
              <Button size="sm" className="flex-1 rounded-full" asChild>
                <Link href="/playground">
                  Playground
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export function SiteHeaderPlain() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="rounded-full text-muted-foreground hover:text-foreground"
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
        </div>
      </div>
    </header>
  );
}
