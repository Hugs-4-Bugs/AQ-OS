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

export const metadata: Metadata = {
  title: "AcquisitionOS — AI-Powered Client Acquisition System",
  description: "AcquisitionOS is the AI-powered client acquisition system that reveals hidden opportunities, automates outreach, and closes deals faster. Acquire smarter. Close faster. Dominate every market.",
  keywords: ["AcquisitionOS", "Client Acquisition", "AI Lead Intelligence", "Deal Intelligence", "Business Acquisition", "Sales Dashboard", "Pipeline Management", "CRM", "Outreach Automation"],
  icons: {
    icon: "/icon.svg",
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
      <head>
        <meta name="theme-color" content="#FFFFFF" />
        <meta property="og:title" content="AcquisitionOS — AI-Powered Client Acquisition System" />
        <meta property="og:description" content="AI-powered client acquisition that reveals opportunities, automates outreach, and closes deals." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AcquisitionOS — AI-Powered Client Acquisition" />
        <meta name="twitter:description" content="Acquire smarter. Close faster. Dominate every market." />
      </head>
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
