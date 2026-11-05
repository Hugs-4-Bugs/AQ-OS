import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as RadixToaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { FeedbackProvider } from "@/components/feedback/feedback-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ── BRANDING METADATA ───────────────────────────────────────────────
// Official AcquisitionOS brand assets integrated into Next.js App Router
// metadata conventions. All favicons, platform icons, OG images and the
// web app manifest reference the official assets in /public/brand/,
// /public/favicon/, and /public/icons/.
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://acquisitionos.com";
const OG_IMAGE = `${SITE_URL}/brand/open-graph.png`;

export const metadata: Metadata = {
  title: {
    default: "AcquisitionOS — AI-Powered Client Acquisition System",
    template: "%s — AcquisitionOS",
  },
  description: "AcquisitionOS is the AI-powered client acquisition system that reveals hidden opportunities, automates outreach, and closes deals faster. Acquire smarter. Close faster. Dominate every market.",
  keywords: ["AcquisitionOS", "Client Acquisition", "AI Lead Intelligence", "Deal Intelligence", "Business Acquisition", "Sales Dashboard", "Pipeline Management", "CRM", "Outreach Automation"],
  applicationName: "AcquisitionOS",
  authors: [{ name: "AcquisitionOS" }],
  creator: "AcquisitionOS",
  publisher: "AcquisitionOS",
  // ── Favicons and platform icons ──────────────────────────────
  // Multiple PNG sizes + ICO + SVG + Apple Touch Icon.
  // The browser selects the best size automatically.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      // Android/PWA icons referenced by the manifest
      { url: "/icons/android-chrome-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/android-chrome-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  // ── Apple-specific metadata ───────────────────────────────────
  appleWebApp: {
    title: "AcquisitionOS",
    statusBarStyle: "default",
    capable: true,
  },
  // ── Web App Manifest ──────────────────────────────────────────
  manifest: "/manifest.webmanifest",
  // ── Open Graph metadata ───────────────────────────────────────
  openGraph: {
    title: "AcquisitionOS — AI-Powered Client Acquisition System",
    description: "AI-powered client acquisition that reveals opportunities, automates outreach, and closes deals. Acquire smarter. Close faster. Dominate every market.",
    type: "website",
    siteName: "AcquisitionOS",
    url: SITE_URL,
    images: [
      {
        url: "/brand/open-graph.png",
        width: 1200,
        height: 630,
        alt: "AcquisitionOS — AI-Powered Client Acquisition System",
        type: "image/png",
      },
    ],
  },
  // ── Twitter/X card metadata ───────────────────────────────────
  twitter: {
    card: "summary_large_image",
    title: "AcquisitionOS — AI-Powered Client Acquisition",
    description: "Acquire smarter. Close faster. Dominate every market.",
    images: ["/brand/open-graph.png"],
  },
  // ── Robots: do not expose auth/admin routes as public social preview
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

// RESPONSIVE VIEWPORT (responsive fix, Starter finalization Sep 2026):
// the root layout previously rendered NO <meta name="viewport"> tag at
// all. Mobile browsers therefore used a ~980px virtual layout viewport and
// zoomed the whole desktop layout out to fit the physical screen — the
// billing/pricing UI appeared as a tiny, squeezed multi-column layout on
// phones exactly as reported. `width=device-width` makes the layout
// viewport equal the device width so Tailwind breakpoints (sm/md/lg/xl)
// respond to the REAL device width; `initialScale=1` prevents the initial
// zoom-out. Interactive widgets (e.g. Razorpay overlays) also rely on a
// correct viewport. This is the standard Next.js App Router viewport
// configuration and does not alter any visual design on desktop.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // FIX 14: no hardcoded "dark" class — next-themes controls the theme
    // with defaultTheme="light" (providers.tsx). Existing users who chose
    // dark keep their stored preference via localStorage.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
          <RadixToaster />
          <FeedbackProvider />
        </Providers>
      </body>
    </html>
  );
}
