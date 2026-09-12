// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Tax Edge Cases Handler
// Phase 4-5: Billing and Payment Gaps Remediation
//
// Tax calculation by country/region, GST for India (18%),
// VAT for EU, tax exemption support, reverse charge mechanism.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent } from '@/lib/billing-audit';

// ===== TYPES =====

export type TaxRegion = 'IN' | 'EU' | 'US' | 'GB' | 'AU' | 'CA' | 'SG' | 'OTHER';

export interface TaxCalculationParams {
  amount: number;
  currency: string;
  country: string;
  region?: string; // State/province
  gstNumber?: string;
  vatNumber?: string;
  taxExemptionCertificate?: string;
  isB2B?: boolean;
  plan: string;
  userId: string;
}

export interface TaxCalculationResult {
  success: boolean;
  taxRate: number;
  taxAmount: number;
  taxName: string;
  totalWithTax: number;
  isExempt: boolean;
  isReverseCharge: boolean;
  breakdown?: {
    cgst?: number;
    sgst?: number;
    igst?: number;
    vat?: number;
  };
  error?: string;
}

export interface TaxRateInfo {
  country: string;
  region?: string;
  rate: number;
  name: string;
  isActive: boolean;
}

// ===== TAX RATE DEFAULTS =====

// Default tax rates by country/region
const DEFAULT_TAX_RATES: Record<string, { rate: number; name: string }> = {
  IN: { rate: 0.18, name: 'GST' },
  'IN-EU': { rate: 0.18, name: 'IGST' }, // Interstate India
  EU: { rate: 0.21, name: 'VAT' }, // Average EU VAT
  GB: { rate: 0.20, name: 'VAT' },
  AU: { rate: 0.10, name: 'GST' },
  CA: { rate: 0.05, name: 'GST' }, // Federal only
  SG: { rate: 0.09, name: 'GST' },
  US: { rate: 0, name: 'Sales Tax' }, // Varies by state
  OTHER: { rate: 0, name: 'Tax' },
};

// EU VAT rates by country code
const EU_VAT_RATES: Record<string, number> = {
  AT: 0.20, BE: 0.21, BG: 0.20, HR: 0.25, CY: 0.19,
  CZ: 0.21, DK: 0.25, EE: 0.22, FI: 0.255, FR: 0.20,
  DE: 0.19, GR: 0.24, HU: 0.27, IE: 0.23, IT: 0.22,
  LV: 0.21, LT: 0.21, LU: 0.17, MT: 0.18, NL: 0.21,
  PL: 0.23, PT: 0.23, RO: 0.19, SK: 0.20, SI: 0.22,
  ES: 0.21, SE: 0.25,
};

// US state sales tax rates (major states)
const US_STATE_TAX_RATES: Record<string, number> = {
  CA: 0.0825, NY: 0.08, TX: 0.0625, FL: 0.06, IL: 0.0625,
  PA: 0.06, OH: 0.0575, GA: 0.04, NC: 0.0475, MI: 0.06,
};

// Indian GST rates by state (all 18% for SaaS)
const IN_IGST_RATE = 0.18;

// ===== CALCULATE TAX =====

