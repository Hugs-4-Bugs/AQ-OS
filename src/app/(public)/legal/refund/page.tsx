import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy — AcquisitionOS',
  description: 'Learn about AcquisitionOS refund policy, money-back guarantee, and cancellation terms.',
};

export default function RefundPolicyPage() {
  return (
    <article className="container-app px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Refund Policy
          </h1>
          <p className="text-xs text-muted-foreground italic">Last updated: March 4, 2026</p>
          <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
        </div>

        {/* Intro */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          At AcquisitionOS, we want you to be completely satisfied with our service. This Refund Policy outlines the
          conditions under which refunds are available, how to request a refund, and what to expect during the process.
          By subscribing to our Service, you agree to the terms outlined in this policy.
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">1. 14-Day Money-Back Guarantee</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We offer a <strong>14-day money-back guarantee</strong> on all new subscription purchases. If you are not
            satisfied with the Service for any reason, you may request a full refund within 14 calendar days of your
            initial subscription purchase.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 my-4">
            <p className="text-sm font-medium mb-2">To be eligible for the 14-day money-back guarantee:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>The request must be made within 14 calendar days of the initial purchase date</li>
              <li>This applies to the first subscription purchase only (not renewals or re-subscriptions)</li>
              <li>Your account must not have been terminated for Terms of Service violations</li>
              <li>The refund applies to the subscription fee only, excluding any add-on credit purchases</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The money-back guarantee applies regardless of whether you used the Service during the 14-day period.
            No questions asked.
          </p>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">2. Credit Purchases</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Credit add-on purchases are treated differently from subscription purchases:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Unused credits:</strong> Credit add-on purchases where no credits have been used may be refunded
              within 7 days of purchase.</li>
            <li><strong>Partially used credits:</strong> If any credits from an add-on purchase have been consumed,
              the purchase is non-refundable.</li>
            <li><strong>Expired credits:</strong> Credits that have expired are not eligible for a refund.</li>
            <li><strong>Promotional credits:</strong> Free or promotional credits have no monetary value and cannot be
              refunded.</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Credits have no monetary value and cannot be transferred, sold, or exchanged for cash or other goods.
          </p>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">3. Subscription Cancellation</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may cancel your subscription at any time. Upon cancellation:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Access until end of billing period:</strong> You will retain access to all paid features
              until the end of your current billing period (monthly or annual).</li>
            <li><strong>No further charges:</strong> Your subscription will not be renewed, and no further charges
              will be applied after the current billing period ends.</li>
            <li><strong>Unused credits forfeited:</strong> Any unused monthly credits and rollover credits will be
              forfeited upon expiration of the current billing period.</li>
            <li><strong>Downgrade to Free plan:</strong> Your account will automatically revert to the Free plan
              at the end of the billing period.</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cancellation does not entitle you to a refund for the current billing period unless covered by the
            14-day money-back guarantee or other applicable refund provisions.
          </p>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">4. How to Request a Refund</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            To request a refund, please follow these steps:
          </p>
          <ol className="list-decimal pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Email us:</strong> Send a refund request to <strong>billing@acquisitionos.com</strong> with
              the subject line &quot;Refund Request — [Your Account Email]&quot;.</li>
            <li><strong>Include details:</strong> Provide your account email, the date of purchase, the amount charged,
              and the reason for your refund request (optional but helpful).</li>
            <li><strong>Confirmation:</strong> Our billing team will review your request and respond within 3 business
              days with a confirmation or follow-up questions.</li>
          </ol>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Alternatively, you can request a refund through the dashboard by navigating to
            Settings &gt; Billing &gt; Request Refund (if available for your plan).
          </p>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">5. Processing Time</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Once a refund is approved, the following timelines apply:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Approval:</strong> Refund requests are reviewed within 3 business days.</li>
            <li><strong>Processing:</strong> Approved refunds are processed within 5-10 business days.</li>
            <li><strong>Stripe payments:</strong> Refunds appear on your statement within 5-10 business days,
              depending on your bank.</li>
            <li><strong>Razorpay payments:</strong> Refunds appear on your statement within 5-10 business days,
              depending on your bank. UPI refunds are typically faster (1-3 business days).</li>
            <li><strong>Refund method:</strong> Refunds are issued to the original payment method used for the purchase.
              We cannot issue refunds to a different payment method.</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You will receive an email confirmation once the refund has been processed.
          </p>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">6. Exceptions</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            The following situations are <strong>not</strong> eligible for refunds:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Requests made after the 14-day money-back guarantee period has expired</li>
            <li>Subscription renewals (the guarantee applies to the initial purchase only)</li>
            <li>Accounts terminated for Terms of Service violations</li>
            <li>Credit add-on purchases where credits have been partially or fully consumed</li>
            <li>Purchases made with promotional or coupon codes that explicitly stated &quot;non-refundable&quot;</li>
            <li>Service interruptions caused by factors beyond our control (force majeure)</li>
            <li>Third-party payment processing fees (these are retained by the payment processor)</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            In exceptional circumstances, we may consider refund requests outside the stated policy on a case-by-case
            basis. Please contact our billing team with detailed information about your situation.
          </p>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">7. Partial Refunds</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            In certain situations, partial refunds may be issued:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Service outages:</strong> If the Service experiences significant downtime (more than 24 consecutive
              hours), affected users may receive a prorated credit to their account.</li>
            <li><strong>Billing errors:</strong> If you were charged incorrectly due to a billing error, we will issue
              a full refund for the incorrect charge.</li>
            <li><strong>Plan changes:</strong> If you upgrade or downgrade your plan mid-cycle, prorated charges or
              credits will be applied automatically.</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">8. Contact Information</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            For refund requests or billing inquiries, please contact us:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Billing Email:</strong> billing@acquisitionos.com</li>
            <li><strong>Legal Email:</strong> legal@acquisitionos.com</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
