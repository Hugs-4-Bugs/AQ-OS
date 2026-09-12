import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Retention Policy — AcquisitionOS',
  description: 'How long AcquisitionOS retains your data and how deletion works.',
};

export default function DataRetentionPage() {
  return (
    <article className="container-app px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Data Retention Policy
          </h1>
          <p className="text-xs text-muted-foreground italic">Last updated: March 4, 2026</p>
          <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
        </div>

        {/* Intro */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          This Data Retention Policy describes how long AcquisitionOS retains your personal data, the criteria we use
          to determine retention periods, and the procedures for data deletion. This policy should be read alongside
          our <a href="/legal/privacy" className="text-primary font-medium hover:underline">Privacy Policy</a> and{' '}
          <a href="/legal/gdpr" className="text-primary font-medium hover:underline">GDPR Data Processing Agreement</a>.
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">1. Retention Principles</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We retain personal data only for as long as necessary to fulfill the purposes for which it was collected,
            including:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Providing and maintaining the AcquisitionOS platform and your account</li>
            <li>Processing subscriptions, billing, and credit transactions</li>
            <li>Delivering AI-powered features (lead scoring, outreach, coaching, competitive analysis)</li>
            <li>Complying with legal, tax, and regulatory obligations</li>
            <li>Resolving disputes and enforcing our agreements</li>
            <li>Detecting and preventing fraud and security threats</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">2. Retention Periods by Data Category</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">2.1 User Account Data</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Profile information (name, email, phone, company): Retained while account is active and for 30 days after deletion for recovery purposes</li>
            <li>Organization membership and role data: Retained for the life of the organization or until membership is revoked</li>
            <li>Login credentials: Deleted within 30 days of account deletion</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.2 Lead and Pipeline Data</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Lead contact details, notes, and tags: Retained while account is active and for 30 days after deletion</li>
            <li>Pipeline stages and deal records: Retained while account is active and for 30 days after deletion</li>
            <li>Lead scores and AI analysis results: Retained for 12 months, then deleted</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.3 Messages and Outreach Data</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Outreach campaign records and message content: Retained while account is active and for 30 days after deletion</li>
            <li>AI-generated outreach templates: Retained for the duration of the associated campaign</li>
            <li>Delivery status and open/click tracking: Retained for 12 months, then deleted</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.4 Payment and Billing Data</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Transaction records and receipts: Retained for 7 years as required by applicable tax and financial regulations</li>
            <li>Tokenized payment method details (via Stripe/Razorpay): Managed by our payment providers per their retention policies</li>
            <li>Credit purchase and usage history: Retained for 7 years alongside billing records</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.5 Session and Authentication Data</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Active session tokens: Expire after 7 days of inactivity</li>
            <li>Refresh tokens: Expire after 30 days of inactivity</li>
            <li>Login history: Retained for 12 months for security auditing</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.6 Logs and Analytics</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Usage logs (pages viewed, feature interactions): Retained for 12 months, then anonymized or deleted</li>
            <li>API request logs: Retained for 12 months with PII redacted after 30 days</li>
            <li>Error logs: Retained for 6 months, then deleted</li>
            <li>Security audit logs: Retained for 24 months</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">2.7 Support and Communication Data</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Support tickets and correspondence: Retained for 3 years from resolution</li>
            <li>Communication records (Telegram, WhatsApp, email metadata): Retained for the duration of your account plus 30 days</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">3. Data Deletion Procedures</h2>
          <h3 className="text-base font-semibold mt-5 mb-2">3.1 User-Initiated Deletion</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            When you delete your account via Settings &gt; Data &amp; Privacy &gt; Delete Account:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Your account is immediately deactivated and the Service becomes inaccessible</li>
            <li>Your subscription is canceled and no further charges are applied</li>
            <li>Personal data is marked for deletion and permanently purged within 30 days</li>
            <li>Billing records are retained for 7 years as required by law</li>
            <li>You will receive a confirmation email once deletion is complete</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">3.2 Anonymization vs. Deletion</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Where data retention is required (e.g., aggregated analytics, security logs), we may anonymize data instead
            of deleting it. Anonymized data cannot be linked back to an identifiable individual and is not subject to
            data subject rights requests. We use industry-standard anonymization techniques including data aggregation,
            pseudonymization, and removal of direct identifiers.
          </p>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">4. Legal Holds</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            AcquisitionOS may suspend data deletion if we are required to retain data due to:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>A valid legal request, court order, or government investigation</li>
            <li>An ongoing dispute or litigation to which the data is relevant</li>
            <li>A regulatory audit or compliance requirement</li>
            <li>Suspected fraud, abuse, or security breach investigation</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            During a legal hold, affected data will be preserved until the hold is lifted. You will be notified if
            a legal hold affects your data deletion request, to the extent permitted by law.
          </p>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">5. Backup Retention</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We maintain encrypted backups of platform data for disaster recovery purposes:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Daily backups are retained for 14 days</li>
            <li>Weekly backups are retained for 90 days</li>
            <li>Monthly backups are retained for 12 months</li>
            <li>When your data is deleted from the live system, it is removed from subsequent backups</li>
            <li>Data in existing backups may persist until the backup rotation cycle completes</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Backup data is encrypted and access is strictly controlled. It is only used for disaster recovery and
            is not used for any processing purpose.
          </p>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">6. Deletion Timeline Summary</h2>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold">Data Category</th>
                  <th className="text-left py-2 pr-4 font-semibold">Retention Period</th>
                  <th className="text-left py-2 font-semibold">After Deletion</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b"><td className="py-2 pr-4">Account data</td><td className="py-2 pr-4">While active</td><td className="py-2">30 days</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Lead &amp; pipeline data</td><td className="py-2 pr-4">While active</td><td className="py-2">30 days</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Outreach records</td><td className="py-2 pr-4">While active</td><td className="py-2">30 days</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Communication records</td><td className="py-2 pr-4">While active</td><td className="py-2">30 days</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Usage &amp; API logs</td><td className="py-2 pr-4">12 months</td><td className="py-2">Anonymized/deleted</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Support tickets</td><td className="py-2 pr-4">3 years from resolution</td><td className="py-2">Deleted</td></tr>
                <tr className="border-b"><td className="py-2 pr-4">Security audit logs</td><td className="py-2 pr-4">24 months</td><td className="py-2">Deleted</td></tr>
                <tr><td className="py-2 pr-4">Billing records</td><td className="py-2 pr-4">7 years (legal requirement)</td><td className="py-2">Not eligible for early deletion</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">7. Contact Information</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            To request data deletion or ask questions about our retention practices:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Email:</strong> legal@acquisitionos.com</li>
            <li><strong>DPO:</strong> dpo@acquisitionos.com</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
