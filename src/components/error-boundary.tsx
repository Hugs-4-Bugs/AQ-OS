'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Error Boundary Component
// Task 9: Improved with better error display, retry button,
// error detail toggle, and report functionality.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { AlertTriangle, RotateCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback React node */
  fallback?: React.ReactNode;
  /** Called when the error boundary catches an error */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Optional component name for error context */
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  retryCount: number;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Log to console for debugging
    console.error(
      `[ErrorBoundary${this.props.componentName ? ` <${this.props.componentName}>` : ''}] Caught:`,
      error,
      errorInfo
    );

    // Call the optional onError callback
    this.props.onError?.(error, errorInfo);

    // Report to observability if available (Sentry etc.)
    try {
      // Dynamic import to avoid issues if the module doesn't load
      import('@/lib/observability/sentry').then((mod) => {
        if (mod.captureException) {
          mod.captureException(error);
        }
      }).catch(() => {
        // Sentry module not available — that's fine
      });
    } catch {
      // Ignore
    }
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: prev.retryCount + 1,
    }));
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Allow custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails, retryCount } = this.state;
      const componentName = this.props.componentName || 'this component';

      return (
        <div className="flex flex-col items-center justify-center p-6 sm:p-8 min-h-[200px] text-center">
          {/* Icon */}
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold mb-1">
            Something went wrong
          </h3>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-1 max-w-sm">
            An unexpected error occurred in {componentName}.
          </p>

          {/* Error message */}
          {error?.message && (
            <p className="text-xs text-muted-foreground/80 mb-4 max-w-md font-mono bg-muted/50 rounded px-2 py-1">
              {error.message}
            </p>
          )}

          {retryCount > 0 && (
            <p className="text-xs text-amber-500 mb-3">
              This error has occurred {retryCount + 1} time{retryCount > 0 ? 's' : ''}.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mb-4">
            <Button onClick={this.handleRetry} className="gap-2">
              <RotateCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              className="text-xs text-muted-foreground"
            >
              Reload Page
            </Button>
          </div>

          {/* Expandable error details */}
          {errorInfo?.componentStack && (
            <div className="w-full max-w-lg">
              <button
                onClick={this.toggleDetails}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
              >
                {showDetails ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {showDetails ? 'Hide' : 'Show'} Error Details
              </button>

              {showDetails && (
                <pre className="mt-2 p-3 rounded-lg bg-muted/80 border text-[10px] sm:text-xs text-left overflow-auto max-h-48 text-muted-foreground">
                  <code>
                    {error?.toString()}
                    {'\n\n'}
                    {errorInfo.componentStack}
                  </code>
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
