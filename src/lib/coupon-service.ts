// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Coupon Architecture
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logCouponEvent } from '@/lib/billing-audit';
import { type PlanType } from '@/lib/entitlement-service';

// ===== INTERFACES =====

export interface CouponValidationResult {
  valid: boolean;
  coupon: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
    maxUses: number | null;
    usedCount: number;
    expiresAt: Date | null;
    applicablePlans: string[];
    active: boolean;
  } | null;
  discountAmount: number;
  error?: string;
}

export interface CouponApplicationResult {
  discountAmount: number;
  finalAmount: number;
  originalAmount: number;
}

export interface CreateCouponParams {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxUses?: number;
  expiresAt?: Date;
  applicablePlans?: PlanType[];
  active?: boolean;
}

export interface CreateCouponResult {
  success: boolean;
  couponId?: string;
  error?: string;
}

export interface DeactivateCouponResult {
  success: boolean;
  error?: string;
}

export interface IncrementCouponResult {
  success: boolean;
  newCount?: number;
  error?: string;
}

// ===== COUPON SERVICE FUNCTIONS =====

/**
 * Full coupon validation.
 * - Checks coupon exists and is active
 * - Checks expiration
 * - Checks usage limit (maxUses vs usedCount)
 * - Checks applicable plans
 * - Returns { valid, coupon, discountAmount, error? }
 */
export async function validateCoupon(params: {
  code: string;
  plan: PlanType;
  userId?: string;
}): Promise<CouponValidationResult> {
  try {
    const coupon = await db.coupon.findUnique({
      where: { code: params.code },
    });

    if (!coupon) {
      return {
        valid: false,
        coupon: null,
        discountAmount: 0,
        error: 'Coupon not found',
      };
    }

    // Build the coupon object for the result
    const couponData = {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      expiresAt: coupon.expiresAt,
      applicablePlans: JSON.parse(coupon.applicablePlans || '[]'),
      active: coupon.active,
    };

    // Check if active
    if (!coupon.active) {
      await logCouponEvent(params.userId || 'system', 'coupon_rejected', {
        code: params.code,
        reason: 'Coupon is inactive',
      });
      return {
        valid: false,
        coupon: couponData,
        discountAmount: 0,
        error: 'Coupon is no longer active',
      };
    }

    // Check expiration
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      await logCouponEvent(params.userId || 'system', 'coupon_rejected', {
        code: params.code,
        reason: 'Coupon has expired',
      });
      return {
        valid: false,
        coupon: couponData,
        discountAmount: 0,
        error: 'Coupon has expired',
      };
    }

    // Check usage limit
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      await logCouponEvent(params.userId || 'system', 'coupon_rejected', {
        code: params.code,
        reason: 'Coupon usage limit reached',
      });
      return {
        valid: false,
        coupon: couponData,
        discountAmount: 0,
        error: 'Coupon usage limit has been reached',
      };
    }

    // Check applicable plans
    const applicablePlans: string[] = JSON.parse(coupon.applicablePlans || '[]');
    if (applicablePlans.length > 0 && !applicablePlans.includes(params.plan)) {
      await logCouponEvent(params.userId || 'system', 'coupon_rejected', {
        code: params.code,
        reason: `Coupon not applicable for ${params.plan} plan`,
      });
      return {
        valid: false,
        coupon: couponData,
        discountAmount: 0,
        error: `This coupon is not applicable for the ${params.plan} plan`,
      };
    }

    // Log successful validation
    await logCouponEvent(params.userId || 'system', 'coupon_validated', {
      code: params.code,
    });

    return {
      valid: true,
      coupon: couponData,
      discountAmount: 0, // Actual discount calculated in applyCoupon
    };
  } catch (error) {
    console.error('[CouponService] Failed to validate coupon:', error);
    return {
      valid: false,
      coupon: null,
      discountAmount: 0,
      error: 'Failed to validate coupon',
    };
  }
}

/**
 * Calculate discount for a coupon against a base amount.
 * - Percent discount or fixed amount
 * - Never allows discount to exceed baseAmount
 * - Returns { discountAmount, finalAmount }
 */
export async function applyCoupon(params: {
  code: string;
  baseAmount: number;
  plan: PlanType;
}): Promise<CouponApplicationResult> {
  try {
    const coupon = await db.coupon.findUnique({
      where: { code: params.code },
    });

    if (!coupon) {
      return { discountAmount: 0, finalAmount: params.baseAmount, originalAmount: params.baseAmount };
    }

    let discountAmount = 0;

    if (coupon.discountType === 'percent') {
      discountAmount = (params.baseAmount * coupon.discountValue) / 100;
    } else if (coupon.discountType === 'fixed') {
      discountAmount = coupon.discountValue;
    }

    // Never allow discount to exceed base amount
    if (discountAmount > params.baseAmount) {
      discountAmount = params.baseAmount;
    }

    // Ensure non-negative
    if (discountAmount < 0) {
      discountAmount = 0;
    }

    const finalAmount = Math.max(0, params.baseAmount - discountAmount);

    return {
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100,
      originalAmount: params.baseAmount,
    };
  } catch (error) {
    console.error('[CouponService] Failed to apply coupon:', error);
    return {
      discountAmount: 0,
      finalAmount: params.baseAmount,
      originalAmount: params.baseAmount,
    };
  }
}

