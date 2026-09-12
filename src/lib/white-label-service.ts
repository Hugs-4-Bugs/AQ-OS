// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — White-Label Support Foundation
// Phase 6: Check white-label eligibility, apply overrides, custom domain
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getOrgBranding, applyBrandingTheme, removeBrandingTheme, type OrgBranding } from '@/lib/org-branding-service';

// ─── Types ───────────────────────────────────────────────────────

export interface WhiteLabelConfig {
  enabled: boolean;
  appName: string;
  customLogo: string | null;
  customFavicon: string | null;
  customDomain: string | null;
  emailFromName: string | null;
  emailFromAddress: string | null;
  emailTemplateCustomizations: {
    headerColor: string | null;
    footerText: string | null;
    supportEmail: string | null;
  };
  hideAcquisitionOSBranding: boolean;
}

export interface WhiteLabelOverrides {
  appName?: string;
  customLogo?: string | null;
  customFavicon?: string | null;
  customDomain?: string | null;
  emailFromName?: string | null;
  emailFromAddress?: string | null;
  emailTemplateCustomizations?: {
    headerColor?: string | null;
    footerText?: string | null;
    supportEmail?: string | null;
  };
  hideAcquisitionOSBranding?: boolean;
}

const DEFAULT_WHITE_LABEL_CONFIG: WhiteLabelConfig = {
  enabled: false,
  appName: 'AcquisitionOS',
  customLogo: null,
  customFavicon: null,
  customDomain: null,
  emailFromName: null,
  emailFromAddress: null,
  emailTemplateCustomizations: {
    headerColor: null,
    footerText: null,
    supportEmail: null,
  },
  hideAcquisitionOSBranding: false,
};

// White-label is only available on elite plan
const WHITE_LABEL_PLANS = ['elite'];

// ─── Public API ──────────────────────────────────────────────────

/**
 * Check if organization has white-label enabled (plan-based: elite only)
 */
export async function isWhiteLabelEnabled(orgId: string): Promise<boolean> {
  // Check organization's subscription plan
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });

  if (!org) return false;

  const owner = await db.user.findUnique({
    where: { id: org.ownerId },
    select: { plan: true },
  });

  if (!owner) return false;

  return WHITE_LABEL_PLANS.includes(owner.plan);
}

/**
 * Get white-label configuration for an organization
 */
export async function getWhiteLabelConfig(orgId: string): Promise<WhiteLabelConfig> {
  const enabled = await isWhiteLabelEnabled(orgId);

  if (!enabled) {
    return { ...DEFAULT_WHITE_LABEL_CONFIG, enabled: false };
  }

  // Get stored white-label config from org branding
  const branding = await getOrgBranding(orgId);

  // Check for stored white-label overrides in the org's branding JSON
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { branding: true, name: true, logo: true, customDomain: true },
  });

  if (!org) {
    return { ...DEFAULT_WHITE_LABEL_CONFIG, enabled: true };
  }

  // Parse any stored white-label overrides
  let storedOverrides: Partial<WhiteLabelOverrides> = {};
  try {
    const brandingData = org.branding ? JSON.parse(org.branding) : {};
    storedOverrides = brandingData.whiteLabel || {};
  } catch {
    // Ignore parse errors
  }

  return {
    enabled: true,
    appName: storedOverrides.appName || org.name || 'AcquisitionOS',
    customLogo: storedOverrides.customLogo ?? org.logo ?? null,
    customFavicon: storedOverrides.customFavicon ?? branding.customFavicon ?? null,
    customDomain: storedOverrides.customDomain ?? org.customDomain ?? null,
    emailFromName: storedOverrides.emailFromName ?? null,
    emailFromAddress: storedOverrides.emailFromAddress ?? null,
    emailTemplateCustomizations: {
      headerColor: storedOverrides.emailTemplateCustomizations?.headerColor ?? null,
      footerText: storedOverrides.emailTemplateCustomizations?.footerText ?? null,
      supportEmail: storedOverrides.emailTemplateCustomizations?.supportEmail ?? null,
    },
    hideAcquisitionOSBranding: storedOverrides.hideAcquisitionOSBranding ?? branding.hideBranding ?? false,
  };
}

/**
 * Apply white-label overrides to the UI
 * Call this on the client side when white-label is active
 */
