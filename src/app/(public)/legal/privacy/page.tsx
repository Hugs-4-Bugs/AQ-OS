import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — AcquisitionOS',
  description: 'Learn how AcquisitionOS collects, uses, and protects your personal data.',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="container-app px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Privacy Policy
          </h1>
          <p className="text-xs text-muted-foreground italic">Last updated: November 10, 2026</p>
          <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
        </div>

        {/* Intro */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          AcquisitionOS (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting the privacy of our users.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
          AI-powered client acquisition platform accessible at acquisitionos.com (the &quot;Service&quot;). Please read this
          policy carefully. By using the Service, you agree to the practices described herein.
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">1. Information We Collect</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">1.1 Personal Information</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We collect personal information that you voluntarily provide to us when you:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Register for an account (name, email address, phone number, company name)</li>
            <li>Complete your profile (industry, niche, target market, business size)</li>
            <li>Subscribe to a paid plan (billing name, address, tax identification numbers)</li>
            <li>Contact our support team (communication content, attachments)</li>
            <li>Participate in surveys or promotions (responses, feedback)</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">1.2 Usage Data</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We automatically collect certain information when you access and use the Service, including:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Device information (device type, operating system, browser type and version)</li>
            <li>IP address and approximate geographic location</li>
            <li>Access times, pages viewed, and time spent on pages</li>
            <li>Click patterns, feature usage, and navigation paths</li>
            <li>Referring URL and exit pages</li>
            <li>Search queries within the platform</li>
            <li>Lead discovery parameters and outreach campaign metrics</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">1.3 Cookies and Tracking Technologies</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We use cookies, web beacons, pixel tags, and similar tracking technologies to collect usage data and improve
            your experience. For detailed information, please refer to our{' '}
            <a href="/legal/cookies" className="text-primary font-medium hover:underline">Cookie Policy</a>.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">1.4 Data from Third-Party Services</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We receive information from third-party services when you connect or authorize them:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Google:</strong> Email, name, profile picture when you sign in via Google OAuth</li>
            <li><strong>Telegram:</strong> Chat ID, username when you connect Telegram for notifications</li>
            <li><strong>WhatsApp:</strong> Phone number, WhatsApp Business account details when you connect via API</li>
            <li><strong>Stripe / Razorpay:</strong> Payment method details (last 4 digits, card brand), billing address, transaction status</li>
            <li><strong>Google Calendar:</strong> Availability data, event metadata when you connect calendar services</li>
            <li><strong>Gmail:</strong> Email metadata for outreach campaigns when you connect Gmail integration</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">2. How We Use Your Information</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">2.1 Service Delivery</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We use your information to:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Create and manage your account and subscription</li>
            <li>Provide AI-powered lead analysis, scoring, and recommendations</li>
            <li>Execute outreach campaigns and track their performance</li>
            <li>Process billing and credit transactions</li>
            <li>Deliver notifications, reminders, and follow-up suggestions</li>
            <li>Enable messaging integrations (Telegram, WhatsApp, Email)</li>
            <li>Provide customer support and respond to inquiries</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.2 AI Usage and Processing</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS uses artificial intelligence and machine learning models to analyze your data. Your data is
            processed by AI models for the following purposes:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-2 space-y-1">
            <li><strong>Lead Scoring:</strong> Evaluating and ranking potential leads based on relevance, engagement likelihood, and conversion probability</li>
            <li><strong>Outreach Optimization:</strong> Generating personalized outreach messages, email templates, and communication strategies</li>
            <li><strong>Sales Coaching:</strong> Providing AI-driven sales advice, objection handling, and negotiation guidance</li>
            <li><strong>Predictive Insights:</strong> Forecasting deal outcomes, pipeline velocity, and revenue projections</li>
            <li><strong>Competitive Analysis:</strong> Analyzing competitor data and market positioning</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Your data is processed by AI models. The specific providers we integrate with are listed in
            Section 11A (AI Sub-processors). Each provider is engaged under a data processing arrangement
            and is contractually obligated to process data solely for our specified purposes.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            <strong>Company position on AI training.</strong> AcquisitionOS does not sell user data.
            AcquisitionOS does not use user data to train its own AI models. User data is not used for
            unrelated personal purposes. User data is not disclosed to third parties for their
            independent commercial use. Where a third-party AI provider is engaged, the data shared is
            limited to what is necessary to fulfil the user&apos;s explicit request (e.g. generating an
            outreach message), and the provider is bound by contractual restrictions on retention and
            training. The specific technical measures we apply per provider are documented in
            Section 11A.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">2.3 Communication</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We may use your information to:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Send service-related announcements (updates, security alerts, maintenance notices)</li>
            <li>Deliver marketing communications (with your consent where required)</li>
            <li>Respond to support tickets and inquiries</li>
            <li>Send onboarding and educational content about features</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.4 Improvement and Analytics</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We use aggregated and anonymized data to:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Analyze usage patterns and improve features</li>
            <li>Detect and prevent fraud, abuse, and security breaches</li>
            <li>Conduct research and development for new features</li>
            <li>Generate anonymized, aggregate analytics and reports</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">3. Billing Data and Payments</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Payment information is processed directly by our payment partners. We do not store full payment card numbers,
            bank account details, or other sensitive financial data on our servers.
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Stripe:</strong> Processes credit card and digital wallet payments. PCI DSS Level 1 certified. Stripe stores tokenized payment details.</li>
            <li><strong>Razorpay:</strong> Processes payments including cards, UPI, net banking, and wallets for Indian users. PCI DSS Level 1 certified.</li>
            <li>We may retain the last 4 digits of your card number, card brand, and billing address for receipt and record-keeping purposes.</li>
            <li>Transaction records are retained for 7 years as required by applicable tax and financial regulations.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">4. Credits System</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS uses a credits system to allocate usage of AI-powered features:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Each subscription plan includes a monthly allocation of credits</li>
            <li>Unused monthly credits roll over to the next billing period</li>
            <li>Addon credits (purchased separately) do not expire while your account is active</li>
            <li>Credit usage history is tracked and accessible in your account settings</li>
            <li>Credits have no monetary value and cannot be transferred, sold, or exchanged</li>
          </ul>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">5. Data Storage and Security</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">5.1 Data Storage</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Your data is stored on secure servers. We take appropriate measures to ensure your data receives an adequate level
            of protection in accordance with applicable laws.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">5.2 Security Measures</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We implement industry-standard security measures including:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Encryption of data in transit using TLS 1.2+ (HTTPS)</li>
            <li>Encryption of data at rest using AES-256</li>
            <li>Regular security audits and vulnerability assessments</li>
            <li>Access controls and authentication requirements for internal systems</li>
            <li>Secure API key management with hashing and scoped permissions</li>
            <li>Regular backups with encrypted storage</li>
            <li>Incident response and breach notification procedures</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">5.3 Data Retention</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We retain your personal data for as long as necessary to fulfill the purposes outlined in this policy:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Account data:</strong> Retained while your account is active and for 30 days after deletion for recovery purposes</li>
            <li><strong>Billing records:</strong> Retained for 7 years as required by tax and financial regulations</li>
            <li><strong>Usage logs:</strong> Retained for 12 months, then anonymized or deleted</li>
            <li><strong>Communication records:</strong> Retained for the duration of your account plus 30 days</li>
            <li><strong>Support tickets:</strong> Retained for 3 years from resolution</li>
            <li><strong>AI training data:</strong> Anonymized within 30 days of collection; never stored with personally identifiable information</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">6. Integrations</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            When you connect third-party integrations, the following data may be shared:
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold">Integration</th>
                  <th className="text-left py-2 pr-4 font-semibold">Data Shared</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b"><td className="py-2 pr-4">Gmail</td><td className="py-2 pr-4">Email metadata, contacts for outreach campaigns</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Telegram</td><td className="py-2 pr-4">Chat ID, username, message content for notifications</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">WhatsApp</td><td className="py-2 pr-4">Phone number, message content, delivery status</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Google Calendar</td><td className="py-2 pr-4">Event metadata, availability for scheduling</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Google OAuth</td><td className="py-2 pr-4">Email, name, profile picture for sign-in</td></tr>
                <tr><td className="py-2 pr-4">AI providers (see Section 11A)</td><td className="py-2 pr-4">Lead data, prompts, message context necessary to fulfil AI requests (under data processing agreements; per-provider retention measures documented in Section 11A)</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">7. Your Rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Depending on your jurisdiction, you may have the following rights regarding your personal data:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Right of Access:</strong> Request a copy of the personal data we hold about you. You can export your data from Settings &gt; Data &amp; Privacy, or contact us.</li>
            <li><strong>Right to Rectification:</strong> Request correction of inaccurate or incomplete personal data. Update most profile information directly in the platform.</li>
            <li><strong>Right to Erasure:</strong> Request deletion of your personal data, subject to legal retention requirements. Navigate to Settings &gt; Data &amp; Privacy &gt; Delete Account.</li>
            <li><strong>Right to Data Portability:</strong> Receive your personal data in a structured, machine-readable format (JSON or CSV). Export from the platform or contact us.</li>
            <li><strong>Right to Object:</strong> Object to the processing of your personal data for direct marketing purposes or when processing is based on legitimate interests.</li>
            <li><strong>Automated Decision-Making:</strong> Not be subject to decisions based solely on automated processing. Our AI features assist (not replace) human decision-making.</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">8. GDPR Compliance</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            For users in the European Economic Area (EEA), United Kingdom, and Switzerland, we comply with the General Data
            Protection Regulation (GDPR). Our lawful bases for processing include:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Contractual necessity:</strong> Processing required to deliver the Service under our Terms &amp; Conditions</li>
            <li><strong>Legitimate interests:</strong> Processing for fraud prevention, security, service improvement, and analytics</li>
            <li><strong>Consent:</strong> Processing for marketing communications and non-essential cookies</li>
            <li><strong>Legal obligation:</strong> Processing required by applicable law (e.g., tax record retention)</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For cross-border data transfers from the EEA, we rely on Standard Contractual Clauses (SCCs) approved by the
            European Commission or other adequate transfer mechanisms. You may lodge a complaint with your local data protection authority.
          </p>
        </section>

        {/* Section 8b - Email Consent */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">9. Email Communications &amp; Consent</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">9.1 Transactional Emails</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We send transactional emails that are necessary for the operation of your account. These include:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Account verification and password reset emails</li>
            <li>Payment receipts and billing notifications</li>
            <li>Security alerts and suspicious activity notifications</li>
            <li>Service announcements affecting your account (maintenance, policy changes)</li>
            <li>Lead notification alerts and follow-up reminders you have enabled</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Transactional emails cannot be unsubscribed from as they are essential for the Service. You may disable specific
            lead notification types in your notification preferences.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">9.2 Marketing Emails</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            With your explicit consent, we may send marketing communications including:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Product updates and new feature announcements</li>
            <li>Tips and best practices for using the platform</li>
            <li>Promotional offers and plan upgrade opportunities</li>
            <li>Event invitations and webinar announcements</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Marketing emails require your opt-in consent. You can opt out at any time by clicking the &quot;Unsubscribe&quot; link
            at the bottom of any marketing email, or by updating your email preferences in Settings &gt; Notifications. Opting
            out of marketing emails does not affect transactional emails.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">9.3 Email Consent Management</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can manage your email preferences at any time from Settings &gt; Notifications. We honor all opt-out
            requests within 48 hours. If you believe you are receiving emails in error, please contact us at
            legal@acquisitionos.com.
          </p>
        </section>

        {/* Section 10 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">10. API Usage Data</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            If you use the AcquisitionOS API, we collect:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>API request metadata (endpoint, method, response code, latency)</li>
            <li>API key identifier used for the request</li>
            <li>Request rate and volume data for rate limiting and abuse detection</li>
            <li>Error logs for debugging (with PII redacted after 30 days)</li>
          </ul>
        </section>

        {/* Section 11 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">11. Third-Party Services</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We integrate with and share data with the following third-party service providers:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Stripe, Inc.</strong> — Payment processing (PCI DSS Level 1)</li>
            <li><strong>Razorpay Software Private Ltd.</strong> — Payment processing for Indian users (PCI DSS Level 1)</li>
            <li><strong>Google LLC</strong> — OAuth 2.0 sign-in, Gmail integration, Calendar integration</li>
            <li><strong>Telegram Messenger Inc.</strong> — Notification delivery via Telegram Bot API</li>
            <li><strong>WhatsApp / Meta Platforms, Inc.</strong> — Business messaging via WhatsApp Business API</li>
            <li><strong>AI providers</strong> — see Section 11A for the full list of AI sub-processors, the data shared with each, and the per-provider retention controls applied.</li>
          </ul>

          {/* Section 11A — AI Sub-processors */}
          <h3 className="text-base font-semibold mt-5 mb-2">11A. AI Sub-processors — Full Disclosure</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS integrates with the following AI model providers. The provider used for a
            specific request depends on (a) your per-user provider configuration (if you have connected
            your own API key in Settings → AI Providers), (b) the workflow&apos;s configured provider,
            or (c) our default provider. When you do not select a provider, our default is the Z-AI
            gateway.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold">Provider</th>
                  <th className="text-left py-2 pr-4 font-semibold">Role</th>
                  <th className="text-left py-2 pr-4 font-semibold">Data shared</th>
                  <th className="text-left py-2 pr-4 font-semibold">Retention / training controls applied</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 pr-4">Z-AI (Zhipu AI)</td>
                  <td className="py-2 pr-4">Default provider — chat, lead analysis, scoring, outreach, enrichment, agents</td>
                  <td className="py-2 pr-4">System prompt, lead context (business name, niche, location), outreach channel/tone, message history for the current request</td>
                  <td className="py-2 pr-4">Provider DPA in place; no-train attestation required from provider. <strong>Status: provider attestation pending — treat as a sub-processor that may retain prompts per its standard policy until attestation is on file.</strong></td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">OpenAI</td>
                  <td className="py-2 pr-4">User-selectable provider for chat, analysis, outreach</td>
                  <td className="py-2 pr-4">Same as Z-AI</td>
                  <td className="py-2 pr-4"><code>store: false</code> set on every API call (opts out of 30-day retention and model training).</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Anthropic</td>
                  <td className="py-2 pr-4">User-selectable provider</td>
                  <td className="py-2 pr-4">Same as Z-AI</td>
                  <td className="py-2 pr-4">Anthropic&apos;s default commercial API policy prohibits use of customer data for model training.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">OpenRouter</td>
                  <td className="py-2 pr-4">User-selectable provider (aggregator)</td>
                  <td className="py-2 pr-4">Same as Z-AI, plus the referring-app identifier header</td>
                  <td className="py-2 pr-4">Retention depends on the underlying model provider routed to by OpenRouter. Per-provider attestation required.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Google Gemini</td>
                  <td className="py-2 pr-4">User-selectable provider</td>
                  <td className="py-2 pr-4">Same as Z-AI</td>
                  <td className="py-2 pr-4">Gemini API on Google Cloud: data is processed per Google Cloud&apos;s Customer Data Processing terms. Enterprise tier offers Zero Data Retention.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">DeepSeek</td>
                  <td className="py-2 pr-4">User-selectable provider</td>
                  <td className="py-2 pr-4">Same as Z-AI</td>
                  <td className="py-2 pr-4">Per-provider DPA required. <strong>Status: DPA pending — not enabled in production until DPA is in place.</strong></td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Local LLM (Ollama / LM Studio)</td>
                  <td className="py-2 pr-4">Self-hosted fallback (you host the model)</td>
                  <td className="py-2 pr-4">Same as Z-AI</td>
                  <td className="py-2 pr-4">No data leaves your infrastructure. You are responsible for the retention policy of your self-hosted model.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            <strong>What we send to AI providers.</strong> For each AI request, AcquisitionOS sends:
            the system prompt (instructions), the user&apos;s input or question, and any context
            needed to generate a useful response. For lead-analysis requests this includes lead
            attributes (business name, niche, country, website URL). For outreach-generation
            requests it includes the lead&apos;s name and the desired channel/tone. For AI chat it
            includes the user-typed message and any lead context the user has explicitly attached.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            <strong>What we do NOT send.</strong> We do not send your password, JWT, API keys, or
            payment card numbers to any AI provider. We do not send other tenants&apos; data. We do
            not send emails you have received via the Gmail integration to AI providers unless you
            explicitly request reply-intelligence analysis on a specific message.
          </p>

          {/* Section 11B — DPDP Act 2023 */}
          <h3 className="text-base font-semibold mt-5 mb-2">11B. Digital Personal Data Protection Act, 2023 (India)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS is subject to the Digital Personal Data Protection Act, 2023 (&quot;DPDP
            Act&quot;) and the Digital Personal Data Protection Rules, 2025 (&quot;DPDP Rules&quot;)
            for users in India. The phased enforcement dates per the official notifications are:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-2 space-y-1">
            <li><strong>13 November 2025</strong> — initial provisions of the DPDP Act commenced.</li>
            <li><strong>13 November 2026</strong> — one-year phase, including specified Consent Manager provisions.</li>
            <li><strong>13 May 2027</strong> — eighteen-month phase, including the principal substantive obligations on Data Fiduciaries.</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            AcquisitionOS acts as a Data Fiduciary for the personal data you entrust to us. Our
            obligations under the DPDP Act include:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-2 space-y-1">
            <li>Obtaining consent through an affirmative action for each processing purpose that requires consent, before processing begins.</li>
            <li>Providing a clear and easily understandable notice at the point of collection.</li>
            <li>Allowing you to withdraw consent as easily as you gave it.</li>
            <li>Providing a grievance redressal mechanism (contact: <a href="mailto:dpo@acquisitionos.com" className="text-primary hover:underline">dpo@acquisitionos.com</a>).</li>
            <li>Enabling your rights of access, correction, completion, updating, and erasure.</li>
            <li>Implementing reasonable security safeguards appropriate to the sensitivity of the data.</li>
            <li>Notifying affected users and the Data Protection Board of India in the event of a personal data breach, within the timelines specified by the DPDP Rules.</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            For consent withdrawal, account deletion, or data access requests, see Section 7 (Your
            Privacy Rights) or email <a href="mailto:dpo@acquisitionos.com" className="text-primary hover:underline">dpo@acquisitionos.com</a>.
            We will acknowledge your request within 48 hours and respond substantively within the
            timelines prescribed by the DPDP Rules.
          </p>
        </section>

        {/* Section 12 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">12. Children&apos;s Privacy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The Service is not intended for individuals under the age of 18. We do not knowingly collect personal data from
            children. If we become aware that we have collected personal data from a child under 18, we will take steps to
            delete that information promptly. If you believe a child has provided us with personal information, please
            contact us at legal@acquisitionos.com.
          </p>
        </section>

        {/* Section 13 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">13. Changes to This Privacy Policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We may update this Privacy Policy from time to time. We will notify you of any material changes by:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Posting the updated policy on acquisitionos.com with a new &quot;Last updated&quot; date</li>
            <li>Sending an email notification to registered users for significant changes</li>
            <li>Displaying an in-app notification for changes that affect data processing practices</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your continued use of the Service after the effective date of any changes constitutes your acceptance of the
            updated Privacy Policy.
          </p>
        </section>

        {/* Section 14 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">14. Contact Information</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us:</p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Email:</strong> legal@acquisitionos.com</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
            <li><strong>Data Protection Officer:</strong> dpo@acquisitionos.com</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
