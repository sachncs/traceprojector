import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0c0a18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://sachncs.github.io/traceprojector"),
  title: {
    default:
      "traceprojector — Trace-preserving finite-element projections for the 3D de Rham complex",
    template: "%s — traceprojector",
  },
  description:
    "Bounded, commuting, discrete-trace preserving projections Π⁰, Π¹, Π², Π³ for the 3D de Rham complex on simplicial meshes. Pure JavaScript, zero runtime dependencies, MIT.",
  keywords: [
    "finite element method",
    "de Rham complex",
    "Whitney forms",
    "FEM",
    "projection operator",
    "Hodge star",
    "numerical analysis",
    "scientific computing",
    "traceprojector",
  ],
  authors: [{ name: "Sachin", url: "https://github.com/sachncs" }],
  creator: "Sachin",
  publisher: "traceprojector",
  openGraph: {
    type: "website",
    title: "traceprojector",
    description:
      "Bounded, commuting, discrete-trace preserving projections Π⁰, Π¹, Π², Π³ for the 3D de Rham complex.",
    siteName: "traceprojector",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "traceprojector",
    description:
      "Bounded, commuting, discrete-trace preserving projections Π⁰, Π¹, Π², Π³ for the 3D de Rham complex.",
    creator: "@sachncs",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${interTight.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
