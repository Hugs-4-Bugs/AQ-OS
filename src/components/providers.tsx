'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';

function GlobalErrorFallback() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <span className="text-2xl">⚠️</span>
      </div>
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        The application encountered an unexpected error. Please refresh the page.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        Refresh Page
      </button>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        retry: 2,
      },
      mutations: {
        retry: 1,
      },
    },
  }));

  return (
    <ErrorBoundary fallback={<GlobalErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          // FIX (Part 7): enableSystem made first-visit follow the OS theme
          // (dark on dark OSes), overriding defaultTheme="light". Disabled so
          // the app defaults to light unless the user explicitly picks a theme
          // (saved in localStorage "acquisitionos-theme", still respected).
          enableSystem={false}
          storageKey="acquisitionos-theme"
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
