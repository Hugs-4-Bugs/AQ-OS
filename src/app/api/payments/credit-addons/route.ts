import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';

export const CREDIT_ADDONS = [
  // AcquisitionOS credit add-on packs (final add-on pricing update, Sep 2026).
  // Prices shown are exclusive of 18% GST. Total at checkout:
  //   Starter Pack → 250 credits  → ₹599   + ₹108 GST  = ₹707   (~$7)
  //   Growth Pack  → 500 credits  → ₹999   + ₹180 GST  = ₹1,179 (~$12)
  //   Pro Pack     → 1,000 credits → ₹1,799 + ₹324 GST  = ₹2,123 (~$22)
  //   Power Pack   → 2,500 credits → ₹3,999 + ₹720 GST  = ₹4,719 (~$48)
  // Stripe one-time Price IDs are resolved server-side from env:
  //   STRIPE_PRICE_CREDITS_250_ID / STRIPE_PRICE_CREDITS_500_ID /
  //   STRIPE_PRICE_CREDITS_1000_ID / STRIPE_PRICE_CREDITS_2500_ID
  // `label` is the pack name shown in the UI; `badge` is an optional
  // highlight (only the Power Pack carries one).
  { id: 'credits_250', credits: 250, priceINR: 599, priceUSD: 7, label: 'Starter Pack', badge: null },
  { id: 'credits_500', credits: 500, priceINR: 999, priceUSD: 12, label: 'Growth Pack', badge: null },
  { id: 'credits_1000', credits: 1000, priceINR: 1799, priceUSD: 22, label: 'Pro Pack', badge: null },
  { id: 'credits_2500', credits: 2500, priceINR: 3999, priceUSD: 48, label: 'Power Pack', badge: 'Best Value' },
];

// Legacy pack IDs from the retired credit-pack lineup (100/₹499 pack).
// These are NOT purchasable and never appear in any UI or API listing —
// they exist ONLY so fulfillCreditAddon() can still resolve the credit
// amount for in-flight PaymentOrders created before this pricing update
// (their couponCode still references e.g. "addon:credits_100"). Payment
// safety: a customer who paid for an old pack before the change must
// still receive those credits.
export const LEGACY_CREDIT_ADDONS: Array<{ id: string; credits: number }> = [
  { id: 'credits_100', credits: 100 },
];

export async function GET() {
  return NextResponse.json({ addons: CREDIT_ADDONS });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { addonId, currency = 'INR' } = body;

      const addon = CREDIT_ADDONS.find(a => a.id === addonId);
      if (!addon) {
        return NextResponse.json({ error: 'Invalid addon' }, { status: 400 });
      }

      const amount = currency === 'INR' ? addon.priceINR : addon.priceUSD;
      const taxAmount = currency === 'INR' ? Math.round(amount * 0.18) : 0;

      // Create payment order
      // Store addonId in couponCode (prefixed with 'addon:') so webhook handlers
      // can identify this as a credit addon order and look up the credit amount.
      // Store credit count in subtotal (not used for pricing in addon orders).
      const order = await db.paymentOrder.create({
        data: {
          userId: user.id,
          provider: currency === 'INR' ? 'razorpay' : 'stripe',
          amount: amount + taxAmount,
          currency,
          plan: 'credit_addon',
          billingCycle: 'one_time',
          status: 'pending',
          subtotal: amount,
          taxAmount,
          couponCode: `addon:${addon.id}`,
      },
    });

    return NextResponse.json({
      orderId: order.id,
      addonId: addon.id,
      credits: addon.credits,
      amount: amount + taxAmount,
      subtotal: amount,
      taxAmount,
      currency,
    });
  } catch (error) {
      console.error('Credit addon error:', error);
      return NextResponse.json({ error: 'Failed to create addon order' }, { status: 500 });
    }
  });
}
