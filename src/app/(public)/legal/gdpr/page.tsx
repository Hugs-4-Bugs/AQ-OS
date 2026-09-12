import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GDPR Data Processing Agreement — AcquisitionOS',
  description: 'GDPR compliance information and Data Processing Agreement for AcquisitionOS users.',
};

export default function GDPRPage() {
  return (
    <article className="container-app px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            GDPR Data Processing Agreement
          </h1>
          <p className="text-xs text-muted-foreground italic">Last updated: March 4, 2026</p>
          <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
        </div>

        {/* Intro */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          This GDPR Data Processing Agreement (&quot;DPA&quot;) supplements our{' '}
          <a href="/legal/privacy" className="text-primary font-medium hover:underline">Privacy Policy</a> and applies to
          the processing of personal data of individuals in the European Economic Area (EEA), the United Kingdom, and
          Switzerland in connection with the AcquisitionOS platform at acquisitionos.com (the &quot;Service&quot;). This DPA is
          intended to comply with the requirements of the General Data Protection Regulation (EU) 2016/679 (&quot;GDPR&quot;).
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">1. Data Controller Details</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS acts as the Data Controller for personal data collected through the Service.
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Entity Name:</strong> AcquisitionOS</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
            <li><strong>Email:</strong> legal@acquisitionos.com</li>
            <li><strong>Data Protection Officer:</strong> dpo@acquisitionos.com</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">2. Legal Basis for Processing</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We process your personal data only when we have a lawful basis to do so under Article 6 of the GDPR:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Consent (Art. 6(1)(a)):</strong> Marketing communications, non-essential cookies, and optional data sharing with third-party integrations such as Gmail, Google Calendar, and WhatsApp</li>
            <li><strong>Contractual Necessity (Art. 6(1)(b)):</strong> Account creation and management, subscription billing via Stripe or Razorpay, AI-powered lead analysis, outreach campaigns, pipeline tracking, and credit consumption</li>
            <li><strong>Legitimate Interest (Art. 6(1)(f)):</strong> Fraud prevention, security monitoring, platform analytics, and service improvement</li>
            <li><strong>Legal Obligation (Art. 6(1)(c)):</strong> Tax record retention, billing compliance, and regulatory reporting</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">3. Categories of Personal Data Processed</h2>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Identity Data:</strong> Name, email address, phone number, company name, profile picture (from Google OAuth)</li>
            <li><strong>Account Data:</strong> Subscription plan, credit balance, billing preferences, notification settings</li>
            <li><strong>Business Data:</strong> Industry, niche, target market, business size, pipeline information</li>
            <li><strong>Lead Data:</strong> Contact details of leads, outreach messages, lead scores, engagement metrics</li>
            <li><strong>Communication Data:</strong> Telegram chat IDs, WhatsApp numbers, email metadata, support ticket content</li>
            <li><strong>Payment Data:</strong> Tokenized payment details via Stripe/Razorpay, transaction history, billing address</li>
            <li><strong>Usage Data:</strong> IP address, device info, pages viewed, feature usage, AI interaction logs</li>
            <li><strong>AI Processing Data:</strong> Lead data and prompts submitted for AI analysis (lead scoring, sales coaching, outreach generation)</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">4. Data Subject Rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Under Articles 12–23 of the GDPR, you have the following rights:
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">4.1 Right of Access (Art. 15)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may request a copy of all personal data we hold about you. Export your data directly from
            Settings &gt; Data &amp; Privacy, or contact us at legal@acquisitionos.com. We will respond within 30 days.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">4.2 Right to Rectification (Art. 16)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may request correction of inaccurate or incomplete data. Most data can be updated directly in the platform.
            For corrections that require our assistance, contact us and we will respond within 30 days.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">4.3 Right to Erasure (Art. 17)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may request deletion of your personal data. Navigate to Settings &gt; Data &amp; Privacy &gt; Delete Account
            or contact us. Certain data categories (e.g., billing records required for 7 years by law) may be retained.
            Upon account deletion, personal data is purged within 30 days.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">4.4 Right to Data Portability (Art. 20)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may receive your data in a structured, machine-readable format (JSON or CSV). Use the export feature in
            Settings &gt; Data &amp; Privacy, or request it from us. We will provide it within 30 days.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">4.5 Right to Object (Art. 21)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may object to processing based on legitimate interests (e.g., analytics). We will cease processing
            unless we demonstrate compelling legitimate grounds. Marketing emails can be opted out of at any time.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">4.6 Right to Restriction of Processing (Art. 18)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may request that we restrict processing of your data while the accuracy of the data is contested, processing
            is unlawful but you prefer restriction over erasure, or we no longer need the data but you require it for legal claims.
          </p>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">5. Data Retention Periods</h2>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Account data:</strong> Retained while active and for 30 days after deletion for recovery purposes</li>
            <li><strong>Billing records:</strong> Retained for 7 years as required by tax and financial regulations</li>
            <li><strong>Usage logs:</strong> Retained for 12 months, then anonymized or deleted</li>
            <li><strong>Communication records:</strong> Retained for the duration of your account plus 30 days</li>
            <li><strong>Support tickets:</strong> Retained for 3 years from resolution</li>
            <li><strong>AI training data:</strong> Anonymized within 30 days of collection</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For detailed retention information, see our{' '}
            <a href="/legal/data-retention" className="text-primary font-medium hover:underline">Data Retention Policy</a>.
          </p>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">6. International Data Transfers</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS is headquartered in India. Your data may be transferred to and processed in India and other
            jurisdictions where our service providers operate. For transfers from the EEA/UK, we ensure adequate protection through:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Standard Contractual Clauses (SCCs):</strong> We rely on SCCs adopted by the European Commission (Decision 2021/914) for transfers to non-adequate countries</li>
            <li><strong>Data Processing Agreements:</strong> All sub-processors (including OpenAI, Anthropic, Stripe, Razorpay) are bound by DPAs with GDPR-compliant terms</li>
            <li><strong>Adequacy Decisions:</strong> Where applicable, transfers to countries with an EU adequacy decision</li>
            <li><strong>Supplementary Measures:</strong> Technical and organizational measures to ensure data protection equivalent to the GDPR</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A list of our sub-processors is available upon request by contacting dpo@acquisitionos.com.
          </p>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">7. Data Protection Officer</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We have appointed a Data Protection Officer who can be contacted for any GDPR-related inquiries:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Email:</strong> dpo@acquisitionos.com</li>
            <li><strong>Response Time:</strong> We will acknowledge your request within 3 business days and respond substantively within 30 days</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">8. Data Breach Notification</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Notify the relevant supervisory authority within 72 hours of becoming aware of the breach (Art. 33)</li>
            <li>Notify you directly without undue delay if the breach is likely to result in a high risk to your rights and freedoms (Art. 34)</li>
            <li>Provide information about the nature of the breach, the data affected, likely consequences, and remedial measures taken</li>
            <li>Document all breaches, including facts, effects, and remedial actions taken</li>
          </ul>
        </section>

        {/* Section 9 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">9. How to Exercise Your Rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You may exercise any of the above rights by:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Using the in-app data export and deletion features in Settings &gt; Data &amp; Privacy</li>
            <li>Emailing us at legal@acquisitionos.com with your request and account verification details</li>
            <li>Contacting our DPO directly at dpo@acquisitionos.com</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We will verify your identity before processing your request. You may also lodge a complaint with your
            local data protection supervisory authority if you believe your rights have been violated.
          </p>
        </section>

        {/* Section 10 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">10. Automated Decision-Making</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            AcquisitionOS does not make decisions based solely on automated processing, including profiling, that
            produce legal effects or similarly significantly affect you. Our AI features (lead scoring, sales coaching,
            outreach suggestions, competitive analysis) are advisory in nature and designed to assist — not replace —
            human decision-making. You always have the ability to review, modify, or override any AI-generated suggestion.
            For more details, see our{' '}
            <a href="/legal/ai-disclaimer" className="text-primary font-medium hover:underline">AI Disclaimer</a>.
          </p>
        </section>

        {/* Section 11 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">11. Contact Information</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            For GDPR-related questions, data subject access requests, or breach notifications:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>General Legal:</strong> legal@acquisitionos.com</li>
            <li><strong>Data Protection Officer:</strong> dpo@acquisitionos.com</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
