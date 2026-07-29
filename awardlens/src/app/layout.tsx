import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

/*
 * Three typefaces, three jobs, and no fourth.
 *
 *   Inter        every piece of interface text.
 *   Source Serif the document voice — quoted source passages, and nothing else.
 *                Loaded with italics because a quotation sometimes contains one.
 *   JetBrains    locators, dates, counts: anything that has to line up or be
 *                read back character by character.
 *
 * All three are variable fonts, which is what lets the type scale in
 * globals.css ask for 620 and 650 rather than rounding everything to 600/700.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Metric-matched fallback so the swap does not reflow the page.
  adjustFontFallback: true,
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "AwardLens — turn a grant award into an operating plan",
    template: "%s · AwardLens",
  },
  description:
    "Upload a grant agreement and get a source-linked register of deadlines, deliverables, restrictions and reporting requirements — with every item traced back to the page it came from.",
  openGraph: {
    title: "AwardLens",
    description:
      "Turn award letters and grant agreements into a source-linked register of deadlines, deliverables, restrictions and reporting requirements.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  width: "device-width",
  initialScale: 1,
  /*
   * The palette is light-only by design, and native controls have to agree.
   * Without this, a person whose OS is in dark mode gets dark date pickers,
   * dark <select> popups and dark scrollbars inside a warm ivory document
   * review tool — the one place a surprise inversion is most disorienting.
   */
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-popover"
        >
          Skip to content
        </a>
        {children}
        {/* Toasts are a floating layer, so they take the floating elevation. */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              borderRadius: "0.625rem",
              boxShadow: "var(--elevation-popover)",
              fontFamily: "var(--font-inter)",
              fontSize: "0.875rem",
              letterSpacing: "-0.002em",
            },
          }}
        />
      </body>
    </html>
  );
}
