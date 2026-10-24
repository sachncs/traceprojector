import fs from "node:fs";
import path from "node:path";
import { Marked, type Tokens } from "marked";

import { basePath } from "@/lib/base-path";

const REPO = "https://github.com/sachncs/traceprojector";

/** The repository root: the site lives in `site/` inside it. */
const root = path.resolve(process.cwd(), "..");

export interface DocPage {
  slug: string;
  title: string;
  /** Path relative to the repository root. */
  file: string;
  summary: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const SECTIONS: DocSection[] = [
  {
    title: "Start here",
    pages: [
      {
        slug: "getting-started",
        title: "Getting started",
        file: "docs/getting-started.md",
        summary: "Install, project a field, check the result.",
      },
      {
        slug: "operators",
        title: "Choosing an operator",
        file: "docs/operators.md",
        summary: "Which projector to use, and what each one guarantees.",
      },
      {
        slug: "errors",
        title: "Errors and warnings",
        file: "docs/exceptions.md",
        summary: "Every typed error, what raises it, and how to handle it.",
      },
    ],
  },
  {
    title: "Reference",
    pages: [
      {
        slug: "api",
        title: "API reference",
        file: "docs/api.md",
        summary: "Every exported class and function.",
      },
      {
        slug: "performance",
        title: "Performance",
        file: "docs/performance.md",
        summary: "What the operators cost, and how to make them faster.",
      },
      {
        slug: "limits",
        title: "Limits",
        file: "docs/limits.md",
        summary: "What the library does not do, with the evidence.",
      },
    ],
  },
  {
    title: "Theory and evidence",
    pages: [
      {
        slug: "math",
        title: "Mathematical background",
        file: "docs/math.md",
        summary: "The complex, the spaces and the construction.",
      },
      {
        slug: "architecture",
        title: "Architecture",
        file: "docs/architecture.md",
        summary: "How the modules fit together.",
      },
      {
        slug: "validation",
        title: "Validation",
        file: "docs/VALIDATION.md",
        summary: "Each claim of the papers, tested, with its assumptions.",
      },
    ],
  },
  {
    title: "Contribute",
    pages: [
      {
        slug: "developer-guide",
        title: "Developer guide",
        file: "docs/developer-guide.md",
        summary: "Set up, test, release.",
      },
      {
        slug: "changelog",
        title: "Changelog",
        file: "CHANGELOG.md",
        summary: "What changed in each release.",
      },
    ],
  },
];

export const PAGES: DocPage[] = SECTIONS.flatMap((s) => s.pages);

const bySource = new Map(
  PAGES.map((p) => [path.posix.basename(p.file).toLowerCase(), p]),
);

export interface Heading {
  id: string;
  text: string;
  depth: number;
}

export interface RenderedDoc {
  page: DocPage;
  html: string;
  headings: Heading[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\x27/g, "&#39;");

/** Whether a link leaves the site (its host is not on github.io). */
function isExternal(href: string): boolean {
  if (!/^https?:/.test(href)) return false;
  try {
    return new URL(href).hostname !== "sachncs.github.io";
  } catch {
    return true;
  }
}

/** Where a link written in a Markdown file points on the site. */
function rewrite(href: string, from: DocPage): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [target, hash = ""] = href.split("#");
  const page = bySource.get(path.posix.basename(target).toLowerCase());
  if (page && target.endsWith(".md")) {
    return `${basePath}/docs/${page.slug}/${hash ? `#${hash}` : ""}`;
  }
  // A source file, test or script: it lives in the repository.
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(from.file), target),
  );
  return `${REPO}/blob/master/${resolved}${hash ? `#${hash}` : ""}`;
}

export function loadDoc(slug: string): RenderedDoc {
  const page = PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`no documentation page "${slug}"`);
  const source = fs.readFileSync(path.join(root, page.file), "utf8");
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this, token: Tokens.Heading) {
        const text = this.parser.parseInline(token.tokens);
        let id = slugify(token.text);
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        if (count) id = `${id}-${count}`;
        if (token.depth > 1) {
          headings.push({ id, text: token.text, depth: token.depth });
        }
        const safe = escapeHtml(id);
        return `<h${token.depth} id="${safe}"><a class="anchor" href="#${safe}" aria-label="Link to this section">#</a>${text}</h${token.depth}>\n`;
      },
      code(token: Tokens.Code) {
        const lang = (token.lang ?? "").split(/\s/)[0];
        return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(token.text)}</code></pre>\n`;
      },
      table(this, token: Tokens.Table) {
        const head = token.header
          .map(
            (c) => `<th>${this.parser.parseInline(c.tokens)}</th>`,
          )
          .join("");
        const body = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`)
                .join("")}</tr>`,
          )
          .join("");
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
      },
      link(this, token: Tokens.Link) {
        const href = rewrite(token.href, page);
        const external = isExternal(href);
        const text = this.parser.parseInline(token.tokens);
        return `<a href="${escapeHtml(href)}"${external ? ' rel="noreferrer" target="_blank"' : ""}>${text}</a>`;
      },
    },
  });
  const html = marked.parse(source, { async: false });
  return { page, html, headings };
}

export function neighbours(slug: string): {
  previous?: DocPage;
  next?: DocPage;
} {
  const i = PAGES.findIndex((p) => p.slug === slug);
  return { previous: PAGES[i - 1], next: PAGES[i + 1] };
}
