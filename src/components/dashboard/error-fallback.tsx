'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reusable Error Fallback Component
// Task 9: Comprehensive Error Handling — NO SILENT ERRORS
//
// A visual error state component that can be used in any tab or
// section when an API call or data fetch fails. Provides:
// - Network error detection with distinct icon/color
// - Retry button
// - Customizable title, description, and styling
// - Compact mode for inline errors
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isNetworkError, getErrorFallbackMessage, ApiError } from '@/lib/api-error-handler';

interface ErrorFallbackProps {
  /** The error object to display */
  error?: Error | null;
  /** Callback when the user clicks "Try Again" */
  onRetry?: () => void;
  /** Override the default title */
  title?: string;
  /** Override the default description */
  description?: string;
  /** Additional CSS classes */
  className?: string;
  /** Force network error display */
  isNetworkError?: boolean;
  /** Compact mode — smaller icon, less padding, no button */
  compact?: boolean;
}

export default function ErrorFallback({
  error,
  onRetry,
  title,
  description,
  className,
  isNetworkError: forceNetworkError,
  compact = false,
}: ErrorFallbackProps) {
  const isNetwork = forceNetworkError || isNetworkError(error);
  const isServerError =
    error instanceof ApiError && error.status >= 500 && error.status < 600;

  // Determine icon
  const Icon = isNetwork ? WifiOff : isServerError ? ServerCrash : AlertTriangle;

  // Determine colors
  const iconBgColor = isNetwork
    ? 'bg-orange-500/10'
    : isServerError
      ? 'bg-red-500/10'
      : 'bg-amber-500/10';
  const iconTextColor = isNetwork
    ? 'text-orange-500'
    : isServerError
      ? 'text-red-500'
      : 'text-amber-500';

  // Determine text content
  const defaultTitle = isNetwork
    ? 'Connection Lost'
    : isServerError
      ? 'Server Error'
      : 'Something Went Wrong';

  const defaultDescription = isNetwork
    ? 'Please check your internet connection and try again.'
    : isServerError
      ? 'Our servers are having issues. Please try again in a moment.'
      : getErrorFallbackMessage(error);

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5',
          className
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', iconTextColor)} />
        <p className="text-sm text-muted-foreground flex-1 min-w-0 truncate">
          {description || error?.message || defaultDescription}
        </p>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-7 gap-1 text-xs shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div
        className={cn(
          'h-14 w-14 rounded-2xl flex items-center justify-center mb-4',
          iconBgColor
        )}
      >
        <Icon className={cn('h-7 w-7', iconTextColor)} />
      </div>

      <h3 className="text-lg font-semibold mb-1">
        {title || defaultTitle}
      </h3>

      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {description || defaultDescription}
      </p>

      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}
