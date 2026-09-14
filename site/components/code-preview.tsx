"use client";

import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "install",
    label: "Install",
    filename: "terminal",
    code: `# Node 24+ (Node 26 recommended)
npm install traceprojector`,
  },
  {
    id: "project",
    label: "Project",
    filename: "trace.mjs",
    code: `import {
  Mesh, Whitney, Projector, generateUnitCubeMesh,
} from 'traceprojector'

const mesh    = generateUnitCubeMesh(4)
const whitney = new Whitney(mesh)

const projector = new Projector(mesh, whitney, { quadratureOrder: 3 })
projector.computeBoundaryWeights()
projector.buildLocator()

const u     = (p) => Math.sin(p[0]) * Math.cos(p[1]) * Math.exp(p[2])
const value = projector.projectH1(u, [0.5, 0.5, 0.5], 0)
console.log(value)  // ≈ 1.365`,
  },
  {
    id: "boundary",
    label: "Exact boundary",
    filename: "verify.mjs",
    code: `// Π⁰ reproduces u(v) at every boundary vertex,
// Π¹ reproduces ∫ₑ u·t ds at every boundary edge,
// Π² reproduces ∫f u·n dA at every boundary face.
projector.verifyBoundaryWeights()
// → no output: every weight reproduces its canonical DoF`,
  },
  {
    id: "browser",
    label: "Browser",
    filename: "index.html",
    code: `<script src="https://cdn.jsdelivr.net/npm/traceprojector/dist/traceprojector.umd.js"></script>
<script>
  const { Mesh, Whitney, Projector } = window.TraceProjector
  // ...same API as Node, zero build step
</script>`,
  },
];

export function CodePreview() {
  const [active, setActive] = useState(TABS[0]!.id);
  const [copied, setCopied] = useState(false);
  const tab = TABS.find((t) => t.id === active)!;
  const code = tab.code;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section
      id="install"
      className="relative scroll-mt-24 border-t border-border/40 py-28 sm:py-36"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-aurora-soft opacity-50"
        aria-hidden
      />

      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Get started
            </p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
              One{" "}
              <code className="font-mono text-primary">npm install</code>,
              <br />
              then the API is the math.
            </h2>
            <p className="mt-5 text-base text-muted-foreground">
              No build step. No transpiler. No peer-dep negotiation. Drop the
              lib into any Node 24+ project and call{" "}
              <code className="font-mono text-foreground">projectH1</code>,{" "}
              <code className="font-mono text-foreground">projectHcurl</code>,
              or{" "}
              <code className="font-mono text-foreground">projectHdiv</code> —
              the rest of the de Rham complex is just composition.
            </p>

            <ul className="mt-7 space-y-3 text-sm">
              {[
                "Pure ESM, ES2024 syntax — no Babel, no SWC",
                "CJS and UMD bundles ship on npm",
                "Hand-written .d.ts for every module",
                "Runs in the browser via the UMD bundle on jsDelivr",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 text-muted-foreground"
                >
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" className="rounded-full">
                <a
                  href="https://www.npmjs.com/package/traceprojector"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Terminal className="mr-1.5 h-4 w-4" />
                  View on npm
                </a>
              </Button>
              <a
                href="https://github.com/sachncs/traceprojector#readme"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Read the full guide →
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-7">
            <div className="relative">
              <div
                className="absolute -inset-px rounded-[18px] bg-gradient-to-br from-primary/30 via-accent/20 to-transparent opacity-60 blur-md"
                aria-hidden
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/40 px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                    </div>
                    <div className="ml-2 flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-zinc-400">
                      <Terminal className="h-3 w-3" />
                      {tab.filename}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={copy}
                    className="h-7 w-7 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    aria-label="Copy code"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                <div className="flex border-b border-white/5 bg-zinc-950/40">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActive(t.id)}
                      className={cn(
                        "relative px-4 py-2.5 text-[12px] font-medium transition-colors",
                        active === t.id
                          ? "text-foreground"
                          : "text-zinc-500 hover:text-zinc-300",
                      )}
                    >
                      {t.label}
                      {active === t.id && (
                        <span className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                      )}
                    </button>
                  ))}
                </div>

                <pre className="overflow-x-auto px-6 py-5 font-mono text-[13px] leading-relaxed text-zinc-100">
                  <code>
                    {code.split("\n").map((line, i) => (
                      <div key={i} className="flex gap-4">
                        <span className="select-none text-zinc-700">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 whitespace-pre">
                          {colorize(line)}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// Very lightweight syntax tint — keeps the file dependency-free.
function colorize(line: string): React.ReactNode {
  if (line.startsWith("#")) {
    return <span className="text-zinc-500">{line}</span>;
  }
  if (line.trim().startsWith("//")) {
    return <span className="text-zinc-500">{line}</span>;
  }

  const keywordRegex =
    /\b(import|from|const|let|var|function|return|new|await|async)\b/g;
  const stringRegex = /(['"`])(.*?)\1/g;
  const commentRegex = /(\/\/[^\n]*)/g;

  const tokens: Array<{ start: number; end: number; cls: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = keywordRegex.exec(line))) {
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      cls: "text-violet-300",
    });
  }
  keywordRegex.lastIndex = 0;

  while ((m = stringRegex.exec(line))) {
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      cls: "text-emerald-300",
    });
  }
  stringRegex.lastIndex = 0;

  while ((m = commentRegex.exec(line))) {
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      cls: "text-zinc-500",
    });
  }
  commentRegex.lastIndex = 0;

  tokens.sort((a, b) => a.start - b.start);

  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.start < cursor) continue;
    if (t.start > cursor) {
      out.push(line.slice(cursor, t.start));
    }
    out.push(
      <span key={i} className={t.cls}>
        {line.slice(t.start, t.end)}
      </span>,
    );
    cursor = t.end;
  }
  if (cursor < line.length) {
    out.push(line.slice(cursor));
  }
  return out;
}
