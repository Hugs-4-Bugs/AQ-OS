import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
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
          <FeedbackProvider />
        </Providers>
      </body>
    </html>
  );
}
