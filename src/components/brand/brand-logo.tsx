'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — BrandLogo Component
//
// Centralized, theme-aware logo component that renders the correct
// official AcquisitionOS logo variant based on:
//   - Theme (light/dark) — auto-detected from next-themes
//   - Display size (sm, md, lg, xl)
//   - Variant (full wordmark, standalone symbol, app icon)
//   - Monochrome mode (for footer/loading screens)
//
// ASSET MAP:
//   /public/brand/logo-light.png       — 1316×234 horizontal logo for light backgrounds
//   /public/brand/logo-dark.png        — 1316×234 horizontal logo for dark backgrounds
//   /public/brand/logo-monochrome.png  — 1316×234 monochrome black horizontal logo
//   /public/brand/symbol.png           — 1024×1024 standalone brand symbol
//   /public/brand/app-icon-light.png   — 1024×1024 light app icon
//   /public/brand/app-icon-dark.png    — 1024×1024 dark app icon
//
// USAGE:
//   <BrandLogo />                          — full wordmark, auto theme, md size
//   <BrandLogo variant="symbol" />         — standalone symbol only
//   <BrandLogo variant="monochrome" />     — monochrome wordmark (footer)
//   <BrandLogo size="sm" />                — compact wordmark
//   <BrandLogo variant="symbol" size="xl" showText /> — symbol + text
//
// The component uses CSS to switch between light/dark variants based on
// the parent's theme class (.dark / .light). This avoids JavaScript
// theme detection and works with SSR.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export type BrandLogoVariant = 'full' | 'symbol' | 'monochrome' | 'app-icon';
export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  showText?: boolean;
  className?: string;
  /** Priority for Next.js Image optimization (use true for above-the-fold logos) */
  priority?: boolean;
  /** Accessible label. Defaults to "AcquisitionOS" */
  alt?: string;
  /** Clickable link href (renders as <a> instead of <div>) */
  href?: string;
  /** Aria-label for the link */
  linkAriaLabel?: string;
}

const SIZE_MAP: Record<BrandLogoSize, { height: number; textClass: string }> = {
  xs: { height: 20, textClass: 'text-sm font-semibold' },
  sm: { height: 28, textClass: 'text-base font-bold' },
  md: { height: 36, textClass: 'text-lg font-bold' },
  lg: { height: 44, textClass: 'text-xl font-bold' },
  xl: { height: 56, textClass: 'text-2xl font-bold' },
};

const SYMBOL_SIZE_MAP: Record<BrandLogoSize, { dimension: number }> = {
  xs: { dimension: 20 },
  sm: { dimension: 28 },
  md: { dimension: 36 },
  lg: { dimension: 44 },
  xl: { dimension: 56 },
};

/**
 * BrandLogo — renders the official AcquisitionOS logo with theme-aware
 * variant selection. Use this everywhere the brand identity appears.
 */
export function BrandLogo({
  variant = 'full',
  size = 'md',
  showText = false,
  className,
  priority = false,
  alt = 'AcquisitionOS',
  href,
  linkAriaLabel,
}: BrandLogoProps) {
  const sizeConfig = SIZE_MAP[size];
  const symbolConfig = SYMBOL_SIZE_MAP[size];

  // ── Standalone symbol (no wordmark) ───────────────────────────
  if (variant === 'symbol') {
    const symbolEl = (
      <Image
        src="/brand/symbol.png"
        alt={showText ? `${alt} symbol` : alt}
        width={symbolConfig.dimension}
        height={symbolConfig.dimension}
        priority={priority}
        className={cn('object-contain', className)}
      />
    );

    if (showText) {
      return (
        <BrandLink href={href} linkAriaLabel={linkAriaLabel}>
          <span className={cn('flex items-center gap-2', className)}>
            {symbolEl}
            <span className={cn('gradient-text', sizeConfig.textClass)}>
              AcquisitionOS
            </span>
          </span>
        </BrandLink>
      );
    }
    return (
      <BrandLink href={href} linkAriaLabel={linkAriaLabel}>
        {symbolEl}
      </BrandLink>
    );
  }

  // ── App icon variant ──────────────────────────────────────────
  if (variant === 'app-icon') {
    return (
      <BrandLink href={href} linkAriaLabel={linkAriaLabel}>
        <Image
          src="/brand/app-icon-light.png"
          alt={alt}
          width={symbolConfig.dimension}
          height={symbolConfig.dimension}
          priority={priority}
          className={cn('object-contain dark:hidden', className)}
        />
        <Image
          src="/brand/app-icon-dark.png"
          alt={alt}
          width={symbolConfig.dimension}
          height={symbolConfig.dimension}
          priority={priority}
          className={cn('hidden object-contain dark:block', className)}
        />
      </BrandLink>
    );
  }

  // ── Monochrome wordmark ───────────────────────────────────────
  if (variant === 'monochrome') {
    const aspectRatio = 1316 / 234; // logo dimensions
    const width = Math.round(sizeConfig.height * aspectRatio);
    return (
      <BrandLink href={href} linkAriaLabel={linkAriaLabel}>
        <Image
          src="/brand/logo-monochrome.png"
          alt={alt}
          width={width}
          height={sizeConfig.height}
          priority={priority}
          className={cn('object-contain', className)}
        />
      </BrandLink>
    );
  }

  // ── Full wordmark (default) — theme-aware ─────────────────────
  const aspectRatio = 1316 / 234; // logo dimensions
  const width = Math.round(sizeConfig.height * aspectRatio);
  return (
    <BrandLink href={href} linkAriaLabel={linkAriaLabel}>
      <span className={cn('inline-flex items-center', className)}>
        {/* Light logo — visible on light backgrounds */}
        <Image
          src="/brand/logo-light.png"
          alt={alt}
          width={width}
          height={sizeConfig.height}
          priority={priority}
          className="object-contain dark:hidden"
        />
        {/* Dark logo — visible on dark backgrounds */}
        <Image
          src="/brand/logo-dark.png"
          alt={alt}
          width={width}
          height={sizeConfig.height}
          priority={priority}
          className="hidden object-contain dark:block"
        />
      </span>
    </BrandLink>
  );
}

/** Helper: wrap content in a link if href is provided */
function BrandLink({
  href,
  linkAriaLabel,
  children,
}: {
  href?: string;
  linkAriaLabel?: string;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} aria-label={linkAriaLabel} className="inline-flex items-center">
      {children}
    </a>
  );
}

export default BrandLogo;
