// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete GST/Tax Calculation Service
// Phase 5: Payments System
//
// Handles Indian GST compliance:
// - 18% GST for Indian users (country === 'IN')
// - Tax exemption for international users
// - CGST 9% + SGST 9% for intra-state (same state as merchant)
// - IGST 18% for inter-state (different state from merchant)
// - GST number validation (15-digit format)
// ═══════════════════════════════════════════════════════════════════

// ===== INTERFACES =====

export interface GSTCalculation {
  isIndianUser: boolean;
  subtotal: number;
  cgstRate: number;   // 0.09 for intra-state, 0 for inter-state/international
  cgstAmount: number;
  sgstRate: number;   // 0.09 for intra-state, 0 for inter-state/international
  sgstAmount: number;
  igstRate: number;   // 0.18 for inter-state, 0 for intra-state/international
  igstAmount: number;
  totalTax: number;
  total: number;
  taxExempt: boolean;
  gstNumber: string | null;
}

export interface GSTCalculationParams {
  subtotal: number;
  currency: string;
  isIndianUser: boolean;
  gstNumber?: string | null;
  billingState?: string;   // Customer's billing state code (e.g., 'MH', 'KA')
  merchantState?: string;  // Merchant's state code — default 'MH' (Maharashtra)
}

export interface GSTValidationResult {
  valid: boolean;
  error?: string;
}

// ===== CONSTANTS =====

/** GST rate for India — 18% */
const GST_RATE = 0.18;

/** CGST rate for intra-state — 9% */
const CGST_RATE = 0.09;

/** SGST rate for intra-state — 9% */
const SGST_RATE = 0.09;

/** IGST rate for inter-state — 18% */
const IGST_RATE = 0.18;

/** Merchant's default state (Maharashtra) */
const DEFAULT_MERCHANT_STATE = 'MH';

/**
 * GST number validation regex.
 * Format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric (not 0) + Z + 1 alphanumeric
 * Total: 15 characters
 */
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ===== CORE FUNCTIONS =====

/**
 * Calculate GST for a given subtotal.
 *
 * Rules:
 * - International users: tax exempt (0% GST)
 * - Indian users, intra-state (same state as merchant): CGST 9% + SGST 9%
 * - Indian users, inter-state (different state from merchant): IGST 18%
 * - If GST number is provided and valid, it's recorded for invoice purposes
 * - All amounts rounded to 2 decimal places
 */
export function calculateGST(params: GSTCalculationParams): GSTCalculation {
  const {
    subtotal,
    currency,
    isIndianUser,
    gstNumber,
    billingState,
    merchantState = DEFAULT_MERCHANT_STATE,
  } = params;

  // International users — tax exempt
  if (!isIndianUser) {
    return {
      isIndianUser: false,
      subtotal: round2(subtotal),
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      totalTax: 0,
      total: round2(subtotal),
      taxExempt: true,
      gstNumber: null,
    };
  }

  // Indian user — determine intra vs inter-state
  const isIntraState = billingState
    ? billingState.toUpperCase() === merchantState.toUpperCase()
    : false; // Default to inter-state if billing state unknown

  if (isIntraState) {
    // Intra-state: CGST 9% + SGST 9%
    const cgstAmount = round2(subtotal * CGST_RATE);
    const sgstAmount = round2(subtotal * SGST_RATE);
    const totalTax = round2(cgstAmount + sgstAmount);

    return {
      isIndianUser: true,
      subtotal: round2(subtotal),
      cgstRate: CGST_RATE,
      cgstAmount,
      sgstRate: SGST_RATE,
      sgstAmount,
      igstRate: 0,
      igstAmount: 0,
      totalTax,
      total: round2(subtotal + totalTax),
      taxExempt: false,
      gstNumber: gstNumber || null,
    };
  }

  // Inter-state: IGST 18%
  const igstAmount = round2(subtotal * IGST_RATE);

  return {
    isIndianUser: true,
    subtotal: round2(subtotal),
    cgstRate: 0,
    cgstAmount: 0,
    sgstRate: 0,
    sgstAmount: 0,
    igstRate: IGST_RATE,
    igstAmount,
    totalTax: igstAmount,
    total: round2(subtotal + igstAmount),
    taxExempt: false,
    gstNumber: gstNumber || null,
  };
}

/**
 * Validate a GST number format.
 *
 * GST number format: ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
 * - First 2 digits: State code (01-37)
 * - Next 5 chars: PAN number
 * - Next 4 digits: PAN sequence
 * - Next 1 char: PAN type
 * - Next 1 char: Alphanumeric (1-9 or A-Z)
 * - 'Z': Fixed character
 * - Last 1 char: Check digit (alphanumeric)
 */
