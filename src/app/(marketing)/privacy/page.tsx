'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, ShieldCheck, Lock } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const currentDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to App</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm sm:text-base">Privacy Policy</span>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Legal Document
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Card className="shadow-md">
          <CardContent className="p-6 sm:p-10">
            {/* Title Section */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
                Privacy Policy
              </h1>
              <p className="text-sm text-muted-foreground">
                <strong>Effective Date:</strong> March 1, 2025 &nbsp;|&nbsp;{' '}
                <strong>Last Updated:</strong> {currentDate}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                AcquisitionOS (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to
                protecting your privacy. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use our AI-powered B2B lead
                discovery and outreach platform (the &quot;Service&quot;). Please read this policy
                carefully. By using AcquisitionOS, you agree to the practices described herein.
              </p>
            </div>

            <Separator className="my-8" />

            {/* Section 1: Introduction */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  1
                </span>
                Introduction
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                QuantumFusion Solutions (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;)
                respects your privacy and is committed to protecting your personal data. This
                privacy policy explains how we collect, use, disclose, and safeguard your
                information when you use AcquisitionOS.
              </p>
              <p className="text-sm leading-relaxed">
                This policy applies to all users of the Service, regardless of subscription tier.
                It has been designed to comply with the General Data Protection Regulation (GDPR),
                the California Consumer Privacy Act (CCPA), and India&apos;s Digital Personal Data
                Protection Act, 2023 (DPDP Act).
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 2: Information We Collect */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  2
                </span>
                Information We Collect
              </h2>

              <h3 className="text-sm font-semibold mt-4 mb-2">2.1 Information You Provide</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Account Information:</strong> Name, email address, phone number, company
                  name, country, and timezone when you register for an account.
                </li>
                <li>
                  <strong>Business Information:</strong> Details about your business, target
                  markets, ideal customer profiles, and lead preferences that you provide to
                  configure the Service.
                </li>
                <li>
                  <strong>Payment Information:</strong> Billing address, GST/VAT numbers, and
                  payment method details processed securely through our payment partners (Stripe,
                  Razorpay). We do not store full credit card numbers on our servers.
                </li>
                <li>
                  <strong>Communications:</strong> Outreach messages, email templates, and
                  communication content you create or send through the Service.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">2.2 Information Collected Automatically</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Usage Data:</strong> Features accessed, pages viewed, actions taken,
                  time spent on the platform, click patterns, and interaction data.
                </li>
                <li>
                  <strong>Device Information:</strong> Browser type, operating system, device type,
                  screen resolution, and unique device identifiers.
                </li>
                <li>
                  <strong>Log Data:</strong> IP address, access timestamps, referrer URLs, and
                  server request logs.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">2.3 Information from Third Parties</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Integration Data:</strong> Data accessed through connected integrations
                  including Gmail (emails, contacts), Google Calendar (events, availability), and
                  Telegram (messages, notifications).
                </li>
                <li>
                  <strong>AI Subprocessors:</strong> Providers of AI models and infrastructure
                  (OpenAI, Anthropic, Google AI) may process data you submit to generate AI
                  outputs.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">2.4 Lead Data</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Lead Information:</strong> Information about potential leads and
                  prospects that you input, import, or discover through our platform, including
                  business names, contact details, and company information.
                </li>
                <li>
                  <strong>AI-Generated Data:</strong> AI-generated lead scores, enrichment data,
                  analysis results, and recommended outreach strategies.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 3: How We Use Your Information */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  3
                </span>
                How We Use Your Information
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                We use the information we collect for the following purposes:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Service Delivery:</strong> To provide, maintain, and improve the
                  AcquisitionOS platform, including AI-powered lead discovery, enrichment,
                  scoring, and outreach capabilities.
                </li>
                <li>
                  <strong>Account Management:</strong> To create and manage your account, process
                  payments, handle credit allocations, and manage subscriptions.
                </li>
                <li>
                  <strong>Communication:</strong> To send you service-related notifications,
                  credit alerts, trial reminders, security alerts, and support responses.
                </li>
                <li>
                  <strong>Personalization:</strong> To customize your experience, improve AI model
                  accuracy for your use case, and provide relevant lead recommendations.
                </li>
                <li>
                  <strong>Analytics:</strong> To analyze usage patterns, measure feature adoption,
                  and generate insights to improve our Service.
                </li>
                <li>
                  <strong>Security:</strong> To detect and prevent fraud, unauthorized access, and
                  other illegal activities, and to protect the security of our users and platform.
                </li>
                <li>
                  <strong>Legal Compliance:</strong> To comply with applicable laws, regulations,
                  legal processes, or governmental requests.
                </li>
                <li>
                  <strong>AI Improvement:</strong> To train and improve our AI models for lead
                  scoring, enrichment, and content generation (anonymized and aggregated only;
                  individual data is not used for training without explicit consent).
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 4: Gmail Integration and Email Data */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  4
                </span>
                Gmail Integration and Email Data
              </h2>

              <h3 className="text-sm font-semibold mt-4 mb-2">4.1 OAuth Scopes</h3>
              <p className="text-sm leading-relaxed mb-3">
                When you connect your Gmail account, we request only the minimum OAuth scopes
                necessary:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">gmail.readonly</code>{' '}
                  &mdash; To read email metadata and content for lead communication tracking.
                </li>
                <li>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">gmail.send</code>{' '}
                  &mdash; To send outreach emails on your behalf.
                </li>
                <li>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">gmail.modify</code>{' '}
                  &mdash; To apply labels and manage sent email organization.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">4.2 Limited Use Compliance</h3>
              <p className="text-sm leading-relaxed">
                We adhere to Google&apos;s Limited Use requirements. We do not sell, share, or use
                Gmail data for advertising purposes. Gmail data is used solely to provide the
                integration functionality you have requested.
              </p>

              <h3 className="text-sm font-semibold mt-4 mb-2">4.3 24-Hour Retention</h3>
              <p className="text-sm leading-relaxed">
                Email content fetched through the Gmail integration is retained for a maximum of{' '}
                <strong>24 hours</strong> for processing, after which it is permanently deleted
                from our servers. Metadata (sender, recipient, timestamp, subject) may be
                retained longer as described in this Privacy Policy for analytics and
                communication tracking purposes.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 5: Data Storage and Security */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  5
                </span>
                Data Storage and Security
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                We implement industry-standard security measures to protect your data:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Encryption in Transit:</strong> All data in transit is encrypted using{' '}
                  <strong>TLS 1.3</strong>.
                </li>
                <li>
                  <strong>Encryption at Rest:</strong> Sensitive data at rest is encrypted using{' '}
                  <strong>AES-256</strong> encryption.
                </li>
                <li>
                  <strong>Password Security:</strong> User passwords are hashed using{' '}
                  <strong>bcrypt</strong> with appropriate salt rounds.
                </li>
                <li>
                  <strong>SSL Certificates:</strong> All connections to our services are secured
                  with <strong>SSL certificates</strong>, ensuring encrypted communication.
                </li>
                <li>
                  <strong>Access Controls:</strong> Role-based access controls (RBAC) ensure that
                  only authorized personnel can access your data. All access is logged and audited.
                </li>
                <li>
                  <strong>Infrastructure Security:</strong> Our infrastructure runs on SOC 2 Type
                  II certified cloud providers with regular penetration testing and vulnerability
                  assessments.
                </li>
                <li>
                  <strong>Data Isolation:</strong> Each organization&apos;s data is logically
                  isolated to prevent unauthorized cross-tenant access.
                </li>
                <li>
                  <strong>Backup and Recovery:</strong> Regular encrypted backups with
                  point-in-time recovery capabilities are maintained for disaster recovery.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mt-3">
                While we implement robust security measures, no method of electronic storage or
                transmission is 100% secure. We cannot guarantee absolute security of your data.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 6: Data Sharing */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  6
                </span>
                Data Sharing
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                We do not sell your personal information. We may share your information with:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Service Providers:</strong> Third-party vendors who perform services on
                  our behalf, including cloud hosting (AWS, Vercel), payment processing (Stripe,
                  Razorpay), email delivery (Gmail SMTP), and analytics (PostHog, Mixpanel).
                </li>
                <li>
                  <strong>Legal Requirements:</strong> When required by law, court order, or
                  governmental regulation, or when we believe in good faith that disclosure is
                  necessary to protect our rights, your safety, or the safety of others.
                </li>
                <li>
                  <strong>Business Transfers:</strong> In connection with a merger, acquisition,
                  or sale of assets, your information may be transferred as part of that
                  transaction, subject to continued protection under this Privacy Policy.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mt-3">
                We require all third-party service providers to maintain appropriate security and
                privacy standards and to process your data only as instructed by us.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 7: Cookies */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  7
                </span>
                Cookies
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                We use cookies and similar tracking technologies to operate and improve our
                Service:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Essential Cookies:</strong> Required for authentication, security, and
                  basic platform functionality. Cannot be disabled.
                </li>
                <li>
                  <strong>Analytics Cookies:</strong> Help us understand how users interact with
                  our platform. Can be opted out via cookie preferences.
                </li>
                <li>
                  <strong>Functionality Cookies:</strong> Remember your preferences and settings
                  for a personalized experience.
                </li>
                <li>
                  <strong>Marketing Cookies:</strong> Used for targeted advertising and conversion
                  tracking. Opt-in only.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mt-3">
                You can manage your cookie preferences at any time through the cookie consent
                banner or your account settings.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 8: Your Rights */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  8
                </span>
                Your Rights
              </h2>

              <h3 className="text-sm font-semibold mt-4 mb-2">8.1 General Rights</h3>
              <p className="text-sm leading-relaxed mb-3">
                Regardless of your location, you have the following rights regarding your personal
                data:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Right of Access:</strong> Request a copy of the personal data we hold
                  about you.
                </li>
                <li>
                  <strong>Right to Rectification:</strong> Request correction of inaccurate
                  personal data.
                </li>
                <li>
                  <strong>Right to Erasure:</strong> Request deletion of your personal data,
                  subject to legal retention requirements.
                </li>
                <li>
                  <strong>Right to Data Portability:</strong> Request your data in a
                  machine-readable format for transfer to another service.
                </li>
                <li>
                  <strong>Right to Object:</strong> Object to processing of your data for direct
                  marketing or based on legitimate interests.
                </li>
                <li>
                  <strong>Right to Restrict Processing:</strong> Request that we limit how we
                  process your data in certain circumstances.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">8.2 GDPR Rights (EU/EEA Users)</h3>
              <p className="text-sm leading-relaxed mb-3">
                If you are located in the European Economic Area, you have additional rights under
                the GDPR:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Right Not to Be Subject to Automated Decision-Making (Art. 22):</strong>{' '}
                  Request human review of AI-driven decisions that significantly affect you.
                </li>
                <li>
                  <strong>Right to Lodge a Complaint:</strong> You may lodge a complaint with your
                  local supervisory authority.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">8.3 India DPDP Act Rights</h3>
              <p className="text-sm leading-relaxed mb-3">
                If you are located in India, you have the following rights under the Digital
                Personal Data Protection Act, 2023:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Right to Access:</strong> Obtain a summary of your personal data and the
                  processing activities carried out.
                </li>
                <li>
                  <strong>Right to Correction and Erasure:</strong> Request correction of
                  inaccurate or incomplete data, and erasure of data that is no longer necessary.
                </li>
                <li>
                  <strong>Right to Nominate:</strong> Nominate another individual to exercise your
                  rights in the event of your death or incapacity.
                </li>
                <li>
                  <strong>Right to Grievance Redressal:</strong> Approach the Data Protection
                  Board of India for grievances related to data protection.
                </li>
              </ul>

              <p className="text-sm leading-relaxed mt-3">
                To exercise any of these rights, contact us at{' '}
                <a
                  href="mailto:privacy@acquisitionos.com"
                  className="text-primary hover:text-primary/80 underline"
                >
                  privacy@acquisitionos.com
                </a>{' '}
                or use the built-in privacy controls in your account settings. We will respond to
                verifiable requests within 30 days (or 45 days if extension is needed).
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 9: Children's Privacy */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  9
                </span>
                Children&apos;s Privacy
              </h2>
              <p className="text-sm leading-relaxed">
                AcquisitionOS is a B2B platform intended for use by businesses and professionals.
                Our Service is not directed to children under the age of 16, and we do not
                knowingly collect personal information from children. If we become aware that we
                have inadvertently collected personal data from a child under 16, we will take
                steps to delete such information promptly. If you believe we have collected
                information from a child, please contact us at{' '}
                <a
                  href="mailto:privacy@acquisitionos.com"
                  className="text-primary hover:text-primary/80 underline"
                >
                  privacy@acquisitionos.com
                </a>
                .
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 10: International Data Transfers */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  10
                </span>
                International Data Transfers
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                AcquisitionOS operates globally and your data may be transferred to and processed
                in countries other than your own. We ensure appropriate safeguards are in place:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Standard Contractual Clauses (SCCs):</strong> We use EU-approved
                  Standard Contractual Clauses for transfers of personal data from the EEA to
                  countries that do not provide an adequate level of data protection.
                </li>
                <li>
                  <strong>Data Processing Agreements:</strong> We maintain DPAs with all
                  subprocessors that process personal data on our behalf.
                </li>
                <li>
                  <strong>Adequacy Decisions:</strong> Where possible, data is stored in regions
                  with EU adequacy decisions.
                </li>
                <li>
                  <strong>Privacy Shield:</strong> For US-based processing, we comply with the
                  EU-US Data Privacy Framework principles.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 11: Third-Party Links and Services */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  11
                </span>
                Third-Party Links and Services
              </h2>
              <p className="text-sm leading-relaxed">
                Our Service may contain links to third-party websites or services that are not
                owned or controlled by us. We have no control over, and assume no responsibility
                for, the content, privacy policies, or practices of any third-party websites or
                services. You acknowledge and agree that we shall not be responsible or liable,
                directly or indirectly, for any damage or loss caused or alleged to be caused by
                or in connection with the use of or reliance on any such content, goods, or
                services available on or through any such third-party websites or services. We
                strongly advise you to read the terms and conditions and privacy policies of any
                third-party websites or services that you visit.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 12: Changes to This Policy */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  12
                </span>
                Changes to This Policy
              </h2>
              <p className="text-sm leading-relaxed">
                We may update this Privacy Policy from time to time to reflect changes in our
                practices, technology, legal requirements, or other factors. We will notify you of
                material changes by posting the updated policy on our website and, for significant
                changes, by sending a notification to the email address associated with your
                account. Your continued use of the Service after the effective date of any changes
                constitutes your acceptance of the revised Privacy Policy. We encourage you to
                review this policy periodically.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 13: Contact and Data Protection Officer */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  13
                </span>
                Contact and Data Protection Officer
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                If you have any questions, concerns, or requests regarding this Privacy Policy or
                our data practices, please contact us:
              </p>
              <ul className="text-sm leading-relaxed list-none pl-0 space-y-2">
                <li>
                  <strong>Privacy Inquiries:</strong>{' '}
                  <a
                    href="mailto:privacy@acquisitionos.com"
                    className="text-primary hover:text-primary/80 underline"
                  >
                    privacy@acquisitionos.com
                  </a>
                </li>
                <li>
                  <strong>Data Protection Officer:</strong>{' '}
                  <a
                    href="mailto:dpo@acquisitionos.com"
                    className="text-primary hover:text-primary/80 underline"
                  >
                    dpo@acquisitionos.com
                  </a>
                </li>
                <li>
                  <strong>Company:</strong> QuantumFusion Solutions
                </li>
                <li>
                  <strong>Address:</strong> Jamshedpur, Jharkhand, India
                </li>
              </ul>
              <p className="text-sm leading-relaxed mt-3">
                For GDPR-related complaints, you may also contact your local supervisory
                authority. For India DPDP Act complaints, you may approach the Data Protection
                Board of India.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Back to Home */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} QuantumFusion Solutions. All rights reserved.
              </p>
              <Link href="/">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to AcquisitionOS
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
