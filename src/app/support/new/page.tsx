'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Submit a Support Ticket (/support/new)
//
// Standalone ticket submission page. Supports query-param prefill so
// the pricing flow / knowledge base can deep-link with context:
//
//   /support/new?category=billing&subcategory=downgrade_plan
//     &currentPlan=pro&requestedPlan=starter&billingCycle=monthly
//     &subject=...&prefillQuery=<kb search that failed>
//
// The plan context shown to the agent comes from the server session —
// client params only prefill the FORM, never identity.
// ═══════════════════════════════════════════════════════════════════

import React, { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import SupportTicketForm from '@/components/support/support-ticket-form';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Skeleton } from '@/components/ui/skeleton';

function SignInGate() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <LifeBuoy className="h-6 w-6 text-primary" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-foreground">Sign in to contact support</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You need an AcquisitionOS account to submit a support ticket.
        </p>
        <a
          href="/?next=/support/new"
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to sign in
        </a>
      </div>
    </main>
  );
}

export default function NewTicketPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-4 py-10">
          <div className="mx-auto max-w-xl space-y-4">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-6 w-80" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </main>
      }
    >
      <NewTicketContent />
    </Suspense>
  );
}

function NewTicketContent() {
  const params = useSearchParams();
  const { user, state } = useCurrentUser();

  const prefill = useMemo(() => {
    const category = params.get('category') || undefined;
    const subcategory = params.get('subcategory') || null;
    const subjectParam = params.get('subject') || '';
    const prefillQuery = params.get('prefillQuery') || '';
    // A failed KB search is a great subject line.
    const subject = subjectParam || (prefillQuery ? `Help with: ${prefillQuery}` : '');
    return {
      category,
      subcategory,
      subject,
      currentPlan: params.get('currentPlan') || null,
      requestedPlan: params.get('requestedPlan') || null,
      billingCycle: params.get('billingCycle') || null,
      priority: params.get('priority') || 'NORMAL',
      source: params.get('source') || 'support_center',
      metadata: prefillQuery ? { searchQuery: prefillQuery } : undefined,
    };
  }, [params]);

  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-xl space-y-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-6 w-80" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  if (state === 'unauthenticated') {
    return <SignInGate />;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <a
          href="/support"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-[40px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Support Center
        </a>

        <div className="mt-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <LifeBuoy className="h-6 w-6 text-primary" />
            Submit a Support Ticket
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {user?.name ? `Hi ${user.name.split(' ')[0]} — ` : ''}
            describe your issue and our support team will get back to you. Signed in as{' '}
            <span className="font-medium text-foreground">{user?.email}</span>.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
          <SupportTicketForm {...prefill} />
        </div>

        <div className="h-10" aria-hidden="true" />
      </div>
    </main>
  );
}
