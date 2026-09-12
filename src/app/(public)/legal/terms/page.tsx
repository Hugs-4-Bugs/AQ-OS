import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions — AcquisitionOS',
  description: 'Terms and conditions governing your use of the AcquisitionOS platform.',
};

export default function TermsAndConditionsPage() {
  return (
    <article className="container-app px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Terms &amp; Conditions
          </h1>
          <p className="text-xs text-muted-foreground italic">Last updated: March 4, 2026</p>
          <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
        </div>

        {/* Intro */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of AcquisitionOS, an AI-powered client
          acquisition system provided via acquisitionos.com (the &quot;Service&quot;). By creating an account or using the Service,
          you agree to be bound by these Terms. If you do not agree with any part of these Terms, you must not use the Service.
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">1. Acceptance of Terms</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            By accessing or using the Service, you acknowledge that you have read, understood, and agree to be bound by these
            Terms in their entirety. If you do not agree, you must discontinue use of the Service immediately. We recommend
            that you print or save a copy of these Terms for your records.
          </p>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">2. Service Description</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS is an AI-powered client acquisition system that provides the following capabilities:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Lead discovery and enrichment using AI algorithms</li>
            <li>Automated outreach campaign management (email, Telegram, WhatsApp)</li>
            <li>Pipeline tracking and deal management</li>
            <li>AI sales coaching and objection handling assistance</li>
            <li>Competitive intelligence and market analysis</li>
            <li>Automated workflow creation and management</li>
            <li>Insights and analytics dashboards</li>
            <li>Team collaboration and organization management</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with reasonable
            notice for material changes. We shall not be liable for any modification, suspension, or discontinuance of the Service.
          </p>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">3. Account Registration and Security</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">3.1 Account Creation</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            To use the Service, you must create an account by providing accurate, complete, and current information. You may
            register using your email address and password, or through Google OAuth. You are responsible for:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized use of your account</li>
            <li>Ensuring your account information remains accurate and up to date</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">3.2 Account Restrictions</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">You must not:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Create multiple accounts for the purpose of abusing free tier benefits</li>
            <li>Share your account credentials with others</li>
            <li>Use another user&apos;s account without authorization</li>
            <li>Create an account using false or misleading information</li>
            <li>Use the Service if you are under 18 years of age</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">3.3 Organization Accounts</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            If you create or join an organization within the Service, the organization owner or administrator may have
            access to certain data within the organization context. You acknowledge that content shared within an organization
            may be visible to other members as determined by the organization&apos;s settings.
          </p>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">4. Subscription Plans</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">The Service offers the following subscription plans:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Free:</strong> Limited access with basic features and a monthly credit allocation</li>
            <li><strong>Pro:</strong> Full feature access with expanded credits and advanced AI capabilities</li>
            <li><strong>Elite:</strong> Premium access with maximum credits, priority support, and exclusive features</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Plan features and pricing are subject to change with 30 days&apos; advance notice. Current subscribers will be
            grandfathered at existing rates until their current billing period ends.
          </p>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">5. Credits System</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">5.1 Monthly Allocation</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Each subscription plan includes a monthly allocation of credits. Credits are consumed when using certain
            AI-powered features, including but not limited to:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Lead discovery and enrichment</li>
            <li>Outreach message generation</li>
            <li>Sales coaching interactions</li>
            <li>Competitive analysis reports</li>
            <li>AI assistant queries</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">5.2 Rollover and Expiration</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Monthly plan credits do not expire and rollover to the next billing period. Addon credits (purchased separately)
            do not expire as long as your account remains active. Credits have no monetary value and cannot be transferred,
            sold, or exchanged.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">5.3 Add-on Purchases</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You may purchase additional credits as add-ons. Credit purchases are final and non-refundable except as
            outlined in our <a href="/legal/refund" className="text-primary font-medium hover:underline">Refund Policy</a>. Credits are allocated immediately upon successful payment.
          </p>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">6. Payment Terms</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">6.1 Billing Cycle</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Subscriptions are billed on a monthly or annual basis, depending on your selected plan. Payment is processed
            at the beginning of each billing cycle through our payment partners (Stripe or Razorpay). You authorize us to
            charge the applicable fees to your designated payment method.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">6.2 Price Changes</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We may change our pricing at any time. We will provide at least 30 days&apos; notice before any price increase
            takes effect. If you do not agree with the new pricing, you may cancel your subscription before the change
            takes effect.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">6.3 Taxes</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All prices are exclusive of applicable taxes unless otherwise stated. For Indian users, Goods and Services Tax
            (GST) will be applied at the prevailing rate. For international users, applicable local taxes may be charged
            based on your billing address.
          </p>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">7. Refund Policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We offer a 14-day money-back guarantee for new subscriptions. For full details, please refer to our{' '}
            <a href="/legal/refund" className="text-primary font-medium hover:underline">Refund Policy</a>.
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>New subscriptions may be refunded within 14 days of the initial purchase</li>
            <li>Credit add-on purchases are non-refundable once credits have been used</li>
            <li>Subscription cancellations provide access until the end of the current billing period</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">8. Intellectual Property</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">8.1 Our Intellectual Property</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            The Service, including its original content, features, functionality, software, and design, is owned by
            AcquisitionOS and is protected by international copyright, trademark, patent, trade secret, and other
            intellectual property laws. You may not:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Copy, modify, or distribute any part of the Service without our written consent</li>
            <li>Reverse engineer, decompile, or disassemble the Service</li>
            <li>Use our trademarks, logos, or branding without prior authorization</li>
            <li>Create derivative works based on the Service</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">8.2 Your Content</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You retain ownership of all content you upload to the Service. By uploading content, you grant us a limited,
            non-exclusive, worldwide license to process, store, and use such content solely for the purpose of providing
            the Service to you.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">8.3 AI-Generated Content Disclaimer</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Content generated by the AI features (outreach messages, sales scripts, competitive analyses, lead scoring,
            sales coaching) is provided to you for your use. You acknowledge the following:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-2 space-y-1">
            <li>AI-generated content may not be unique — similar outputs may be generated for other users with similar inputs</li>
            <li>AI analysis and scoring are probabilistic — they do not guarantee any specific outcome or conversion rate</li>
            <li>You are solely responsible for reviewing, verifying, and editing all AI-generated content before sending or relying on it</li>
            <li>We make no warranties regarding the accuracy, completeness, or suitability of AI-generated content for any particular purpose</li>
            <li>AI-generated recommendations should not be considered professional legal, financial, or business advice</li>
            <li>You assume all risk and responsibility for actions taken based on AI-generated insights</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our AI features are designed to assist and augment your decision-making, not replace it. Always apply your own
            judgment and due diligence when using AI-generated outputs.
          </p>
        </section>

        {/* Section 9 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">9. Acceptable Use</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">You agree not to use the Service to:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Violate any applicable law, regulation, or third-party right</li>
            <li>Send unsolicited bulk email (spam) or violate anti-spam laws</li>
            <li>Harass, abuse, or threaten others</li>
            <li>Collect personal data without consent</li>
            <li>Introduce viruses, malware, or other harmful code</li>
            <li>Attempt to gain unauthorized access to our systems or other users&apos; accounts</li>
            <li>Use the Service for any purpose that is unlawful or prohibited by these Terms</li>
            <li>Scrape, crawl, or extract data from the Service through automated means</li>
          </ul>
        </section>

        {/* Section 10 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">10. API Terms of Service</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">10.1 API Access</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">API access is subject to the following terms:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>You must authenticate all API requests using valid API keys</li>
            <li>API keys are personal and must not be shared, published, or distributed</li>
            <li>You must not attempt to circumvent API rate limits or access restrictions</li>
            <li>API usage is subject to fair use policies and rate limiting</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">10.2 Rate Limits</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            API rate limits vary by plan tier. Exceeding rate limits will result in temporary request throttling (HTTP 429).
            Persistent abuse may result in API access revocation.
          </p>
        </section>

        {/* Section 11 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">11. Data Processing and GDPR</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We process your personal data in accordance with our{' '}
            <a href="/legal/privacy" className="text-primary font-medium hover:underline">Privacy Policy</a>. For EEA users,
            we comply with the General Data Protection Regulation (GDPR). Our lawful bases for processing include
            contractual necessity, legitimate interests, consent, and legal obligation.
          </p>
        </section>

        {/* Section 12 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">12. Limitation of Liability</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>The Service is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without warranties of any kind, either express or implied</li>
            <li>We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components</li>
            <li>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities</li>
            <li>Our total liability to you for any claims arising from or related to the Service shall not exceed the amount you paid to us in the 12 months preceding the event giving rise to the claim</li>
            <li>We are not liable for the actions or omissions of third-party service providers</li>
            <li>We are not liable for any loss or damage arising from your reliance on AI-generated content or recommendations</li>
          </ul>
        </section>

        {/* Section 13 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">13. Indemnification</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You agree to indemnify, defend, and hold harmless AcquisitionOS and its officers, directors, employees, agents,
            and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including
            reasonable attorneys&apos; fees) arising from:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Your use of the Service in violation of these Terms</li>
            <li>Your violation of any applicable law or regulation</li>
            <li>Your infringement of any third party&apos;s intellectual property or other rights</li>
            <li>Content you upload or transmit through the Service</li>
            <li>Any outreach or communications sent through the Service that violate anti-spam laws or regulations</li>
          </ul>
        </section>

        {/* Section 14 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">14. Account Termination</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">14.1 Termination by You</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may terminate your account at any time by navigating to Settings &gt; Data &amp; Privacy &gt; Delete Account
            or by contacting us at legal@acquisitionos.com. Upon termination:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Your subscription will be canceled and no further charges will apply</li>
            <li>Unused credits will be forfeited</li>
            <li>Your data will be retained for 30 days for recovery purposes, then permanently deleted</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">14.2 Termination by Us</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We may suspend or terminate your account if:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>You violate these Terms</li>
            <li>You engage in fraudulent, abusive, or illegal activity</li>
            <li>Payment for your subscription fails and remains unresolved for 15 days</li>
            <li>We are required to do so by law or legal process</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We will provide reasonable notice (via email) before termination for non-material breaches, allowing you an
            opportunity to cure the breach within 15 days.
          </p>
        </section>

        {/* Section 15 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">15. Governing Law</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            These Terms shall be governed by and construed in accordance with the laws of India, without regard to its
            conflict of law provisions. Any dispute arising out of or relating to these Terms shall be resolved through
            binding arbitration in accordance with the Arbitration and Conciliation Act, 1996 (India). The arbitration
            shall be conducted in English, and the seat of arbitration shall be Bangalore, India.
          </p>
        </section>

        {/* Section 16 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">16. Changes to Terms</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We reserve the right to modify these Terms at any time. We will notify you of material changes by:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Posting updated Terms on acquisitionos.com with a revised &quot;Last updated&quot; date</li>
            <li>Sending an email to your registered email address</li>
            <li>Displaying an in-app notification</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Changes become effective 30 days after notification unless otherwise stated. Your continued use of the Service
            after the effective date constitutes acceptance of the modified Terms.
          </p>
        </section>

        {/* Section 17 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">17. Contact Information</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">For questions about these Terms, please contact us:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Email:</strong> legal@acquisitionos.com</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
