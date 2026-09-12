// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/validate-coupon
// Validate a coupon code using coupon-service with auth and audit logging
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { validateAndApplyCoupon } from '@/lib/coupon-service';
import { type PlanType } from '@/lib/entitlement-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

interface ValidateCouponBody {
  code: string;
  plan: PlanType;
  baseAmount?: number;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as ValidateCouponBody;
      const { code, plan, baseAmount } = body;

      if (!code) {
        return NextResponse.json(
          { error: 'Coupon code is required' },
          { status: 400 }
        );
      }

      if (!plan || !['free', 'pro', 'elite'].includes(plan)) {
        return NextResponse.json(
          { error: 'Valid plan is required (free, pro, or elite)' },
          { status: 400 }
        );
      }

      // Use coupon-service for full validation
      const amount = baseAmount || 0;
      const result = await validateAndApplyCoupon({
        code,
        baseAmount: amount,
        plan,
        userId: user.id,
      });

      // Log the validation attempt with userId
      await logBillingEvent({
        userId: user.id,
        action: 'coupon_validated',
        details: `Coupon ${code} validation: ${result.valid ? 'valid' : 'invalid'}`,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          code,
          plan,
          valid: result.valid,
          discountAmount: result.discountAmount,
          error: result.error,
        },
      });

      if (!result.valid) {
        return NextResponse.json(
          {
            valid: false,
            error: result.error || 'Invalid coupon code',
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        valid: true,
        discountType: result.coupon?.discountType,
        discountValue: result.coupon?.discountValue,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        code: result.coupon?.code,
        maxUses: result.coupon?.maxUses,
        usedCount: result.coupon?.usedCount,
        expiresAt: result.coupon?.expiresAt?.toISOString() ?? null,
      });
    } catch (error) {
      console.error('[API] Validate coupon error:', error);
      return NextResponse.json(
        { error: 'Failed to validate coupon' },
        { status: 500 }
      );
    }
  });
}
