// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Image Optimization Utilities
// Phase 14.7: Responsive images, blur placeholders, lazy loading
// ═══════════════════════════════════════════════════════════════════

// ─── Next.js Image Configuration ──────────────────────────────────

export interface ImageConfig {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fill?: boolean;
}

/**
 * Generate optimized image configuration for Next.js Image component.
 */
export function getOptimizedImageConfig(config: ImageConfig): ImageConfig {
  return {
    ...config,
    quality: config.quality ?? 75,
    sizes: config.sizes ?? generateResponsiveSizes(),
    placeholder: config.placeholder ?? (config.blurDataURL ? 'blur' : 'empty'),
    priority: config.priority ?? false,
  };
}

// ─── Responsive Image Sizes Generator ─────────────────────────────

/**
 * Generate a responsive sizes string for different layout patterns.
 */
export function generateResponsiveSizes(pattern?: 'full-width' | 'card' | 'avatar' | 'sidebar' | 'hero'): string {
  switch (pattern) {
    case 'full-width':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px';
    case 'card':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
    case 'avatar':
      return '(max-width: 640px) 48px, (max-width: 1024px) 56px, 64px';
    case 'sidebar':
      return '(max-width: 1024px) 0vw, 240px';
    case 'hero':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, (max-width: 1440px) 70vw, 1200px';
    default:
      return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
  }
}

/**
 * Generate a srcset-compatible list of widths for responsive images.
 */
export function generateWidths(): number[] {
  return [320, 640, 750, 828, 1080, 1200, 1920];
}

// ─── Blur Placeholder Generator ───────────────────────────────────

/**
 * Generate a simple CSS-based blur placeholder data URL.
 * This creates a tiny gradient image that serves as a blur placeholder.
 *
 * For real images, use `plaiceholder` or similar at build time.
 * This provides a lightweight fallback for dynamic images.
 */
export function generateBlurPlaceholder(color1: string = '#6d28d9', color2: string = '#4c1d95'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color1}"/>
        <stop offset="100%" style="stop-color:${color2}"/>
      </linearGradient>
    </defs>
    <rect width="40" height="40" fill="url(#g)"/>
  </svg>`;

  // Convert SVG to base64 data URL
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg).toString('base64')
    : btoa(svg);

  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Generate a blur placeholder from image dimensions and dominant color.
 */
export function generateDominantColorPlaceholder(
  width: number = 40,
  height: number = 40,
  color: string = '#6d28d9',
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${color}"/>
  </svg>`;

  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg).toString('base64')
    : btoa(svg);

  return `data:image/svg+xml;base64,${base64}`;
}

// ─── Lazy Loading Configuration ───────────────────────────────────

export interface LazyLoadConfig {
  /** IntersectionObserver rootMargin (default: '200px 0px') */
  rootMargin?: string;
  /** IntersectionObserver threshold (default: 0.1) */
  threshold?: number;
  /** Whether to use native loading="lazy" (default: true) */
  nativeLazy?: boolean;
}

/**
 * Get recommended lazy loading configuration based on device capability.
 * Detects connection speed and adjusts accordingly.
 */
export function getLazyLoadConfig(): LazyLoadConfig {
  // Check for slow connection
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
    if (connection?.saveData) {
      // User has data saver on — be very aggressive with lazy loading
      return {
        rootMargin: '100px 0px',
        threshold: 0.01,
        nativeLazy: true,
      };
    }

    if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') {
      return {
        rootMargin: '100px 0px',
        threshold: 0.01,
        nativeLazy: true,
      };
    }
  }

  return {
    rootMargin: '200px 0px',
    threshold: 0.1,
    nativeLazy: true,
  };
}

// ─── Image Preload Helper ─────────────────────────────────────────

/**
 * Generate a <link rel="preload"> configuration for critical images.
 * Use for above-the-fold images that should be loaded immediately.
 */
export function getImagePreload(src: string, type: 'image/avif' | 'image/webp' | 'image/jpeg' | 'image/png' = 'image/webp'): {
  rel: string;
  href: string;
  as: string;
  type: string;
  fetchpriority: string;
} {
  return {
    rel: 'preload',
    href: src,
    as: 'image',
    type,
    fetchpriority: 'high',
  };
}

// ─── Responsive Background Image Helper ──────────────────────────

/**
 * Generate CSS for responsive background images using image-set().
 */
export function generateResponsiveBackgroundCSS(
  avifSrc: string,
  webpSrc: string,
  fallbackSrc: string,
): string {
  return `
    background-image: url('${fallbackSrc}');
    background-image: image-set(
      url('${avifSrc}') type('image/avif'),
      url('${webpSrc}') type('image/webp'),
      url('${fallbackSrc}') type('image/jpeg')
    );
  `.trim();
}
