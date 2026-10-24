import type { Metadata } from "next";

import { DocShell } from "@/components/doc-shell";
import { RECIPE_PAGES, loadDoc, neighbours } from "@/lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return RECIPE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = RECIPE_PAGES.find((p) => p.slug === slug);
  return {
    title: page ? `${page.title} · traceprojector` : "traceprojector",
    description: page?.summary,
  };
}

export default async function RecipeRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { page, html, headings } = loadDoc(slug, "recipes");
  return (
    <DocShell
      page={page}
      html={html}
      headings={headings}
      {...neighbours(slug, "recipes")}
    />
  );
}
