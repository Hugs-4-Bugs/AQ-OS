'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, FileText, Scale } from 'lucide-react';

export default function TermsOfServicePage() {
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
              <Scale className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm sm:text-base">Terms of Service</span>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
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
                Terms of Service
              </h1>
              <p className="text-sm text-muted-foreground">
                <strong>Effective Date:</strong> March 1, 2025 &nbsp;|&nbsp;{' '}
                <strong>Last Updated:</strong> {currentDate}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                These Terms of Service (&quot;Terms&quot;) govern your access to and use of
                AcquisitionOS, an AI-powered B2B lead discovery, enrichment, and outreach
                platform operated by QuantumFusion Solutions (&quot;Company,&quot; &quot;we,&quot;
                &quot;our,&quot; or &quot;us&quot;). By accessing or using the Service, you
                agree to be bound by these Terms.
              </p>
            </div>

            <Separator className="my-8" />

            {/* Section 1: Acceptance of Terms */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  1
                </span>
                Acceptance of Terms
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                By creating an account, accessing, or using AcquisitionOS, you acknowledge that
                you have read, understood, and agree to be bound by these Terms of Service, our{' '}
                <Link href="/privacy" className="text-primary hover:text-primary/80 underline">
                  Privacy Policy
                </Link>
                , and any applicable policies referenced herein. If you do not agree to these
                Terms, you must not use the Service.
              </p>
              <p className="text-sm leading-relaxed">
                If you are using the Service on behalf of an organization, you represent and
                warrant that you have the authority to bind that organization to these Terms.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 2: Description of Service */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  2
                </span>
                Description of Service
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                AcquisitionOS is an AI-powered B2B SaaS platform that provides the following
                capabilities:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Lead Discovery:</strong> AI-driven search and discovery of business
                  leads based on your ideal customer profile and target criteria.
                </li>
                <li>
                  <strong>Lead Enrichment:</strong> Automated data enrichment, analysis, and
                  AI-powered scoring of discovered leads.
                </li>
                <li>
                  <strong>Outreach &amp; Messaging:</strong> Tools for creating and sending
                  personalized outreach messages, email sequences, and follow-up communications.
                </li>
                <li>
                  <strong>Pipeline Management:</strong> Visual pipeline for tracking leads
                  through your sales process from discovery to close.
                </li>
                <li>
                  <strong>Integrations:</strong> Connectivity with Gmail, Google Calendar,
                  Telegram, and other third-party services.
                </li>
                <li>
                  <strong>AI Assistant:</strong> An AI-powered sales assistant providing
                  coaching, recommendations, and automated task execution.
                </li>
                <li>
                  <strong>Workflow Automation:</strong> Configurable automated workflows for
                  lead nurturing, follow-ups, and multi-step outreach sequences.
                </li>
                <li>
                  <strong>Analytics &amp; Insights:</strong> Performance dashboards, campaign
                  analytics, and AI-generated business insights.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 3: Eligibility */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  3
                </span>
                Eligibility
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  You must be at least 18 years of age (or the age of majority in your
                  jurisdiction) to create an account and use the Service.
                </li>
                <li>
                  You must have the legal capacity to enter into a binding agreement.
                </li>
                <li>
                  You must not be barred from using the Service under applicable law.
                </li>
                <li>
                  If using the Service on behalf of a business, you represent that the business
                  is duly organized and validly existing under applicable law.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 4: User Accounts */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  4
                </span>
                User Accounts
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  You must provide accurate, current, and complete information during
                  registration and keep your account information updated.
                </li>
                <li>
                  You are responsible for maintaining the confidentiality of your account
                  credentials and for all activities that occur under your account.
                </li>
                <li>
                  You must immediately notify us of any unauthorized use of your account at{' '}
                  <strong>security@acquisitionos.com</strong>.
                </li>
                <li>
                  We reserve the right to suspend or terminate accounts that violate these Terms
                  or are associated with fraudulent activity.
                </li>
                <li>
                  One person or entity may not maintain more than one account without prior
                  written consent.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 5: Subscription Plans and Billing */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  5
                </span>
                Subscription Plans and Billing
              </h2>

              <h3 className="text-sm font-semibold mt-4 mb-2">5.1 Subscription Tiers</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Free Plan:</strong> Limited monthly credits with basic features. No
                  payment required.
                </li>
                <li>
                  <strong>Pro Plan:</strong> Increased monthly credits with advanced features.
                  Billed monthly or annually.
                </li>
                <li>
                  <strong>Enterprise Plan:</strong> Custom credit allocations, dedicated support,
                  and advanced features. Custom pricing.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">5.2 Billing Periods</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>Monthly subscription:</strong> A billing period of{' '}
                  <strong>365/12 days</strong> (~30.42 days), auto-renewing each period.
                </li>
                <li>
                  <strong>Yearly subscription:</strong> A billing period of <strong>365 days</strong>,
                  auto-renewing each year.
                </li>
                <li>
                  Free plan credits reset on the <strong>1st of each calendar month</strong>,
                  regardless of when the account was created.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">5.3 Taxes</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  All prices are exclusive of applicable taxes unless stated otherwise.
                </li>
                <li>
                  <strong>18% GST</strong> is applicable for customers located in India as per the
                  Goods and Services Tax laws.
                </li>
                <li>
                  For customers outside India, applicable local taxes may be charged as required
                  by law.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">5.4 Prorated Refunds</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  If you cancel a paid subscription, a prorated refund may be issued provided
                  that <strong>more than 20% of the billing period remains</strong> AND the
                  refund amount exceeds <strong>Rs. 100</strong> (or equivalent in your billing
                  currency).
                </li>
                <li>
                  Refunds are calculated based on the unused portion of the billing period at the
                  time of cancellation.
                </li>
                <li>
                  Credit add-on packs are non-refundable once purchased.
                </li>
              </ul>

              <h3 className="text-sm font-semibold mt-4 mb-2">5.5 Payment Processing</h3>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  Payments are processed through Stripe or Razorpay. We do not store full credit
                  card numbers on our servers.
                </li>
                <li>
                  Subscriptions auto-renew at the end of each billing period unless cancelled
                  before the renewal date.
                </li>
                <li>
                  Failed payments will be retried. Continued failure may result in account
                  downgrade to the Free plan.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 6: Credits System */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  6
                </span>
                Credits System
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  AcquisitionOS operates on a credit-based pricing model. Different actions
                  consume varying amounts of credits.
                </li>
                <li>
                  <strong>No Cash Value:</strong> Credits have no cash value and cannot be
                  exchanged for money, refund, or credit toward any other service.
                </li>
                <li>
                  <strong>Non-Transferable:</strong> Credits cannot be transferred between
                  accounts, users, or organizations.
                </li>
                <li>
                  <strong>Rollover Limits:</strong> Unused monthly credits do not roll over to
                  the next billing period for Free plan users. Pro plan users may roll over up
                  to 25% of unused monthly credits. Enterprise plan rollover is subject to
                  custom agreement terms.
                </li>
                <li>
                  Credit add-on packs are one-time purchases and do not auto-renew. Add-on
                  credits expire 12 months from the date of purchase.
                </li>
                <li>
                  Credits are forfeited upon account termination and are not refundable.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 7: Acceptable Use */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  7
                </span>
                Acceptable Use
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                You agree not to use the Service to:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>Violate any applicable law, regulation, or third-party right.</li>
                <li>
                  Send unsolicited commercial communications (spam) or engage in any form of
                  harassment.
                </li>
                <li>
                  Collect or store personal data of individuals without proper consent or legal
                  basis.
                </li>
                <li>
                  Scrape, harvest, or extract data from third-party websites or services in
                  violation of their terms.
                </li>
                <li>Interfere with or disrupt the integrity or performance of the Service.</li>
                <li>
                  Attempt to gain unauthorized access to any portion of the Service or related
                  systems.
                </li>
                <li>
                  Use the Service to discriminate, stalk, threaten, or otherwise harm
                  individuals.
                </li>
                <li>
                  Reverse engineer, decompile, or disassemble any part of the Service.
                </li>
                <li>
                  Resell, sublicense, or redistribute the Service without prior written consent.
                </li>
                <li>
                  Use automated tools (bots, scripts) to access the Service in a manner that
                  exceeds reasonable usage.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 8: Gmail and Third-Party Integrations */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  8
                </span>
                Gmail and Third-Party Integrations
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  AcquisitionOS integrates with Gmail, Google Calendar, Telegram, and other
                  third-party services. By connecting these services, you authorize us to access
                  and process data from those services as described in our Privacy Policy.
                </li>
                <li>
                  <strong>Gmail Integration:</strong> We access your Gmail data strictly through
                  Google&apos;s OAuth 2.0 protocol with limited, clearly scoped permissions. We
                  adhere to Google&apos;s Limited Use requirements and do not sell, share, or use
                  Gmail data for advertising purposes.
                </li>
                <li>
                  <strong>Data Retention for Integrations:</strong> Email content fetched through
                  Gmail integration is retained for a maximum of 24 hours for processing, after
                  which it is permanently deleted from our servers. Metadata (sender, recipient,
                  timestamp, subject) may be retained longer as described in our Privacy Policy.
                </li>
                <li>
                  You may disconnect any integration at any time through your account settings.
                  Upon disconnection, we will cease accessing data from that service and delete
                  cached data within 30 days.
                </li>
                <li>
                  You are responsible for ensuring that your use of third-party integrations
                  complies with the terms of service of those third parties.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 9: Intellectual Property */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  9
                </span>
                Intellectual Property
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  The Service, including all software, design, text, graphics, and underlying AI
                  models, is owned by QuantumFusion Solutions and protected by intellectual
                  property laws.
                </li>
                <li>
                  You retain ownership of all data you input into the Service, including lead
                  data, outreach content, and business information.
                </li>
                <li>
                  AI-generated content (lead scores, analysis, suggested messages) is provided to
                  you for your use, but AcquisitionOS retains the right to use anonymized,
                  aggregated patterns to improve our AI models.
                </li>
                <li>
                  You grant AcquisitionOS a limited, non-exclusive license to process your data
                  solely for the purpose of providing the Service.
                </li>
                <li>
                  You may not use our trademarks, logos, or brand assets without prior written
                  permission.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 10: Data and Privacy */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  10
                </span>
                Data and Privacy
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                Your privacy is important to us. Our collection and use of personal information
                in connection with the Service is as described in our{' '}
                <Link href="/privacy" className="text-primary hover:text-primary/80 underline">
                  Privacy Policy
                </Link>
                .
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  By using the Service, you consent to the collection and use of your information
                  as described in our Privacy Policy.
                </li>
                <li>
                  You are responsible for ensuring that you have the right to provide any data
                  you input into the Service, including lead contact information.
                </li>
                <li>
                  We comply with applicable data protection laws including GDPR, CCPA, and
                  India&apos;s Digital Personal Data Protection Act, 2023.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 11: Disclaimers */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  11
                </span>
                Disclaimers
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
                  WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
                  TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                  NON-INFRINGEMENT.
                </li>
                <li>
                  WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR
                  ERROR-FREE.
                </li>
                <li>
                  AI-GENERATED CONTENT IS PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND SHOULD NOT
                  BE RELIED UPON AS LEGAL, FINANCIAL, OR PROFESSIONAL ADVICE.
                </li>
                <li>
                  WE ARE NOT RESPONSIBLE FOR THE ACCURACY, RELIABILITY, OR COMPLETENESS OF
                  THIRD-PARTY DATA SOURCES USED IN LEAD DISCOVERY AND ENRICHMENT.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 12: Limitation of Liability */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  12
                </span>
                Limitation of Liability
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  ACQUISITIONOS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                  CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
                  WHETHER INCURRED DIRECTLY OR INDIRECTLY.
                </li>
                <li>
                  OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM OR RELATED TO THE SERVICE SHALL
                  NOT EXCEED THE AMOUNT YOU PAID US IN THE{' '}
                  <strong>3 MONTHS PRECEDING</strong> THE EVENT GIVING RISE TO THE LIABILITY.
                </li>
                <li>
                  This limitation applies regardless of the legal theory on which the claim is
                  based, whether contract, tort, strict liability, or otherwise.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 13: Indemnification */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  13
                </span>
                Indemnification
              </h2>
              <p className="text-sm leading-relaxed">
                You agree to indemnify, defend, and hold harmless QuantumFusion Solutions and its
                officers, directors, employees, agents, licensors, and suppliers from and against
                any claims, actions, demands, liabilities, and settlements including legal fees
                arising from: (a) your use of the Service; (b) your violation of these Terms; (c)
                your violation of applicable laws or regulations; (d) content you submit or
                transmit through the Service; (e) your violation of any rights of a third party,
                including intellectual property rights; and (f) any outreach or communications
                sent through the Service that violate anti-spam laws or recipient rights.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 14: Termination */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  14
                </span>
                Termination
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  <strong>By You:</strong> You may terminate your account at any time through your
                  account settings or by contacting support. Upon termination, your right to use
                  the Service ceases immediately.
                </li>
                <li>
                  <strong>By Us:</strong> We may suspend or terminate your account for violation
                  of these Terms, fraudulent activity, or extended inactivity (12+ months) with
                  30 days&apos; notice.
                </li>
                <li>
                  <strong>Effect of Termination:</strong> Upon termination, we will delete your
                  personal data in accordance with our Privacy Policy and data retention schedule.
                  Financial records are retained as required by law. Credits are forfeited upon
                  termination and are not refundable.
                </li>
                <li>
                  <strong>Survival:</strong> Sections relating to intellectual property,
                  limitation of liability, indemnification, and dispute resolution survive
                  termination.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 15: Governing Law and Disputes */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  15
                </span>
                Governing Law and Disputes
              </h2>
              <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
                <li>
                  These Terms are governed by the laws of <strong>India</strong>, without regard
                  to its conflict of law principles.
                </li>
                <li>
                  Any legal proceedings arising from these Terms shall be brought exclusively in
                  the courts of <strong>Jharkhand, India</strong>, and you consent to the
                  personal jurisdiction of such courts.
                </li>
                <li>
                  <strong>Informal Resolution:</strong> Before filing any claim, you agree to
                  contact us at <strong>legal@acquisitionos.com</strong> and attempt to resolve
                  the dispute informally for at least 30 days.
                </li>
                <li>
                  <strong>Arbitration:</strong> Any disputes not resolved informally shall be
                  resolved through binding arbitration in accordance with the Arbitration and
                  Conciliation Act, 1996, except where prohibited by applicable consumer
                  protection laws.
                </li>
              </ul>
            </section>

            <Separator className="my-6" />

            {/* Section 16: Changes to Terms */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  16
                </span>
                Changes to Terms
              </h2>
              <p className="text-sm leading-relaxed">
                We reserve the right to modify these Terms at any time. We will provide notice of
                material changes by posting the updated Terms on our website and, for significant
                changes, by sending an email notification to the address associated with your
                account at least 30 days before the changes take effect. Your continued use of
                the Service after the effective date constitutes acceptance of the revised Terms.
                If you do not agree to the revised Terms, you must discontinue use of the
                Service and terminate your account.
              </p>
            </section>

            <Separator className="my-6" />

            {/* Section 17: Contact */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  17
                </span>
                Contact
              </h2>
              <p className="text-sm leading-relaxed mb-3">
                If you have any questions about these Terms, please contact us:
              </p>
              <ul className="text-sm leading-relaxed list-none pl-0 space-y-2">
                <li>
                  <strong>Legal Inquiries:</strong>{' '}
                  <a
                    href="mailto:legal@acquisitionos.com"
                    className="text-primary hover:text-primary/80 underline"
                  >
                    legal@acquisitionos.com
                  </a>
                </li>
                <li>
                  <strong>General Support:</strong>{' '}
                  <a
                    href="mailto:support@acquisitionos.com"
                    className="text-primary hover:text-primary/80 underline"
                  >
                    support@acquisitionos.com
                  </a>
                </li>
                <li>
                  <strong>Company:</strong> QuantumFusion Solutions
                </li>
              </ul>
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
