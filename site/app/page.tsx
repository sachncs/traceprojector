import { CodePreview } from "@/components/code-preview";
import { Features } from "@/components/features";
import { FinalCTA } from "@/components/final-cta";
import { Hero } from "@/components/hero";
import { MathSection } from "@/components/math-section";
import { MetricsStrip } from "@/components/metrics-strip";
import { PlaygroundShowcase } from "@/components/playground-showcase";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ApiGlance } from "@/components/api-glance";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <CodePreview />
        <MathSection />
        <PlaygroundShowcase />
        <ApiGlance />
        <MetricsStrip />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}