export async function calculateTax(params: TaxCalculationParams): Promise<TaxCalculationResult> {
  try {
    const {
      amount,
      currency,
      country,
      region,
      gstNumber,
      vatNumber,
      taxExemptionCertificate,
      isB2B = false,
      userId,
    } = params;

    // Check for tax exemption first
    const exemptionCheck = await validateTaxExemption({
      country,
      isB2B,
      gstNumber,
      vatNumber,
      taxExemptionCertificate,
    });

    if (exemptionCheck.isExempt) {
      await logBillingEvent({
        userId,
        action: 'coupon_applied',
        details: `Tax exemption applied: ${exemptionCheck.reason}`,
        metadata: {
          action: 'tax_exempt',
          country,
          isB2B,
          reason: exemptionCheck.reason,
        },
      });

      return {
        success: true,
        taxRate: 0,
        taxAmount: 0,
        taxName: exemptionCheck.taxName || 'Tax Exempt',
        totalWithTax: amount,
        isExempt: true,
        isReverseCharge: false,
      };
    }

    // Get tax rate from database or defaults
    const taxRateInfo = await getTaxRate(country, region);

    if (taxRateInfo.rate === 0) {
      return {
        success: true,
        taxRate: 0,
        taxAmount: 0,
        taxName: taxRateInfo.name,
        totalWithTax: amount,
        isExempt: false,
        isReverseCharge: false,
      };
    }

    // Handle reverse charge for B2B in EU
    if (isB2B && vatNumber && isEUCountry(country)) {
      const reverseCharge = await handleReverseCharge({
        country,
        vatNumber,
        amount,
        isB2B,
        userId,
      });

      if (reverseCharge.isReverseCharge) {
        return {
          success: true,
          taxRate: taxRateInfo.rate,
          taxAmount: 0, // No tax collected — reverse charge
          taxName: taxRateInfo.name,
          totalWithTax: amount, // No tax added
          isExempt: false,
          isReverseCharge: true,
          breakdown: {
            vat: 0,
          },
        };
      }
    }

    // Calculate tax based on country
    const taxAmount = Math.round(amount * taxRateInfo.rate * 100) / 100;
    const totalWithTax = Math.round((amount + taxAmount) * 100) / 100;

    // Build breakdown for Indian GST
    let breakdown: TaxCalculationResult['breakdown'] = undefined;

    if (country === 'IN') {
      if (region && isIndianStateCode(region)) {
        // Intrastate: CGST + SGST
        const cgst = Math.round(taxAmount * 50) / 100;
        const sgst = Math.round(taxAmount * 50) / 100;
        breakdown = { cgst, sgst };
      } else {
        // Interstate: IGST
        breakdown = { igst: taxAmount };
      }
    } else if (isEUCountry(country)) {
      breakdown = { vat: taxAmount };
    }

    return {
      success: true,
      taxRate: taxRateInfo.rate,
      taxAmount,
      taxName: taxRateInfo.name,
      totalWithTax,
      isExempt: false,
      isReverseCharge: false,
      breakdown,
    };
  } catch (error) {
    console.error('[TaxService] Failed to calculate tax:', error);
    return {
      success: false,
      taxRate: 0,
      taxAmount: 0,
      taxName: 'Tax',
      totalWithTax: params.amount,
      isExempt: false,
      isReverseCharge: false,
      error: 'Failed to calculate tax',
    };
  }
}

// ===== GET TAX RATE =====

export async function getTaxRate(country: string, region?: string): Promise<TaxRateInfo> {
  try {
    // Try to get from database first
    const dbTaxRate = await db.taxRate.findFirst({
      where: {
        country,
        OR: [
          { region: region || null },
          { region: null },
        ],
        isActive: true,
      },
      orderBy: { region: 'desc' }, // Prefer specific region over null
    });

    if (dbTaxRate) {
      return {
        country: dbTaxRate.country,
        region: dbTaxRate.region || undefined,
        rate: dbTaxRate.rate,
        name: dbTaxRate.name,
        isActive: dbTaxRate.isActive,
      };
    }

    // Fall back to hardcoded defaults
    if (country === 'IN') {
      return { country, region, rate: IN_IGST_RATE, name: 'GST', isActive: true };
    }

    if (country === 'US' && region) {
      const stateRate = US_STATE_TAX_RATES[region.toUpperCase()] || 0;
      return { country, region, rate: stateRate, name: 'Sales Tax', isActive: true };
    }

    if (isEUCountry(country)) {
      const euRate = EU_VAT_RATES[country] || DEFAULT_TAX_RATES.EU.rate;
      return { country, rate: euRate, name: 'VAT', isActive: true };
    }

    const defaultRate = DEFAULT_TAX_RATES[country as keyof typeof DEFAULT_TAX_RATES] || DEFAULT_TAX_RATES.OTHER;
    return { country, rate: defaultRate.rate, name: defaultRate.name, isActive: true };
  } catch (error) {
    console.error('[TaxService] Failed to get tax rate:', error);
    return { country, rate: 0, name: 'Tax', isActive: false };
  }
}

// ===== VALIDATE TAX EXEMPTION =====

