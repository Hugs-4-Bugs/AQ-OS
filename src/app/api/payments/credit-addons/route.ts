import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';

export const CREDIT_ADDONS = [
  // AcquisitionOS credit add-on packs (Sep 2026). Prices shown are
  // exclusive of 18% GST. Total at checkout:
  //   100 credits  → ₹499 + ₹90 GST   = ₹589
  //   500 credits  → ₹1,999 + ₹360 GST = ₹2,359
  //   1,000 credits → ₹3,499 + ₹630 GST = ₹4,129
  { id: 'credits_100', credits: 100, priceINR: 499, priceUSD: 6 },
  { id: 'credits_500', credits: 500, priceINR: 1999, priceUSD: 24 },
  { id: 'credits_1000', credits: 1000, priceINR: 3499, priceUSD: 42 },
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