/**
 * Validate and apply a coupon in one step.
 * Combines validation and discount calculation.
 */
export async function validateAndApplyCoupon(params: {
  code: string;
  baseAmount: number;
  plan: PlanType;
  userId?: string;
}): Promise<CouponValidationResult & { finalAmount?: number }> {
  // First validate
  const validation = await validateCoupon({
    code: params.code,
    plan: params.plan,
    userId: params.userId,
  });

  if (!validation.valid) {
    return validation;
  }

  // Then apply
  const application = await applyCoupon({
    code: params.code,
    baseAmount: params.baseAmount,
    plan: params.plan,
  });

  return {
    ...validation,
    discountAmount: application.discountAmount,
    finalAmount: application.finalAmount,
  };
}

/**
 * Increment the usedCount of a coupon after successful use.
 */
export async function incrementCouponUsage(code: string): Promise<IncrementCouponResult> {
  try {
    const coupon = await db.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      return { success: false, error: 'Coupon not found' };
    }

    const updatedCoupon = await db.coupon.update({
      where: { code },
      data: { usedCount: { increment: 1 } },
    });

    return { success: true, newCount: updatedCoupon.usedCount };
  } catch (error) {
    console.error('[CouponService] Failed to increment coupon usage:', error);
    return { success: false, error: 'Failed to increment coupon usage' };
  }
}

/**
 * Create a new coupon (admin only).
 */
export async function createCoupon(params: CreateCouponParams): Promise<CreateCouponResult> {
  try {
    // Validate discount value
    if (params.discountType === 'percent' && (params.discountValue <= 0 || params.discountValue > 100)) {
      return { success: false, error: 'Percent discount must be between 1 and 100' };
    }

    if (params.discountType === 'fixed' && params.discountValue <= 0) {
      return { success: false, error: 'Fixed discount must be greater than 0' };
    }

    // Check if coupon code already exists
    const existing = await db.coupon.findUnique({
      where: { code: params.code },
    });

    if (existing) {
      return { success: false, error: 'Coupon code already exists' };
    }

    // Create the coupon
    const coupon = await db.coupon.create({
      data: {
        code: params.code.toUpperCase(),
        discountType: params.discountType,
        discountValue: params.discountValue,
        maxUses: params.maxUses ?? null,
        expiresAt: params.expiresAt ?? null,
        applicablePlans: JSON.stringify(params.applicablePlans || []),
        active: params.active ?? true,
      },
    });

    return { success: true, couponId: coupon.id };
  } catch (error) {
    console.error('[CouponService] Failed to create coupon:', error);
    return { success: false, error: 'Failed to create coupon' };
  }
}

/**
 * Deactivate a coupon (soft delete — sets active = false).
 */
export async function deactivateCoupon(code: string): Promise<DeactivateCouponResult> {
  try {
    const coupon = await db.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      return { success: false, error: 'Coupon not found' };
    }

    await db.coupon.update({
      where: { code },
      data: { active: false },
    });

    return { success: true };
  } catch (error) {
    console.error('[CouponService] Failed to deactivate coupon:', error);
    return { success: false, error: 'Failed to deactivate coupon' };
  }
}

/**
 * Get all active coupons (admin use).
 */
export async function getActiveCoupons(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  coupons: Array<{
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
    maxUses: number | null;
    usedCount: number;
    expiresAt: Date | null;
    applicablePlans: string[];
    active: boolean;
  }>;
  total: number;
}> {
  try {
    const [coupons, total] = await Promise.all([
      db.coupon.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      db.coupon.count({ where: { active: true } }),
    ]);

    return {
      coupons: coupons.map((c) => ({
        id: c.id,
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        expiresAt: c.expiresAt,
        applicablePlans: JSON.parse(c.applicablePlans || '[]'),
        active: c.active,
      })),
      total,
    };
  } catch (error) {
    console.error('[CouponService] Failed to get active coupons:', error);
    return { coupons: [], total: 0 };
  }
}

/**
 * Get coupon by code (for display purposes).
 */
export async function getCouponByCode(code: string): Promise<{
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  applicablePlans: string[];
  active: boolean;
} | null> {
  try {
    const coupon = await db.coupon.findUnique({
      where: { code },
    });

    if (!coupon) return null;

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      expiresAt: coupon.expiresAt,
      applicablePlans: JSON.parse(coupon.applicablePlans || '[]'),
      active: coupon.active,
    };
  } catch (error) {
    console.error('[CouponService] Failed to get coupon by code:', error);
    return null;
  }
}