export async function validateTaxExemption(params: {
  country: string;
  isB2B: boolean;
  gstNumber?: string;
  vatNumber?: string;
  taxExemptionCertificate?: string;
}): Promise<{ isExempt: boolean; reason?: string; taxName?: string }> {
  const { country, isB2B, gstNumber, vatNumber, taxExemptionCertificate } = params;

  // If a tax exemption certificate is provided, mark as exempt
  if (taxExemptionCertificate) {
    return {
      isExempt: true,
      reason: 'Tax exemption certificate provided',
      taxName: 'Tax Exempt',
    };
  }

  // B2B transactions with valid GST in India — reverse charge, not exempt
  // But if the buyer is in a special economic zone (SEZ), they're exempt
  if (country === 'IN' && isB2B && gstNumber) {
    // SEZ units have GST exemption
    if (gstNumber.toUpperCase().includes('SEZ')) {
      return {
        isExempt: true,
        reason: 'SEZ unit — GST exempt under reverse charge',
        taxName: 'GST Exempt',
      };
    }
    // Regular B2B with GST is not exempt (reverse charge applies)
    return { isExempt: false };
  }

  // B2B EU cross-border with valid VAT — reverse charge applies, effectively exempt from our collection
  if (isEUCountry(country) && isB2B && vatNumber) {
    return { isExempt: false }; // Not exempt, but reverse charge applies
  }

  // US: No federal sales tax on SaaS; some states exempt SaaS
  if (country === 'US') {
    // Many US states don't tax SaaS — default to exempt
    return {
      isExempt: true,
      reason: 'SaaS is not taxable in most US jurisdictions',
      taxName: 'Sales Tax Exempt',
    };
  }

  return { isExempt: false };
}

// ===== HANDLE REVERSE CHARGE =====

export async function handleReverseCharge(params: {
  country: string;
  vatNumber: string;
  amount: number;
  isB2B: boolean;
  userId: string;
}): Promise<{ isReverseCharge: boolean; reason?: string }> {
  const { country, vatNumber, isB2B, userId } = params;

  // Reverse charge applies for B2B cross-border transactions in the EU
  if (isEUCountry(country) && isB2B && vatNumber) {
    // In a production system, we would validate the VAT number using VIES
    // For now, we accept the VAT number as valid
    const isValidVat = vatNumber.length >= 8; // Basic validation

    if (isValidVat) {
      await logBillingEvent({
        userId,
        action: 'coupon_applied',
        details: `Reverse charge mechanism applied for EU B2B transaction`,
        metadata: {
          action: 'reverse_charge',
          country,
          vatNumber: vatNumber.slice(0, 4) + '***', // Partially mask for security
        },
      });

      return {
        isReverseCharge: true,
        reason: 'Reverse charge applies — buyer accounts for VAT in their EU member state',
      };
    }
  }

  // Indian B2B with GST — reverse charge doesn't apply to SaaS by default
  // but IGST is charged and can be claimed as input tax credit
  if (country === 'IN' && isB2B) {
    return { isReverseCharge: false };
  }

  return { isReverseCharge: false };
}

// ===== HELPER: IS EU COUNTRY =====

function isEUCountry(countryCode: string): boolean {
  return countryCode in EU_VAT_RATES;
}

// ===== HELPER: IS INDIAN STATE CODE =====

function isIndianStateCode(code: string): boolean {
  const indianStates = [
    'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA',
    'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH',
    'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ', 'SK',
    'TG', 'TN', 'TR', 'UK', 'UP', 'WB',
  ];
  return indianStates.includes(code.toUpperCase());
}

// ===== SEED TAX RATES =====

export async function seedTaxRates(): Promise<{ seeded: number; errors: number }> {
  let seeded = 0;
  let errors = 0;

  const rates = [
    { country: 'IN', region: null, rate: 0.18, name: 'GST' },
    { country: 'GB', region: null, rate: 0.20, name: 'VAT' },
    { country: 'AU', region: null, rate: 0.10, name: 'GST' },
    { country: 'SG', region: null, rate: 0.09, name: 'GST' },
    { country: 'CA', region: null, rate: 0.05, name: 'GST' },
    // EU countries
    ...Object.entries(EU_VAT_RATES).map(([country, rate]) => ({
      country,
      region: null,
      rate,
      name: 'VAT',
    })),
  ];

  for (const rate of rates) {
    try {
      await db.taxRate.upsert({
        where: {
          country_region: {
            country: rate.country,
            region: rate.region || '',
          },
        },
        create: rate,
        update: { rate: rate.rate, name: rate.name },
      });
      seeded++;
    } catch (error) {
      console.error(`[TaxService] Failed to seed tax rate for ${rate.country}:`, error);
      errors++;
    }
  }

  return { seeded, errors };
}