export function validateGSTNumber(gstNumber: string): GSTValidationResult {
  if (!gstNumber || typeof gstNumber !== 'string') {
    return { valid: false, error: 'GST number is required' };
  }

  const trimmed = gstNumber.trim().toUpperCase();

  if (trimmed.length !== 15) {
    return { valid: false, error: `GST number must be 15 characters, got ${trimmed.length}` };
  }

  if (!GST_NUMBER_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid GST number format. Expected: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric',
    };
  }

  // Validate state code (first 2 digits must be 01-37)
  const stateCode = parseInt(trimmed.substring(0, 2), 10);
  if (stateCode < 1 || stateCode > 37) {
    return { valid: false, error: `Invalid state code in GST number: ${trimmed.substring(0, 2)}. Must be between 01 and 37.` };
  }

  return { valid: true };
}

/**
 * Determine if a user is Indian based on country code.
 * Returns true if country is 'IN' or India (case-insensitive).
 */
export function isIndianUser(country?: string | null): boolean {
  if (!country) return false;
  const upper = country.toUpperCase().trim();
  return upper === 'IN' || upper === 'IND';
}

/**
 * Format GST breakdown as a human-readable string.
 * Useful for invoice line items and receipts.
 */
export function formatGSTBreakdown(calc: GSTCalculation): string {
  if (calc.taxExempt) {
    return 'Tax Exempt (International User)';
  }

  if (calc.igstAmount > 0) {
    return `IGST @${(calc.igstRate * 100).toFixed(0)}%: ₹${calc.igstAmount.toFixed(2)}`;
  }

  const parts: string[] = [];
  if (calc.cgstAmount > 0) {
    parts.push(`CGST @${(calc.cgstRate * 100).toFixed(0)}%: ₹${calc.cgstAmount.toFixed(2)}`);
  }
  if (calc.sgstAmount > 0) {
    parts.push(`SGST @${(calc.sgstRate * 100).toFixed(0)}%: ₹${calc.sgstAmount.toFixed(2)}`);
  }

  return parts.join(' + ');
}

/**
 * Get the GST rate as a decimal for a given calculation.
 * Returns the effective GST rate (e.g., 0.18 for Indian users, 0 for international).
 */
export function getEffectiveGSTRate(calc: GSTCalculation): number {
  if (calc.taxExempt) return 0;
  if (calc.subtotal > 0) {
    return calc.totalTax / calc.subtotal;
  }
  return GST_RATE;
}

/**
 * Get the state code from a GST number.
 * Returns null if the GST number is invalid.
 */
export function getStateFromGSTNumber(gstNumber: string): string | null {
  const validation = validateGSTNumber(gstNumber);
  if (!validation.valid) return null;
  return gstNumber.trim().toUpperCase().substring(0, 2);
}

/**
 * Get the PAN from a GST number (characters 3-12).
 * Returns null if the GST number is invalid.
 */
export function getPANFromGSTNumber(gstNumber: string): string | null {
  const validation = validateGSTNumber(gstNumber);
  if (!validation.valid) return null;
  return gstNumber.trim().toUpperCase().substring(2, 12);
}

/**
 * Determine if a billing state is intra-state relative to merchant.
 */
export function isIntraState(
  billingState: string,
  merchantState: string = DEFAULT_MERCHANT_STATE
): boolean {
  return billingState.toUpperCase().trim() === merchantState.toUpperCase().trim();
}

/**
 * Get the tax type label for display purposes.
 */
export function getTaxTypeLabel(calc: GSTCalculation): string {
  if (calc.taxExempt) return 'Tax Exempt';
  if (calc.igstAmount > 0) return 'IGST';
  if (calc.cgstAmount > 0 && calc.sgstAmount > 0) return 'CGST + SGST';
  return 'No Tax';
}

/**
 * Build invoice tax line items from a GST calculation.
 */
export function getGSTInvoiceLines(calc: GSTCalculation): Array<{
  description: string;
  rate: number;
  amount: number;
}> {
  const lines: Array<{ description: string; rate: number; amount: number }> = [];

  if (calc.taxExempt) {
    lines.push({ description: 'Tax Exempt (International)', rate: 0, amount: 0 });
    return lines;
  }

  if (calc.igstAmount > 0) {
    lines.push({
      description: 'Integrated Goods and Services Tax (IGST)',
      rate: calc.igstRate,
      amount: calc.igstAmount,
    });
  }

  if (calc.cgstAmount > 0) {
    lines.push({
      description: 'Central Goods and Services Tax (CGST)',
      rate: calc.cgstRate,
      amount: calc.cgstAmount,
    });
  }

  if (calc.sgstAmount > 0) {
    lines.push({
      description: 'State Goods and Services Tax (SGST)',
      rate: calc.sgstRate,
      amount: calc.sgstAmount,
    });
  }

  if (lines.length === 0) {
    lines.push({ description: 'No Tax Applicable', rate: 0, amount: 0 });
  }

  return lines;
}

// ===== UTILITY =====

/** Round a number to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
