// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Organization Branding Service
// Phase 6: Get/update org branding, apply CSS theme, validate domain
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────

export interface OrgBranding {
  primaryColor: string;
  accentColor: string;
  hideBranding: boolean;
  customLogo: string | null;
  customFavicon: string | null;
  customDomain: string | null;
  fontFamily: string | null;
}

export interface OrgBrandingUpdate {
  primaryColor?: string;
  accentColor?: string;
  hideBranding?: boolean;
  customLogo?: string | null;
  customFavicon?: string | null;
  customDomain?: string | null;
  fontFamily?: string | null;
}

interface DomainValidationResult {
  valid: boolean;
  dnsVerified: boolean;
  errors: string[];
  warnings: string[];
}

const DEFAULT_BRANDING: OrgBranding = {
  primaryColor: '#10b981', // emerald-500 (AcquisitionOS default)
  accentColor: '#8b5cf6', // violet-500
  hideBranding: false,
  customLogo: null,
  customFavicon: null,
  customDomain: null,
  fontFamily: null,
};

// Valid CSS color regex (simplified)
const CSS_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$|^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;

// Valid domain regex
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// ─── Public API ──────────────────────────────────────────────────

/**
 * Get organization branding settings
 */
export async function getOrgBranding(orgId: string): Promise<OrgBranding> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { branding: true },
  });

  if (!org || !org.branding) {
    return { ...DEFAULT_BRANDING };
  }

  try {
    const stored = JSON.parse(org.branding) as Partial<OrgBranding>;
    return { ...DEFAULT_BRANDING, ...stored };
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

/**
 * Update organization branding settings
 */
export async function updateOrgBranding(
  orgId: string,
  updates: OrgBrandingUpdate
): Promise<OrgBranding> {
  // Validate colors
  if (updates.primaryColor && !CSS_COLOR_REGEX.test(updates.primaryColor)) {
    throw new Error('Invalid primary color format. Use hex (#RRGGBB) or rgb() format.');
  }
  if (updates.accentColor && !CSS_COLOR_REGEX.test(updates.accentColor)) {
    throw new Error('Invalid accent color format. Use hex (#RRGGBB) or rgb() format.');
  }

  // Validate domain format
  if (updates.customDomain && updates.customDomain !== null) {
    if (!DOMAIN_REGEX.test(updates.customDomain)) {
      throw new Error('Invalid domain format. Use format: subdomain.example.com');
    }
  }

  // Get current branding
  const current = await getOrgBranding(orgId);
  const merged: OrgBranding = {
    ...current,
    ...updates,
  };

  // Save to database
  await db.organization.update({
    where: { id: orgId },
    data: {
      branding: JSON.stringify(merged),
      ...(updates.customDomain !== undefined && { customDomain: updates.customDomain }),
    },
  });

  return merged;
}

/**
 * Apply branding theme to UI as CSS custom properties
 * Call this on the client side to apply org-specific theming
 */
export function applyBrandingTheme(branding: OrgBranding): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Apply primary color
  if (branding.primaryColor) {
    root.style.setProperty('--brand-primary', branding.primaryColor);
    // Generate lighter/darker variants
    const hsl = hexToHSL(branding.primaryColor);
    if (hsl) {
      root.style.setProperty('--brand-primary-light', `hsl(${hsl.h}, ${hsl.s}%, ${Math.min(hsl.l + 15, 95)}%)`);
      root.style.setProperty('--brand-primary-dark', `hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 15, 10)}%)`);
    }
  }

  // Apply accent color
  if (branding.accentColor) {
    root.style.setProperty('--brand-accent', branding.accentColor);
  }

  // Apply font family
  if (branding.fontFamily) {
    root.style.setProperty('--brand-font-family', branding.fontFamily);
  }

  // Apply custom favicon
  if (branding.customFavicon) {
    updateFavicon(branding.customFavicon);
  }

  // Set branding flag
  root.setAttribute('data-branding-applied', 'true');
  if (branding.hideBranding) {
    root.setAttribute('data-hide-branding', 'true');
  } else {
    root.removeAttribute('data-hide-branding');
  }
}

/**
 * Remove branding theme (reset to defaults)
 */
export function removeBrandingTheme(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.removeProperty('--brand-primary');
  root.style.removeProperty('--brand-primary-light');
  root.style.removeProperty('--brand-primary-dark');
  root.style.removeProperty('--brand-accent');
  root.style.removeProperty('--brand-font-family');
  root.removeAttribute('data-branding-applied');
  root.removeAttribute('data-hide-branding');

  // Reset favicon
  updateFavicon('/favicon.ico');
}

/**
 * Validate a custom domain's DNS configuration
 * In production, this would make a DNS lookup. For now, we do format + basic checks.
 */
export async function validateCustomDomain(
  domain: string,
  expectedCNAME?: string
): Promise<DomainValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let dnsVerified = false;

  // Format check
  if (!DOMAIN_REGEX.test(domain)) {
    errors.push('Invalid domain format. Use format: subdomain.example.com');
    return { valid: false, dnsVerified: false, errors, warnings };
  }

  // Reserved domains check
  const reservedDomains = ['acquisitionos.com', 'app.acquisitionos.com', 'localhost', '127.0.0.1'];
  if (reservedDomains.some(d => domain.endsWith(d))) {
    errors.push(`Domain "${domain}" is reserved and cannot be used as a custom domain`);
    return { valid: false, dnsVerified: false, errors, warnings };
  }

  // Length check
  if (domain.length > 253) {
    errors.push('Domain name exceeds maximum length of 253 characters');
  }

  // Label length check
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      errors.push(`Domain label "${label}" exceeds maximum length of 63 characters`);
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      errors.push(`Domain label "${label}" cannot start or end with a hyphen`);
    }
  }

  // DNS verification (simulated — in production would use DNS lookup)
  try {
    // In production: DNS.lookup(domain, 'CNAME') or fetch a DNS API
    // For now, we simulate a basic check
    if (expectedCNAME) {
      // Simulated: check if CNAME points to expected target
      dnsVerified = true; // In production, actual DNS check would set this
      warnings.push('DNS verification is simulated in development mode');
    } else {
      warnings.push('No expected CNAME target provided; DNS verification skipped');
    }
  } catch (e) {
    errors.push(`DNS lookup failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    dnsVerified,
    errors,
    warnings,
  };
}

// ─── Utility Functions ───────────────────────────────────────────

function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  // Parse hex color
  const match = hex.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  let color = match[1];
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('');
  }

  const r = parseInt(color.slice(0, 2), 16) / 255;
  const g = parseInt(color.slice(2, 4), 16) / 255;
  const b = parseInt(color.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function updateFavicon(url: string): void {
  if (typeof document === 'undefined') return;

  // Remove existing favicon
  const existing = document.querySelectorAll('link[rel*="icon"]');
  existing.forEach(el => el.remove());

  // Add new favicon
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = url;
  document.head.appendChild(link);
}
