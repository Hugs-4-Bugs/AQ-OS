import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Legal — AcquisitionOS',
  description: 'AcquisitionOS legal policies, terms, and agreements.',
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="container-app flex h-14 items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span className="text-lg font-bold gradient-text">AcquisitionOS</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" aria-label="Legal navigation">
            <a href="/legal/privacy" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Privacy
            </a>
            <a href="/legal/terms" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Terms
            </a>
            <a href="/legal/cookies" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Cookies
            </a>
            <a href="/legal/refund" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Refund
            </a>
            <a href="/legal/gdpr" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              GDPR
            </a>
            <a href="/legal/ai-disclaimer" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              AI
            </a>
            <a href="/legal/data-retention" className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Retention
            </a>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto">
        <div className="container-app px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} AcquisitionOS. All rights reserved.</p>
            <a href="/" className="hover:text-foreground transition-colors underline underline-offset-4">
              &larr; Back to Home
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
