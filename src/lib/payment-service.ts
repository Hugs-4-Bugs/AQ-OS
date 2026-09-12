// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Payment Orchestration Service
// Phase 5: Payments System
//
// Coordinates Razorpay, Stripe, GST, Invoice, and Subscription services.
//
// CRITICAL RULES:
// 1. NEVER trust frontend payment success — all state changes via verified webhooks only
// 2. NEVER update DB before webhook verification
// 3. ALWAYS use atomic DB transactions ($transaction)
// 4. ALWAYS use proper GST calculations from gst-service
// 5. ALWAYS create PaymentWebhook records for dedup
// 6. ALWAYS generate invoices after successful payment
// 7. ALWAYS log audit events
// 8. ALWAYS handle rollback on failures
// ═══════════════════════════════════════════════════════════════════

import Razorpay from 'razorpay';
import Stripe from 'stripe';

import { db } from '@/lib/db';
import { createModuleLogger } from '@/lib/observability/logger';
import {
  PLAN_CREDITS,
  type PlanType,
  isValidPlanChange,
  getPlanChangeDirection,
  getPlanLevel,
} from '@/lib/entitlement-service';
import { validateAndApplyCoupon, incrementCouponUsage } from '@/lib/coupon-service';
import { logPaymentEvent, logSubscriptionEvent } from '@/lib/billing-audit';
import { addCredits } from '@/lib/credit-service';
import { calculateGST, isIndianUser as checkIsIndianUser, validateGSTNumber } from '@/lib/gst-service';
import { getAppUrl } from '@/lib/app-url';

const paymentLogger = createModuleLogger({ module: 'payment-service' });

// ===== PLAN PRICING =====
// Synced with src/lib/subscription-store.ts — keep both files in lockstep
// when prices change.
const PLAN_PRICING: Record<PlanType, Record<string, { monthly: number; yearly: number }>> = {
  free: { INR: { monthly: 0, yearly: 0 }, USD: { monthly: 0, yearly: 0 } },
  pro: { INR: { monthly: 1599, yearly: 11999 }, USD: { monthly: 19, yearly: 144 } },
  elite: { INR: { monthly: 5199, yearly: 37999 }, USD: { monthly: 63, yearly: 456 } },
};

// ===== INTERFACES =====

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  provider?: 'razorpay' | 'stripe';
  // Razorpay-specific
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  // Stripe-specific
  stripeSessionId?: string;
  stripeSessionUrl?: string;
  // Common
  amount: number;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  gstRate: number;
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  creditsAllocated: number;
  idempotent?: boolean;
  error?: string;
}

export interface PaymentActivationResult {
  success: boolean;
  subscriptionId?: string;
  invoiceId?: string;
  creditsAdded?: number;
  error?: string;
}

export interface RetryPaymentResult {
  success: boolean;
  newOrderId?: string;
  razorpayOrderId?: string;
  stripeSessionUrl?: string;
  error?: string;
}

export interface BillingPreview {
  currentPlan: PlanType;
  targetPlan: PlanType;
  direction: 'upgrade' | 'downgrade';
  currentPeriodEnd: Date | null;
  prorationCredit: number;
  newAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  effectiveImmediately: boolean;
  scheduledFor: Date | null;
}

export interface CancelSubscriptionPaymentResult {
  success: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  error?: string;
}

// ===== INVOICE HTML GENERATION =====
// Generates a simple, professional HTML invoice that can be rendered as PDF
// or displayed directly in the browser. The HTML is stored in the Invoice record.

