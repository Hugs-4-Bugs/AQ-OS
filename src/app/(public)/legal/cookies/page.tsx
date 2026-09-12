import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy — AcquisitionOS',
  description: 'Learn how AcquisitionOS uses cookies and similar tracking technologies.',
};

export default function CookiePolicyPage() {
  return (
    <article className="container-app px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Cookie Policy
          </h1>
          <p className="text-xs text-muted-foreground italic">Last updated: March 4, 2026</p>
          <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
        </div>

        {/* Intro */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          This Cookie Policy explains how AcquisitionOS (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses cookies and similar tracking
          technologies when you visit and interact with our platform at acquisitionos.com. This policy should be read
          alongside our <a href="/legal/privacy" className="text-primary font-medium hover:underline">Privacy Policy</a>, which provides more detail on how we handle personal data.
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">1. What Are Cookies?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Cookies are small text files that are stored on your device (computer, tablet, or mobile phone) when you visit
            a website. They are widely used to make websites work more efficiently and to provide information to the owners
            of the site. Cookies allow websites to recognize your device and remember information about your visit, such as
            your preferred language and other settings.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            In addition to cookies, we may also use similar tracking technologies such as:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Web beacons / pixel tags:</strong> Small graphic images embedded in web pages or emails to track usage</li>
            <li><strong>Local storage:</strong> HTML5 local storage and session storage for persisting data on your device</li>
            <li><strong>IndexedDB:</strong> Browser-based database for storing structured data locally</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">2. Essential Cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            These cookies are strictly necessary for the operation of our platform. They enable core functionality such as
            authentication, security, and load balancing. You cannot opt out of these cookies as the Service cannot function
            properly without them.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie Name</th>
                  <th className="text-left py-2 pr-4 font-semibold">Purpose</th>
                  <th className="text-left py-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">acquisitionos_token</td><td className="py-2 pr-4">Authentication session token (JWT)</td><td className="py-2">7 days</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">acquisitionos_refresh</td><td className="py-2 pr-4">Refresh token for session persistence</td><td className="py-2">30 days</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">acquisitionos_consent</td><td className="py-2 pr-4">Stores your cookie consent preferences</td><td className="py-2">1 year</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">acquisitionos_prefs</td><td className="py-2 pr-4">Stores detailed cookie preference choices</td><td className="py-2">1 year</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">__RequestVerificationToken</td><td className="py-2 pr-4">CSRF protection token</td><td className="py-2">Session</td></tr>
                <tr><td className="py-2 pr-4 font-mono text-xs">next-auth.session-token</td><td className="py-2 pr-4">Session management (if applicable)</td><td className="py-2">Session</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">3. Analytics Cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            These cookies help us understand how visitors interact with our platform by collecting and reporting information
            anonymously. They allow us to measure the number of visitors, which pages they visit, and how long they spend
            on each page. This helps us improve the Service.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie Name</th>
                  <th className="text-left py-2 pr-4 font-semibold">Purpose</th>
                  <th className="text-left py-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">_ga</td><td className="py-2 pr-4">Google Analytics — Distinguishes unique visitors</td><td className="py-2">2 years</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">_ga_* </td><td className="py-2 pr-4">Google Analytics — Maintains session state</td><td className="py-2">2 years</td></tr>
                <tr><td className="py-2 pr-4 font-mono text-xs">aos_analytics</td><td className="py-2 pr-4">Platform usage analytics (internal)</td><td className="py-2">90 days</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            These cookies are only set if you consent to analytics cookies via the cookie consent banner.
          </p>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">4. Preference Cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            These cookies enable the platform to remember information that changes the way the platform behaves or looks,
            such as your preferred theme, display mode, or other customizable settings.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie Name</th>
                  <th className="text-left py-2 pr-4 font-semibold">Purpose</th>
                  <th className="text-left py-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">theme</td><td className="py-2 pr-4">Stores your light/dark theme preference</td><td className="py-2">1 year</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">compact_mode</td><td className="py-2 pr-4">Stores compact view preference</td><td className="py-2">1 year</td></tr>
                <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">country_pref</td><td className="py-2 pr-4">Stores your country setting</td><td className="py-2">1 year</td></tr>
                <tr><td className="py-2 pr-4 font-mono text-xs">niche_pref</td><td className="py-2 pr-4">Stores your industry niche preference</td><td className="py-2">1 year</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">5. Third-Party Cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            Some cookies are placed by third-party services that appear on our pages. We do not control these cookies and
            recommend that you review the privacy policies of these third-party providers.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">5.1 Payment Cookies (Stripe / Razorpay)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            When you initiate a payment, Stripe or Razorpay may set cookies to process your payment securely. These cookies
            are necessary for the payment to function. Stripe is PCI DSS Level 1 certified and Razorpay is PCI DSS Level 1
            certified.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">5.2 Google OAuth Cookies</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            When you sign in using your Google account, Google may set cookies for authentication purposes. These cookies
            are managed by Google and are subject to Google&apos;s privacy policy.
          </p>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">6. Managing Cookies</h2>

          <h3 className="text-base font-semibold mt-5 mb-2">6.1 Cookie Consent Banner</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            When you first visit our platform, you will be presented with a cookie consent banner that allows you to:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li><strong>Accept All:</strong> Accept essential, analytics, and marketing cookies</li>
            <li><strong>Reject Non-Essential:</strong> Accept only essential cookies (required for the platform to function)</li>
            <li><strong>Manage Preferences:</strong> Choose which categories of cookies to accept</li>
          </ul>

          <h3 className="text-base font-semibold mt-5 mb-2">6.2 Browser Settings</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You can control and manage cookies through your browser settings. Most browsers allow you to:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>View and delete existing cookies</li>
            <li>Block cookies from specific or all websites</li>
            <li>Block third-party cookies</li>
            <li>Block cookies from specific websites on future visits</li>
            <li>Receive a warning before a cookie is stored</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Please note that disabling certain cookies may affect the functionality of our platform. Essential cookies
            cannot be disabled as they are required for the Service to operate.
          </p>

          <h3 className="text-base font-semibold mt-5 mb-2">6.3 Opt-Out Links</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            For third-party cookies, you can opt out directly:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Google Analytics:</strong> Install the Google Analytics opt-out browser add-on</li>
            <li><strong>Google Ads:</strong> Use Google&apos;s Ad Settings to opt out of personalized advertising</li>
          </ul>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">7. Changes to This Cookie Policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We may update this Cookie Policy from time to time to reflect changes in the cookies we use or for other
            operational, legal, or regulatory reasons. We will notify you of any material changes by:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed mb-4 space-y-1">
            <li>Posting the updated policy on acquisitionos.com with a new &quot;Last updated&quot; date</li>
            <li>Re-showing the cookie consent banner to allow you to re-consent</li>
            <li>Sending an email notification for significant changes</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your continued use of the Service after the effective date of any changes constitutes your acceptance of the
            updated Cookie Policy.
          </p>
        </section>

        {/* Section 8 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">8. Contact Information</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            If you have any questions about this Cookie Policy or our use of cookies, please contact us:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Email:</strong> legal@acquisitionos.com</li>
            <li><strong>Website:</strong> acquisitionos.com</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