export async function applyWhiteLabelOverrides(orgId: string): Promise<WhiteLabelConfig> {
  const config = await getWhiteLabelConfig(orgId);

  if (!config.enabled) {
    removeWhiteLabelOverrides();
    return config;
  }

  if (typeof document === 'undefined') return config;

  // Apply branding theme
  const branding: OrgBranding = {
    primaryColor: '', // Will use stored branding colors
    accentColor: '',
    hideBranding: config.hideAcquisitionOSBranding,
    customLogo: config.customLogo,
    customFavicon: config.customFavicon,
    customDomain: config.customDomain,
    fontFamily: null,
  };

  // Get full branding for colors
  const fullBranding = await getOrgBranding(orgId);
  branding.primaryColor = fullBranding.primaryColor;
  branding.accentColor = fullBranding.accentColor;
  branding.fontFamily = fullBranding.fontFamily;

  applyBrandingTheme(branding);

  // Apply app name overrides
  if (config.appName) {
    document.title = config.appName;

    // Update any elements showing "AcquisitionOS"
    const appNameElements = document.querySelectorAll('[data-app-name]');
    appNameElements.forEach(el => {
      el.textContent = config.appName;
    });
  }

  // Apply custom favicon
  if (config.customFavicon) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = config.customFavicon;
    // Remove existing
    document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
    document.head.appendChild(link);
  }

  // Set white-label flag on root
  document.documentElement.setAttribute('data-white-label', 'true');
  if (config.hideAcquisitionOSBranding) {
    document.documentElement.setAttribute('data-hide-platform-branding', 'true');
  }

  return config;
}

/**
 * Remove white-label overrides (reset to AcquisitionOS defaults)
 */
export function removeWhiteLabelOverrides(): void {
  if (typeof document === 'undefined') return;

  removeBrandingTheme();

  // Reset app name
  document.title = 'AcquisitionOS';
  const appNameElements = document.querySelectorAll('[data-app-name]');
  appNameElements.forEach(el => {
    el.textContent = 'AcquisitionOS';
  });

  // Reset favicon
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = '/favicon.ico';
  document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
  document.head.appendChild(link);

  // Remove flags
  document.documentElement.removeAttribute('data-white-label');
  document.documentElement.removeAttribute('data-hide-platform-branding');
}

/**
 * Resolve custom domain to organization
 * Used to look up which org a custom domain belongs to
 */
export async function resolveCustomDomain(domain: string): Promise<{
  orgId: string;
  orgName: string;
  whiteLabelConfig: WhiteLabelConfig;
} | null> {
  const org = await db.organization.findFirst({
    where: { customDomain: domain },
    select: { id: true, name: true },
  });

  if (!org) return null;

  const whiteLabelConfig = await getWhiteLabelConfig(org.id);

  return {
    orgId: org.id,
    orgName: org.name,
    whiteLabelConfig,
  };
}

/**
 * Update white-label configuration
 */
export async function updateWhiteLabelConfig(
  orgId: string,
  updates: WhiteLabelOverrides
): Promise<WhiteLabelConfig> {
  const enabled = await isWhiteLabelEnabled(orgId);

  if (!enabled) {
    throw new Error('White-label is only available on the Elite plan. Upgrade to enable custom branding.');
  }

  // Validate email format
  if (updates.emailFromAddress) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(updates.emailFromAddress)) {
      throw new Error('Invalid email format for emailFromAddress');
    }
  }

  // Validate domain format
  if (updates.customDomain) {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(updates.customDomain)) {
      throw new Error('Invalid domain format');
    }

    // Check domain uniqueness
    const existing = await db.organization.findFirst({
      where: {
        customDomain: updates.customDomain,
        NOT: { id: orgId },
      },
    });
    if (existing) {
      throw new Error('This custom domain is already in use by another organization');
    }
  }

  // Get current branding data
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { branding: true },
  });

  let brandingData: Record<string, unknown> = {};
  try {
    brandingData = org?.branding ? JSON.parse(org.branding) : {};
  } catch {
    brandingData = {};
  }

  // Merge white-label overrides into branding
  const currentWhiteLabel = (brandingData.whiteLabel || {}) as Record<string, unknown>;
  const updatedWhiteLabel = { ...currentWhiteLabel, ...updates };

  // Handle nested emailTemplateCustomizations
  if (updates.emailTemplateCustomizations) {
    updatedWhiteLabel.emailTemplateCustomizations = {
      ...((currentWhiteLabel.emailTemplateCustomizations as Record<string, unknown>) || {}),
      ...updates.emailTemplateCustomizations,
    };
  }

  brandingData.whiteLabel = updatedWhiteLabel;

  // Save to database
  await db.organization.update({
    where: { id: orgId },
    data: {
      branding: JSON.stringify(brandingData),
      ...(updates.customDomain !== undefined && { customDomain: updates.customDomain }),
      ...(updates.customLogo !== undefined && { logo: updates.customLogo }),
    },
  });

  return getWhiteLabelConfig(orgId);
}