function generateInvoiceHTML(params: {
  invoiceNumber: string;
  invoiceDate: string;
  userId: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  gstNumber: string | null;
  taxExempt: boolean;
  plan: PlanType;
  billingCycle: string;
  discountAmount: number;
}): string {
  const currencySymbol = params.currency === 'INR' ? '₹' : '$';
  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const planLabel = params.plan.charAt(0).toUpperCase() + params.plan.slice(1);
  const cycleLabel = params.billingCycle === 'yearly' ? 'Annual' : 'Monthly';
  const companyName = 'AcquisitionOS Technologies Pvt. Ltd.';
  const companyAddress = process.env.COMPANY_ADDRESS || '123 Tech Park, Andheri East, Mumbai, Maharashtra 400069';
  const companyGst = process.env.COMPANY_GST_NUMBER || '27AABCA1234F1Z5';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${params.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div style="max-width: 800px; margin: 0 auto; padding: 40px 32px;">
    <table style="width: 100%; margin-bottom: 40px;">
      <tr>
        <td style="vertical-align: top;">
          <div style="font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 4px;">${companyName}</div>
          <div style="font-size: 13px; color: #6b7280; line-height: 1.6;">${companyAddress}<br>GSTIN: ${companyGst}</div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <div style="font-size: 28px; font-weight: 700; color: #059669; margin-bottom: 8px;">INVOICE</div>
          <div style="font-size: 14px; color: #374151; line-height: 1.8;">
            <strong>Invoice #:</strong> ${params.invoiceNumber}<br>
            <strong>Date:</strong> ${params.invoiceDate}<br>
            <strong>Currency:</strong> ${params.currency}
          </div>
        </td>
      </tr>
    </table>
    <div style="height: 2px; background: linear-gradient(to right, #059669, #10b981); margin-bottom: 32px; border-radius: 1px;"></div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Description</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Qty</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Unit Price</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${planLabel} Plan — ${cycleLabel} Subscription</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">1</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${fmt(params.subtotal + params.discountAmount)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151; font-weight: 500;">${fmt(params.subtotal)}</td>
        </tr>
        ${params.discountAmount > 0 ? `<tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #dc2626;">Discount</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #dc2626;">1</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #dc2626;">-${fmt(params.discountAmount)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #dc2626; font-weight: 500;">-${fmt(params.discountAmount)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Tax ${params.taxExempt ? '(Exempt)' : `@ ${(params.taxRate * 100).toFixed(0)}%`}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;"></td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;"></td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${params.taxExempt ? 'Exempt' : fmt(params.taxAmount)}</td>
        </tr>
      </tbody>
    </table>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
      <tr>
        <td style="width: 60%;"></td>
        <td style="width: 40%;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 12px; color: #6b7280;">Subtotal</td>
              <td style="padding: 8px 12px; text-align: right; color: #374151;">${fmt(params.subtotal)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #6b7280;">Total Tax</td>
              <td style="padding: 8px 12px; text-align: right; color: #374151;">${fmt(params.taxAmount)}</td>
            </tr>
            <tr style="background: #f0fdf4;">
              <td style="padding: 12px; font-size: 16px; font-weight: 700; color: #059669; border-top: 2px solid #059669;">Total</td>
              <td style="padding: 12px; font-size: 16px; font-weight: 700; text-align: right; color: #059669; border-top: 2px solid #059669;">${fmt(params.total)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${params.gstNumber ? `<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin-bottom: 32px;">
      <div style="font-size: 13px; color: #374151;"><strong>Customer GSTIN:</strong> ${params.gstNumber}</div>
    </div>` : ''}
    <div style="border-top: 2px solid #e5e7eb; padding-top: 24px; margin-top: 32px;">
      <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
        ${companyName} | ${companyAddress}<br>
        This is a computer-generated invoice. No physical signature is required.<br>
        For support: support@acquisitionos.com
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ===== INVOICE GENERATION =====
// Creates the Invoice DB record with line items and pre-rendered HTML content.
// The HTML template includes: invoice number, date, customer details, line items, tax, total.
// Storing HTML in the DB avoids re-generating on every view and enables
// the frontend to render it directly or use browser print-to-PDF.

async function generateInvoice(params: {
  paymentOrderId: string;
  userId: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  gstNumber: string | null;
  taxExempt: boolean;
  plan: PlanType;
  billingCycle: string;
  discountAmount: number;
}): Promise<string> {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todayInvoiceCount = await db.invoice.count({
    where: {
      createdAt: {
        gte: todayStart,
        lt: todayEnd,
      },
    },
  });

  const sequenceNum = String(todayInvoiceCount + 1).padStart(4, '0');
  const invoiceNumber = `INV-${dateStr}-${sequenceNum}`;

  const lineItems = JSON.stringify([
    {
      description: `${params.plan.charAt(0).toUpperCase() + params.plan.slice(1)} Plan — ${params.billingCycle}`,
      quantity: 1,
      unitPrice: params.subtotal + params.discountAmount,
      discount: params.discountAmount,
      subtotal: params.subtotal,
    },
    {
      description: 'Tax',
      rate: params.taxRate,
      amount: params.taxAmount,
      exempt: params.taxExempt,
    },
  ]);

  // Generate HTML invoice for storage
  const htmlContent = generateInvoiceHTML({
    invoiceNumber,
    invoiceDate: now.toISOString().split('T')[0],
    userId: params.userId,
    subtotal: params.subtotal,
    taxRate: params.taxRate,
    taxAmount: params.taxAmount,
    total: params.total,
    currency: params.currency,
    gstNumber: params.gstNumber,
    taxExempt: params.taxExempt,
    plan: params.plan,
    billingCycle: params.billingCycle,
    discountAmount: params.discountAmount,
  });

  const invoice = await db.invoice.create({
    data: {
      paymentOrderId: params.paymentOrderId,
      invoiceNumber,
      userId: params.userId,
      subtotal: params.subtotal,
      taxRate: params.taxRate,
      taxAmount: params.taxAmount,
      total: params.total,
      currency: params.currency,
      gstNumber: params.gstNumber,
      taxExempt: params.taxExempt,
      lineItems,
      htmlContent,
    },
  });

  return invoice.id;
}

// ===== PROVIDER INITIALIZATION =====

function getRazorpayInstance(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function getStripeInstance(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('Stripe credentials not configured. Set STRIPE_SECRET_KEY.');
  }

  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}

// ===== PRICING HELPERS =====

function getPlanAmount(plan: PlanType, billingCycle: 'monthly' | 'yearly', currency: 'INR' | 'USD'): number {
  const planPricing = PLAN_PRICING[plan];
  if (!planPricing) return 0;
  const currencyPricing = planPricing[currency];
  if (!currencyPricing) return 0;
  return billingCycle === 'monthly' ? currencyPricing.monthly : currencyPricing.yearly;
}

async function getUserCurrency(userId: string, requestedCurrency?: 'INR' | 'USD'): Promise<'INR' | 'USD'> {
  if (requestedCurrency) return requestedCurrency;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { country: true },
  });

  if (user?.country && checkIsIndianUser(user.country)) return 'INR';
  return 'USD';
}

// ===== CORE PAYMENT FUNCTIONS =====

/**
 * Create a payment order via Razorpay.
 *
 * Flow:
 * 1. Validate plan and billing cycle
 * 2. Validate plan change
 * 3. Check idempotency (return existing order if same idempotencyKey)
 * 4. Calculate coupon discount
 * 5. Calculate GST using gst-service
 * 6. Create Razorpay order via SDK
 * 7. Store PaymentOrder in DB
 * 8. Return full checkout config
 */
export async function createPaymentOrder(params: {
  userId: string;
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  currency?: 'INR' | 'USD';
  couponCode?: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<CreateOrderResult> {
  try {
    const { userId, plan, billingCycle, couponCode, idempotencyKey, ipAddress, userAgent } = params;

    // 1. Validate plan — must be pro or elite
    if (plan !== 'pro' && plan !== 'elite') {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: 'Invalid plan. Only Pro and Elite plans require payment.',
      };
    }

    // Validate billing cycle
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: 'Invalid billing cycle. Must be monthly or yearly.',
      };
    }

    // 2. Get user and validate plan change
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, country: true, id: true },
    });

    if (!user) {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: 'User not found.',
      };
    }

    const currentPlan = (user.plan || 'free') as PlanType;
    if (!isValidPlanChange(currentPlan, plan)) {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: `Invalid plan change from ${currentPlan} to ${plan}.`,
      };
    }

    // 3. Check idempotency
    if (idempotencyKey) {
      const existingOrder = await db.paymentOrder.findUnique({
        where: { idempotencyKey },
      });

      if (existingOrder && existingOrder.status === 'pending') {
        // Return existing pending order
        const isRazorpay = existingOrder.provider === 'razorpay';
        return {
          success: true,
          orderId: existingOrder.id,
          provider: isRazorpay ? 'razorpay' : 'stripe',
          razorpayOrderId: isRazorpay ? existingOrder.providerOrderId ?? undefined : undefined,
          razorpayKeyId: isRazorpay ? process.env.RAZORPAY_KEY_ID : undefined,
          amount: existingOrder.amount,
          currency: existingOrder.currency,
          subtotal: existingOrder.subtotal,
          discountAmount: existingOrder.discountAmount,
          taxAmount: existingOrder.taxAmount,
          gstRate: existingOrder.taxRate,
          plan: existingOrder.plan as PlanType,
          billingCycle: existingOrder.billingCycle as 'monthly' | 'yearly',
          creditsAllocated: PLAN_CREDITS[plan],
          idempotent: true,
        };
      }

      if (existingOrder && existingOrder.status === 'completed') {
        return {
          success: false,
          amount: 0,
          currency: 'USD',
          subtotal: 0,
          discountAmount: 0,
          taxAmount: 0,
          gstRate: 0,
          plan,
          billingCycle,
          creditsAllocated: 0,
          error: 'Payment already completed for this idempotency key.',
        };
      }
    }

    // Determine currency
    const currency = await getUserCurrency(userId, params.currency);
    const isIndian = checkIsIndianUser(user.country);

    // 4. Calculate base amount
    const baseAmount = getPlanAmount(plan, billingCycle, currency);

    // 5. Calculate coupon discount
    let discountAmount = 0;
    if (couponCode) {
      const couponResult = await validateAndApplyCoupon({
        code: couponCode,
        baseAmount,
        plan,
        userId,
      });

      if (couponResult.valid) {
        discountAmount = couponResult.discountAmount;
      }
    }

    const subtotal = Math.max(0, baseAmount - discountAmount);

    // 6. Calculate GST
    const gstCalc = calculateGST({
      subtotal,
      currency,
      isIndianUser: isIndian,
      billingState: undefined, // We'd need user's billing state — default to inter-state
      merchantState: 'MH',
    });

    const totalAmount = gstCalc.total;

    // 7. Create Razorpay order
    const razorpay = getRazorpayInstance();
    const amountInSmallestUnit = Math.round(totalAmount * 100); // Razorpay expects paise/cents

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInSmallestUnit,
      currency: currency,
      receipt: `rcpt_${Date.now()}_${userId.substring(0, 8)}`,
      notes: {
        userId,
        plan,
        billingCycle,
        subtotal: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        taxAmount: gstCalc.totalTax.toString(),
        couponCode: couponCode || '',
      },
    });

    // 8. Store PaymentOrder in DB
    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'razorpay',
        providerOrderId: razorpayOrder.id,
        amount: totalAmount,
        currency,
        plan,
        billingCycle,
        status: 'pending',
        couponCode: couponCode || null,
        discountAmount,
        subtotal,
        taxRate: gstCalc.totalTax > 0 && subtotal > 0 ? gstCalc.totalTax / subtotal : 0,
        taxAmount: gstCalc.totalTax,
        gstNumber: gstCalc.gstNumber,
        isIndianUser: isIndian,
        idempotencyKey: idempotencyKey || null,
      },
    });

    // 9. Log audit event
    await logPaymentEvent(userId, 'payment_initiated', {
      amount: totalAmount,
      currency,
      provider: 'razorpay',
      plan,
      paymentOrderId: paymentOrder.id,
    });

    return {
      success: true,
      orderId: paymentOrder.id,
      provider: 'razorpay',
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      amount: totalAmount,
      currency,
      subtotal,
      discountAmount,
      taxAmount: gstCalc.totalTax,
      gstRate: gstCalc.totalTax > 0 && subtotal > 0 ? gstCalc.totalTax / subtotal : 0,
      plan,
      billingCycle,
      creditsAllocated: PLAN_CREDITS[plan],
    };
  } catch (error) {
    paymentLogger.error('Failed to create payment order', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to create payment order';
    return {
      success: false,
      amount: 0,
      currency: 'USD',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      gstRate: 0,
      plan: params.plan,
      billingCycle: params.billingCycle,
      creditsAllocated: 0,
      error: message,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// PLAN PRICE ID RESOLVER (env-driven, never hardcoded) — PART 5
// ═════════════════════════════════════════════════════════════════════
// The Stripe Price IDs for subscription plans are configured in the
// deployment's Secrets panel as environment variables. Different naming
// conventions have been used across the codebase's history, so the
// resolver tries all of them (in order) and returns the first real
// price ID (must start with `price_`). NO amount is ever hardcoded —
// the Stripe Price object itself carries the authoritative amount.
//
// Supported conventions (example: Pro Monthly):
//   STRIPE_PRO_MONTHLY_PRICE_ID
//   STRIPE_PRICE_ID_PRO_MONTHLY
//   STRIPE_PRICE_PRO_MONTHLY_ID
//   STRIPE_PRICE_PRO_MONTHLY
//
// Credit add-on price IDs use their own dedicated variables:
//   STRIPE_PRICE_CREDITS_100_ID / STRIPE_PRICE_CREDITS_500_ID /
//   STRIPE_PRICE_CREDITS_1000_ID (see createStripeCreditAddonCheckoutSession)
export function resolvePlanPriceId(
  plan: 'pro' | 'elite',
  billingCycle: 'monthly' | 'yearly',
): { priceId: string | null; envVarNamesTried: string[] } {
  const P = plan.toUpperCase();
  const C = billingCycle.toUpperCase();
  const conventions = [
    `STRIPE_${P}_${C}_PRICE_ID`,
    `STRIPE_PRICE_ID_${P}_${C}`,
    `STRIPE_PRICE_${P}_${C}_ID`,
    `STRIPE_PRICE_${P}_${C}`,
  ];
  for (const name of conventions) {
    const value = process.env[name];
    if (typeof value === 'string' && value.startsWith('price_')) {
      return { priceId: value, envVarNamesTried: conventions };
    }
  }
  return { priceId: null, envVarNamesTried: conventions };
}

/**
 * Create a REAL Stripe Checkout Session for a subscription plan
 * (Pro / Elite, monthly / yearly).
 *
 * PART 5 of SUBSCRIPTION-PAYMENT-FIX-20260909:
 *  - mode: 'subscription' with line_items: [{ price: <env price ID>, quantity: 1 }]
 *    (previously used mode:'payment' + inline price_data — no longer).
 *  - success_url: APP_URL + '/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}'
 *  - cancel_url:  APP_URL + '/dashboard?payment=cancelled'
 *  - metadata: { userId, planName, billingCycle, ... }
 *  - The DB PaymentOrder is created with amount=0 and updated from the
 *    session's actual amount after creation — the Stripe Price is the
 *    single source of truth for the charged amount (no amount drift, and
 *    the webhook amount guard compares against the real session total).
 *
 * Flow:
 * 1. Same validation as createPaymentOrder
 * 2. Resolve the plan's Stripe Price ID from env (never hardcoded)
 * 3. Create the Stripe Checkout Session (mode: subscription)
 * 4. Store PaymentOrder in DB (pending) and link the session ID
 * 5. Return session URL — the client redirects; the Stripe webhook is
 *    the ONLY path that activates the subscription.
 */
export async function createStripeCheckoutSession(params: {
  userId: string;
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  currency?: 'USD';
  couponCode?: string;
  successUrl?: string;
  cancelUrl?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<CreateOrderResult> {
  try {
    const { userId, plan, billingCycle, couponCode, successUrl, cancelUrl, ipAddress, userAgent } = params;

    // 1. Validate plan
    if (plan !== 'pro' && plan !== 'elite') {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: 'Invalid plan. Only Pro and Elite plans require payment.',
      };
    }

    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: 'Invalid billing cycle.',
      };
    }

    // Get user and validate plan change
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, country: true },
    });

    if (!user) {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: 'User not found.',
      };
    }

    const currentPlan = (user.plan || 'free') as PlanType;
    // Look up the user's active subscription so we can detect a same-plan
    // billing-cycle switch (e.g. Pro Monthly → Pro Yearly). Switching the
    // billing cycle on the SAME plan is allowed; switching to the SAME plan
    // AND SAME billing cycle is a no-op (rejected). Cross-plan downgrades are
    // rejected here — the UI exposes "Contact Support" instead.
    const activeSubscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'trialing'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { billingCycle: true },
    });
    const currentBillingCycle = (activeSubscription?.billingCycle || 'monthly') as 'monthly' | 'yearly';

    const isSamePlan = currentPlan === plan;
    const isSameCycle = currentBillingCycle === billingCycle;
    if (isSamePlan && isSameCycle) {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: `You are already on the ${plan} (${billingCycle}) plan.`,
      };
    }
    if (!isSamePlan && !isValidPlanChange(currentPlan, plan)) {
      return {
        success: false,
        amount: 0,
        currency: 'USD',
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: `Invalid plan change from ${currentPlan} to ${plan}.`,
      };
    }
    // isSamePlan && !isSameCycle → billing-cycle switch on the same plan → allowed.

    const currency = params.currency || 'USD';
    const isIndian = checkIsIndianUser(user.country);

    // NOTE (PART 5): amounts are no longer computed server-side for the
    // Stripe session — the Stripe Price object (from the env-configured
    // price ID) is the single source of truth for what the user is
    // charged. The coupon code, if provided, is passed through to
    // Stripe's hosted checkout via allow_promotion_codes and recorded in
    // the order metadata for audit.

    // PART 5 — Resolve the plan's Stripe Price ID from the environment.
    // NEVER hardcoded. If missing, fail loudly with the exact env var names
    // to set in the Secrets panel.
    const { priceId, envVarNamesTried } = resolvePlanPriceId(plan, billingCycle);
    if (!priceId) {
      paymentLogger.error('Stripe plan price ID not configured', { plan, billingCycle, envVarNamesTried });
      return {
        success: false,
        amount: 0,
        currency,
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        gstRate: 0,
        plan,
        billingCycle,
        creditsAllocated: 0,
        error: `Stripe price ID for ${plan} (${billingCycle}) is not configured. Set one of: ${envVarNamesTried.join(', ')} in your environment.`,
      };
    }

    // Create a preliminary PaymentOrder to get an orderId for metadata.
    // amount is intentionally 0 here — the Stripe Price is the source of
    // truth for the charged amount; we update the order with the session's
    // real amount right after the session is created. This keeps the
    // webhook's amount-mismatch guard meaningful (it compares against the
    // amount Stripe actually charged).
    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'stripe',
        amount: 0,
        currency,
        plan,
        billingCycle,
        status: 'pending',
        couponCode: couponCode || null,
        discountAmount: 0,
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        isIndianUser: isIndian,
      },
    });

    // Build redirect URLs using the canonical public app URL.
    // CRITICAL: never use request.url origin or localhost — the server binds
    // to 0.0.0.0 which would produce unreachable redirect URLs.
    // PART 5: success/cancel both land on /dashboard (not the app root).
    const appBaseUrl = getAppUrl();
    const defaultSuccessUrl = `${appBaseUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${appBaseUrl}/dashboard?payment=cancelled`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      // PART 5 — real subscription checkout driven by the Stripe Price ID.
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      metadata: {
        userId,
        user_id: userId, // snake_case alias — some webhook lookups expect it
        planName: plan,
        plan,
        billingCycle,
        order_id: paymentOrder.id, // snake_case alias used by webhook lookup
        orderId: paymentOrder.id,
        couponCode: couponCode || '',
      },
      // Carry the same context onto the Stripe Subscription object so
      // customer.subscription.* webhook events can be attributed.
      subscription_data: {
        metadata: {
          userId,
          plan,
          billingCycle,
          orderId: paymentOrder.id,
        },
      },
      client_reference_id: userId,
    };

    // If the user applied a coupon code in the UI, expose Stripe's built-in
    // promotion-code entry on the hosted checkout page. The server cannot
    // pre-factor a discount into a fixed Price ID, so the discount (if any)
    // is applied by Stripe itself; the webhook reconciles the final amount.
    if (couponCode) {
      sessionParams.allow_promotion_codes = true;
    }

    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Update PaymentOrder with the Stripe session ID and the ACTUAL charged
    // amount + currency from the session (the Price object is authoritative).
    const sessionAmount = session.amount_total ? session.amount_total / 100 : 0;
    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: {
        providerOrderId: session.id,
        amount: sessionAmount,
        subtotal: sessionAmount,
        currency: (session.currency || currency).toUpperCase(),
      },
    });

    // Log audit event
    await logPaymentEvent(userId, 'payment_initiated', {
      amount: sessionAmount,
      currency: (session.currency || currency).toUpperCase(),
      provider: 'stripe',
      plan,
      paymentOrderId: paymentOrder.id,
    });

    return {
      success: true,
      orderId: paymentOrder.id,
      provider: 'stripe',
      stripeSessionId: session.id,
      stripeSessionUrl: session.url ?? undefined,
      amount: sessionAmount,
      currency: (session.currency || currency).toUpperCase(),
      subtotal: sessionAmount,
      discountAmount: 0,
      taxAmount: 0,
      gstRate: 0,
      plan,
      billingCycle,
      creditsAllocated: PLAN_CREDITS[plan],
    };
  } catch (error) {
    paymentLogger.error('Failed to create Stripe checkout session', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to create Stripe checkout session';
    return {
      success: false,
      amount: 0,
      currency: 'USD',
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      gstRate: 0,
      plan: params.plan,
      billingCycle: params.billingCycle,
      creditsAllocated: 0,
      error: message,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// CREDIT ADD-ON STRIPE CHECKOUT
// ═════════════════════════════════════════════════════════════════════
// One-time Stripe Checkout Session for credit add-on purchases.
//
// The credit add-on Stripe Price IDs are read at runtime from the
// environment (NEVER hardcoded):
//   - STRIPE_PRICE_CREDITS_100_ID   (100 credits)
//   - STRIPE_PRICE_CREDITS_500_ID   (500 credits)
//   - STRIPE_PRICE_CREDITS_1000_ID  (1,000 credits)
//
// The Stripe Price object on the dashboard already includes the GST-aware
// amount for Indian users, so we pass the priceId directly (no price_data).
//
// The webhook handler routes the resulting `checkout.session.completed`
// event through `fulfillCreditAddon()` (in credit-addon-fulfillment.ts)
// which calls `addCreditAddon()` to add credits atomically + create a
// ledger entry, then sends an in-app notification + email confirmation.
// ═════════════════════════════════════════════════════════════════════

const CREDIT_ADDON_PRICE_IDS: Record<number, string | undefined> = {
  100: process.env.STRIPE_PRICE_CREDITS_100_ID,
  500: process.env.STRIPE_PRICE_CREDITS_500_ID,
  1000: process.env.STRIPE_PRICE_CREDITS_1000_ID,
};

export interface CreateCreditAddonCheckoutResult {
  success: boolean;
  url?: string;
  orderId?: string;
  sessionId?: string;
  amount?: number;
  currency?: string;
  credits?: number;
  error?: string;
}

export async function createStripeCreditAddonCheckoutSession(params: {
  userId: string;
  creditAmount: 100 | 500 | 1000;
  successUrl?: string;
  cancelUrl?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<CreateCreditAddonCheckoutResult> {
  try {
    const { userId, creditAmount, successUrl, cancelUrl, ipAddress, userAgent } = params;

    // 1. Validate the credit amount against the known packs
    if (creditAmount !== 100 && creditAmount !== 500 && creditAmount !== 1000) {
      return {
        success: false,
        error: `Invalid credit add-on amount: ${creditAmount}. Must be 100, 500, or 1000.`,
      };
    }

    const priceId = CREDIT_ADDON_PRICE_IDS[creditAmount];
    if (!priceId || !priceId.startsWith('price_')) {
      return {
        success: false,
        error: `Stripe price ID for credit add-on (${creditAmount} credits) is not configured. Set STRIPE_PRICE_CREDITS_${creditAmount}_ID.`,
      };
    }

    // 2. Validate user exists
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, country: true, email: true, name: true },
    });
    if (!user) {
      return { success: false, error: 'User not found.' };
    }

    // 3. Create a preliminary PaymentOrder so the webhook can find it by
    //    `providerOrderId` (the Stripe session id). Mark it as a credit_addon
    //    order so the webhook's `isCreditAddonOrder` check routes it to
    //    `fulfillCreditAddon` (NOT `confirmPaymentAndActivate`, which would
    //    destroy the user's subscription).
    //
    //    We store the addon ID in `couponCode` (prefixed with `addon:`) so
    //    `fulfillCreditAddon` can look it up via the CREDIT_ADDONS catalog.
    const addonId = `credits_${creditAmount}`;
    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'stripe',
        // The Stripe Price already includes the GST-inclusive amount for INR
        // users — we'll learn the actual amount from the webhook. Set 0 here
        // and update it from `session.amount_total` once the session is created.
        amount: 0,
        currency: 'INR',
        plan: 'credit_addon',
        billingCycle: 'one_time',
        status: 'pending',
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        couponCode: `addon:${addonId}`,
        isIndianUser: true,
      },
    });

    // 4. Build redirect URLs using the canonical public app URL.
    const appBaseUrl = getAppUrl();
    const defaultSuccessUrl = `${appBaseUrl}/dashboard?credits_added=true&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${appBaseUrl}/dashboard?payment=cancelled`;

    // 5. Create the Stripe Checkout Session with mode='payment' (one-time)
    //    and a real Stripe Price ID from env. The price object on Stripe
    //    already encodes the INR amount + GST.
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      metadata: {
        userId,
        type: 'credits',
        creditAmount: creditAmount.toString(),
        addonId,
        orderId: paymentOrder.id,
      },
      client_reference_id: userId,
    });

    // 6. Update PaymentOrder with the Stripe session ID and the actual amount
    const sessionAmount = session.amount_total ? session.amount_total / 100 : 0;
    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: {
        providerOrderId: session.id,
        amount: sessionAmount,
        subtotal: sessionAmount,
      },
    });

    // 7. Audit log
    await logPaymentEvent(userId, 'payment_initiated', {
      amount: sessionAmount,
      currency: session.currency?.toUpperCase() || 'INR',
      provider: 'stripe',
      plan: 'credit_addon',
      paymentOrderId: paymentOrder.id,
      addonId,
      creditAmount,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      url: session.url ?? undefined,
      orderId: paymentOrder.id,
      sessionId: session.id,
      amount: sessionAmount,
      currency: (session.currency || 'inr').toUpperCase(),
      credits: creditAmount,
    };
  } catch (error) {
    paymentLogger.error('Failed to create Stripe credit add-on checkout session', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create credit add-on checkout session',
    };
  }
}

/**
 * Activate subscription after a verified payment.
 *
 * This function is called ONLY from webhook handlers after payment verification.
 * NEVER call this from client-side code.
 *
 * Flow (all in an atomic $transaction):
 * 1. Update PaymentOrder status to 'completed'
 * 2. Update or create Subscription (plan, status='active', period dates, provider IDs)
 * 3. Update User (plan, credits, creditsMonthly, isTrial=false)
 * 4. Create CreditsLedger entry
 * 5. Generate invoice
 * 6. Log all audit events
 * 7. Increment coupon usage if applicable
 */
export async function activateSubscriptionAfterPayment(params: {
  userId: string;
  paymentOrderId: string;
  providerPaymentId: string;
  providerSubscriptionId?: string;
}): Promise<PaymentActivationResult> {
  try {
    const { userId, paymentOrderId, providerPaymentId, providerSubscriptionId } = params;

    // Check for duplicate activation (idempotency)
    const existingOrder = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!existingOrder) {
      return { success: false, error: 'Payment order not found.' };
    }

    if (existingOrder.userId !== userId) {
      return { success: false, error: 'Payment order does not belong to this user.' };
    }

    if (existingOrder.status === 'completed') {
      // Already activated — idempotent return
      const existingSub = await db.subscription.findFirst({
        where: { userId, status: 'active' },
      });
      const existingInvoice = await db.invoice.findUnique({
        where: { paymentOrderId },
      });

      return {
        success: true,
        subscriptionId: existingSub?.id,
        invoiceId: existingInvoice?.id,
        creditsAdded: 0,
      };
    }

    if (existingOrder.status !== 'pending') {
      return { success: false, error: `Payment order is in '${existingOrder.status}' state, cannot activate.` };
    }

    const newPlan = existingOrder.plan as PlanType;
    const billingCycle = existingOrder.billingCycle as 'monthly' | 'yearly';
    const creditsForPlan = PLAN_CREDITS[newPlan] || PLAN_CREDITS.free;
    const now = new Date();
    const periodEnd = billingCycle === 'monthly'
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const provider = existingOrder.provider as 'razorpay' | 'stripe';

    // Atomic transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Update PaymentOrder status
      await tx.paymentOrder.update({
        where: { id: paymentOrderId },
        data: {
          status: 'completed',
          providerPaymentId,
        },
      });

      // 2. Update or create Subscription
      let subscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: { in: ['trialing', 'active', 'past_due'] },
        },
      });

      if (subscription) {
        subscription = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            plan: newPlan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            scheduledPlanChange: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            billingCycle,
            razorpaySubscriptionId: provider === 'razorpay'
              ? (providerSubscriptionId || subscription.razorpaySubscriptionId)
              : subscription.razorpaySubscriptionId,
            stripeSubscriptionId: provider === 'stripe'
              ? (providerSubscriptionId || subscription.stripeSubscriptionId)
              : subscription.stripeSubscriptionId,
          },
        });
      } else {
        subscription = await tx.subscription.create({
          data: {
            userId,
            plan: newPlan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            billingCycle,
            razorpaySubscriptionId: provider === 'razorpay' ? providerSubscriptionId : null,
            stripeSubscriptionId: provider === 'stripe' ? providerSubscriptionId : null,
          },
        });
      }

      // 3. Update User
      const userBefore = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true, plan: true },
      });

      const currentCredits = userBefore?.credits ?? 0;
      const newCredits = currentCredits + creditsForPlan;

      await tx.user.update({
        where: { id: userId },
        data: {
          plan: newPlan,
          credits: newCredits,
          creditsMonthly: creditsForPlan,
          isTrial: false,
          trialEndsAt: null,
        },
      });

      // 4. Create CreditsLedger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'plan_upgrade',
          credits: creditsForPlan,
          balance: newCredits,
          description: `Upgraded to ${newPlan} plan (${billingCycle}) — ${creditsForPlan} credits allocated`,
          referenceId: paymentOrderId,
        },
      });

      // 5. Generate Invoice
      const invoiceId = await generateInvoiceInternal(tx, {
        paymentOrderId,
        userId,
        subtotal: existingOrder.subtotal,
        taxRate: existingOrder.taxRate,
        taxAmount: existingOrder.taxAmount,
        total: existingOrder.amount,
        currency: existingOrder.currency,
        gstNumber: existingOrder.gstNumber,
        taxExempt: !existingOrder.isIndianUser,
        plan: newPlan,
        billingCycle,
        discountAmount: existingOrder.discountAmount,
      });

      return {
        subscriptionId: subscription.id,
        invoiceId,
        creditsAdded: creditsForPlan,
        previousPlan: userBefore?.plan as PlanType,
      };
    });

    // 6. Log audit events (outside transaction — non-critical)
    await logPaymentEvent(userId, 'payment_completed', {
      amount: existingOrder.amount,
      currency: existingOrder.currency,
      provider: existingOrder.provider,
      plan: newPlan,
      paymentOrderId,
    });

    await logSubscriptionEvent(userId, 'upgrade_completed', {
      fromPlan: result.previousPlan,
      toPlan: newPlan,
      toStatus: 'active',
      billingCycle,
    });

    // 7. Increment coupon usage if applicable
    if (existingOrder.couponCode) {
      await incrementCouponUsage(existingOrder.couponCode);
    }

    return {
      success: true,
      subscriptionId: result.subscriptionId,
      invoiceId: result.invoiceId,
      creditsAdded: result.creditsAdded,
    };
  } catch (error) {
    paymentLogger.error('Failed to activate subscription', { error: error instanceof Error ? error.message : String(error), paymentOrderId: params.paymentOrderId });
    const message = error instanceof Error ? error.message : 'Failed to activate subscription';

    // Log the failure
    await logPaymentEvent(params.userId, 'payment_failed', {
      amount: 0,
      currency: 'USD',
      provider: 'unknown',
      plan: 'unknown',
      paymentOrderId: params.paymentOrderId,
      reason: message,
    });

    return { success: false, error: message };
  }
}

/**
 * Internal invoice generation that works within a transaction.
 */
async function generateInvoiceInternal(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: {
    paymentOrderId: string;
    userId: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    currency: string;
    gstNumber: string | null;
    taxExempt: boolean;
    plan: PlanType;
    billingCycle: string;
    discountAmount: number;
  }
): Promise<string> {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  // Sequential numbering: count today's invoices and increment
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todayInvoiceCount = await tx.invoice.count({
    where: {
      createdAt: {
        gte: todayStart,
        lt: todayEnd,
      },
    },
  });

  const sequenceNum = String(todayInvoiceCount + 1).padStart(4, '0');
  const invoiceNumber = `INV-${dateStr}-${sequenceNum}`;

  const lineItems = JSON.stringify([
    {
      description: `${params.plan.charAt(0).toUpperCase() + params.plan.slice(1)} Plan — ${params.billingCycle}`,
      quantity: 1,
      unitPrice: params.subtotal + params.discountAmount,
      discount: params.discountAmount,
      subtotal: params.subtotal,
    },
    {
      description: 'Tax',
      rate: params.taxRate,
      amount: params.taxAmount,
      exempt: params.taxExempt,
    },
  ]);

  // Generate HTML invoice for storage
  const htmlContent = generateInvoiceHTML({
    invoiceNumber,
    invoiceDate: now.toISOString().split('T')[0],
    userId: params.userId,
    subtotal: params.subtotal,
    taxRate: params.taxRate,
    taxAmount: params.taxAmount,
    total: params.total,
    currency: params.currency,
    gstNumber: params.gstNumber,
    taxExempt: params.taxExempt,
    plan: params.plan,
    billingCycle: params.billingCycle,
    discountAmount: params.discountAmount,
  });

  const invoice = await tx.invoice.create({
    data: {
      paymentOrderId: params.paymentOrderId,
      invoiceNumber,
      userId: params.userId,
      subtotal: params.subtotal,
      taxRate: params.taxRate,
      taxAmount: params.taxAmount,
      total: params.total,
      currency: params.currency,
      gstNumber: params.gstNumber,
      taxExempt: params.taxExempt,
      lineItems,
      htmlContent,
    },
  });

  return invoice.id;
}

/**
 * Handle payment failure.
 *
 * Flow:
 * 1. Update PaymentOrder status to 'failed'
 * 2. Set subscription to 'past_due' if it was 'active'
 * 3. Calculate grace period (7 days from failure)
 * 4. Log audit event
 * 5. Schedule retry reminders
 * 6. Return retry eligibility
 */
export async function handlePaymentFailure(params: {
  userId: string;
  paymentOrderId: string;
  failureReason: string;
  errorCode?: string;
}): Promise<{ success: boolean; retryEligible: boolean; gracePeriodEndsAt?: Date }> {
  try {
    const { userId, paymentOrderId, failureReason, errorCode } = params;

    const paymentOrder = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!paymentOrder) {
      return { success: false, retryEligible: false };
    }

    if (paymentOrder.userId !== userId) {
      return { success: false, retryEligible: false };
    }

    // Update PaymentOrder status
    await db.paymentOrder.update({
      where: { id: paymentOrderId },
      data: { status: 'failed' },
    });

    // Set subscription to past_due if it was active
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (subscription) {
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'past_due' },
      });
    }

    // Calculate grace period — 7 days from now
    const gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Log audit events
    await logPaymentEvent(userId, 'payment_failed', {
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      provider: paymentOrder.provider,
      plan: paymentOrder.plan,
      paymentOrderId,
      reason: `${failureReason}${errorCode ? ` (Code: ${errorCode})` : ''}`,
    });

    if (subscription) {
      await logSubscriptionEvent(userId, 'subscription_past_due', {
        fromStatus: subscription.status,
        toStatus: 'past_due',
      });
    }

    // Determine retry eligibility — always eligible if order was pending
    // (max 3 retries within grace period)
    const failedOrderCount = await db.paymentOrder.count({
      where: {
        userId,
        plan: paymentOrder.plan,
        billingCycle: paymentOrder.billingCycle,
        status: 'failed',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    const retryEligible = failedOrderCount < 3;

    return {
      success: true,
      retryEligible,
      gracePeriodEndsAt: retryEligible ? gracePeriodEndsAt : undefined,
    };
  } catch (error) {
    paymentLogger.error('Failed to handle payment failure', { error: error instanceof Error ? error.message : String(error) });
    return { success: false, retryEligible: false };
  }
}

/**
 * Retry a failed payment.
 *
 * Flow:
 * 1. Check if previous failed order exists
 * 2. Create new order for the same plan/cycle
 * 3. Return new checkout config
 */
export async function retryPayment(params: {
  userId: string;
  failedOrderId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<RetryPaymentResult> {
  try {
    const { userId, failedOrderId, ipAddress, userAgent } = params;

    // Check if the failed order exists and belongs to user
    const failedOrder = await db.paymentOrder.findUnique({
      where: { id: failedOrderId },
    });

    if (!failedOrder) {
      return { success: false, error: 'Failed order not found.' };
    }

    if (failedOrder.userId !== userId) {
      return { success: false, error: 'Order does not belong to this user.' };
    }

    if (failedOrder.status !== 'failed') {
      return { success: false, error: 'Order is not in failed state.' };
    }

    // Check retry eligibility (max 3 retries within grace period)
    const failedOrderCount = await db.paymentOrder.count({
      where: {
        userId,
        plan: failedOrder.plan,
        billingCycle: failedOrder.billingCycle,
        status: 'failed',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    if (failedOrderCount >= 3) {
      return { success: false, error: 'Maximum retry attempts reached. Please contact support.' };
    }

    const plan = failedOrder.plan as PlanType;
    const billingCycle = failedOrder.billingCycle as 'monthly' | 'yearly';
    const currency = failedOrder.currency as 'INR' | 'USD';

    // Create new order via the appropriate provider
    if (failedOrder.provider === 'razorpay') {
      const newOrder = await createPaymentOrder({
        userId,
        plan,
        billingCycle,
        currency,
        couponCode: failedOrder.couponCode || undefined,
        ipAddress,
        userAgent,
      });

      if (!newOrder.success) {
        return { success: false, error: newOrder.error };
      }

      return {
        success: true,
        newOrderId: newOrder.orderId,
        razorpayOrderId: newOrder.razorpayOrderId,
      };
    }

    if (failedOrder.provider === 'stripe') {
      const newOrder = await createStripeCheckoutSession({
        userId,
        plan,
        billingCycle,
        currency: currency as 'USD',
        couponCode: failedOrder.couponCode || undefined,
        ipAddress,
        userAgent,
      });

      if (!newOrder.success) {
        return { success: false, error: newOrder.error };
      }

      return {
        success: true,
        newOrderId: newOrder.orderId,
        stripeSessionUrl: newOrder.stripeSessionUrl,
      };
    }

    return { success: false, error: 'Unknown payment provider.' };
  } catch (error) {
    paymentLogger.error('Failed to retry payment', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to retry payment';
    return { success: false, error: message };
  }
}

/**
 * Cancel subscription payment.
 *
 * Sets cancelAtPeriodEnd=true on the subscription.
 * Does NOT immediately cancel — lets the user use their remaining period.
 * The subscription will expire at the end of the current period.
 */
export async function cancelSubscriptionPayment(params: {
  userId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<CancelSubscriptionPaymentResult> {
  try {
    const { userId, reason, ipAddress, userAgent } = params;

    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'past_due'] },
      },
    });

    if (!subscription) {
      return { success: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, error: 'No active subscription found.' };
    }

    if (subscription.cancelAtPeriodEnd) {
      return {
        success: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd,
      };
    }

    // Set cancelAtPeriodEnd = true
    await db.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    // Log the cancellation
    await logSubscriptionEvent(userId, 'subscription_canceled', {
      fromStatus: subscription.status,
      toStatus: subscription.status, // Status doesn't change immediately
    });

    return {
      success: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  } catch (error) {
    paymentLogger.error('Failed to cancel subscription', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription';
    return { success: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, error: message };
  }
}

/**
 * Get billing preview for a plan change.
 *
 * Calculates:
 * - Proration credit from remaining days on current plan
 * - New plan cost
 * - GST
 * - Effective date (immediately for upgrades, end-of-period for downgrades)
 */
export async function getBillingPreview(params: {
  userId: string;
  targetPlan: PlanType;
  billingCycle: 'monthly' | 'yearly';
}): Promise<BillingPreview> {
  try {
    const { userId, targetPlan, billingCycle } = params;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, country: true },
    });

    if (!user) {
      return {
        currentPlan: 'free',
        targetPlan,
        direction: 'upgrade',
        currentPeriodEnd: null,
        prorationCredit: 0,
        newAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        currency: 'USD',
        effectiveImmediately: true,
        scheduledFor: null,
      };
    }

    const currentPlan = (user.plan || 'free') as PlanType;
    const direction = getPlanChangeDirection(currentPlan, targetPlan);
    const currency = await getUserCurrency(userId);
    const isIndian = checkIsIndianUser(user.country);

    // Get current subscription period end
    const subscription = await db.subscription.findFirst({
      where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
    });

    const currentPeriodEnd = subscription?.currentPeriodEnd ?? null;

    // Calculate proration credit for remaining days
    let prorationCredit = 0;
    if (currentPeriodEnd && subscription?.currentPeriodStart) {
      const now = new Date();
      const totalDays = Math.max(1, Math.ceil(
        (currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) / (24 * 60 * 60 * 1000)
      ));
      const remainingDays = Math.max(0, Math.ceil(
        (currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      ));

      if (remainingDays > 0 && totalDays > 0) {
        const currentPlanCost = getPlanAmount(currentPlan, subscription.billingCycle as 'monthly' | 'yearly', currency);
        prorationCredit = Math.round((currentPlanCost * remainingDays / totalDays) * 100) / 100;
      }
    }

    // Calculate new plan amount
    const newAmount = getPlanAmount(targetPlan, billingCycle, currency);
    const amountAfterProration = direction === 'upgrade'
      ? Math.max(0, newAmount - prorationCredit)
      : newAmount;

    // Calculate GST
    const gstCalc = calculateGST({
      subtotal: amountAfterProration,
      currency,
      isIndianUser: isIndian,
      billingState: undefined,
      merchantState: 'MH',
    });

    const effectiveImmediately = direction === 'upgrade';
    const scheduledFor = direction === 'downgrade' ? currentPeriodEnd : null;

    return {
      currentPlan,
      targetPlan,
      direction,
      currentPeriodEnd,
      prorationCredit,
      newAmount,
      taxAmount: gstCalc.totalTax,
      totalAmount: gstCalc.total,
      currency,
      effectiveImmediately,
      scheduledFor,
    };
  } catch (error) {
    paymentLogger.error('Failed to get billing preview', { error: error instanceof Error ? error.message : String(error) });
    return {
      currentPlan: 'free',
      targetPlan: params.targetPlan,
      direction: 'upgrade',
      currentPeriodEnd: null,
      prorationCredit: 0,
      newAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      currency: 'USD',
      effectiveImmediately: true,
      scheduledFor: null,
    };
  }
}

/**
 * Get payment history for a user.
 *
 * Returns paginated PaymentOrder records with related Invoice data.
 */
export async function getPaymentHistory(params: {
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: Array<{
  id: string;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  plan: string;
  billingCycle: string;
  status: string;
  couponCode: string | null;
  discountAmount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  createdAt: Date;
  invoice: {
    id: string;
    invoiceNumber: string;
    total: number;
    currency: string;
    pdfUrl: string | null;
  } | null;
}>; total: number }> {
  try {
    const { userId, limit = 20, offset = 0 } = params;

    const [orders, total] = await Promise.all([
      db.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
              pdfUrl: true,
            },
          },
        },
      }),
      db.paymentOrder.count({ where: { userId } }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        provider: order.provider,
        providerOrderId: order.providerOrderId,
        providerPaymentId: order.providerPaymentId,
        amount: order.amount,
        currency: order.currency,
        plan: order.plan,
        billingCycle: order.billingCycle,
        status: order.status,
        couponCode: order.couponCode,
        discountAmount: order.discountAmount,
        subtotal: order.subtotal,
        taxRate: order.taxRate,
        taxAmount: order.taxAmount,
        createdAt: order.createdAt,
        invoice: order.invoice ? {
          id: order.invoice.id,
          invoiceNumber: order.invoice.invoiceNumber,
          total: order.invoice.total,
          currency: order.invoice.currency,
          pdfUrl: order.invoice.pdfUrl,
        } : null,
      })),
      total,
    };
  } catch (error) {
    paymentLogger.error('Failed to get payment history', { error: error instanceof Error ? error.message : String(error) });
    return { orders: [], total: 0 };
  }
}

// ===== WEBHOOK DEDUP HELPER =====

/**
 * Record a webhook event for deduplication.
 * Returns true if this is a new event (should process), false if duplicate.
 */
export async function recordWebhookEvent(params: {
  eventId: string;
  provider: 'razorpay' | 'stripe';
  eventType: string;
  payload: string;
  signature?: string;
  paymentOrderId?: string;
}): Promise<{ isNew: boolean; webhookId?: string }> {
  try {
    // Check if event already exists
    const existing = await db.paymentWebhook.findUnique({
      where: { eventId: params.eventId },
    });

    if (existing) {
      // Already processed or being processed
      return { isNew: false, webhookId: existing.id };
    }

    // Create new webhook record
    const webhook = await db.paymentWebhook.create({
      data: {
        eventId: params.eventId,
        provider: params.provider,
        eventType: params.eventType,
        payload: params.payload,
        signature: params.signature || null,
        paymentOrderId: params.paymentOrderId || null,
        processed: false,
      },
    });

    return { isNew: true, webhookId: webhook.id };
  } catch (error) {
    // Unique constraint violation means duplicate — safe to ignore
    if (error instanceof Error && error.message.includes('Unique')) {
      return { isNew: false };
    }
    paymentLogger.error('Failed to record webhook event', { error: error instanceof Error ? error.message : String(error) });
    // On error, allow processing (better to double-process than miss)
    return { isNew: true };
  }
}

/**
 * Mark a webhook event as processed.
 */
export async function markWebhookProcessed(
  webhookId: string,
  processingError?: string
): Promise<void> {
  try {
    await db.paymentWebhook.update({
      where: { id: webhookId },
      data: {
        processed: true,
        processedAt: new Date(),
        processingError: processingError || null,
      },
    });
  } catch (error) {
    paymentLogger.error('Failed to mark webhook as processed', { error: error instanceof Error ? error.message : String(error) });
  }
}

// ===== RAZORPAY WEBHOOK VERIFICATION =====

/**
 * Verify Razorpay webhook signature.
 * Uses the Razorpay SDK's utility to validate the signature.
 */
export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string,
  secret?: string
): boolean {
  try {
    const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      paymentLogger.fatal('RAZORPAY_WEBHOOK_SECRET not configured — rejecting in production');
      return false;
    }

    // Razorpay uses HMAC-SHA256 for webhook signature verification
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const { createHmac } = crypto;
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    paymentLogger.error('Failed to verify Razorpay webhook signature', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

// ===== STRIPE WEBHOOK VERIFICATION =====

/**
 * Verify Stripe webhook signature.
 * Uses the Stripe SDK's constructEvent method.
 */
export function verifyStripeWebhookSignature(
  body: string | Buffer,
  signature: string,
  secret?: string
): Stripe.Event | null {
  try {
    const webhookSecret = secret || process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      paymentLogger.fatal('STRIPE_WEBHOOK_SECRET not configured — rejecting in production');
      return null;
    }

    const stripe = getStripeInstance();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return event;
  } catch (error) {
    paymentLogger.error('Failed to verify Stripe webhook signature', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// ===== LOOKUP HELPERS =====

/**
 * Find a PaymentOrder by the provider's order ID (e.g., Razorpay order_id or Stripe session_id).
 */
export async function findOrderByProviderOrderId(
  providerOrderId: string
): Promise<{ id: string; userId: string; plan: string; billingCycle: string; status: string; provider: string } | null> {
  try {
    const order = await db.paymentOrder.findFirst({
      where: { providerOrderId },
      select: {
        id: true,
        userId: true,
        plan: true,
        billingCycle: true,
        status: true,
        provider: true,
      },
    });

    return order;
  } catch (error) {
    paymentLogger.error('Failed to find order by provider order ID', { providerOrderId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Get the Razorpay instance for direct SDK usage (e.g., fetching payment details).
 */
export function getRazorpayClient(): Razorpay {
  return getRazorpayInstance();
}

/**
 * Get the Stripe instance for direct SDK usage (e.g., fetching session details).
 */
export function getStripeClient(): Stripe {
  return getStripeInstance();
}
