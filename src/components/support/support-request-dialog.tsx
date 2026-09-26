'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Request Dialog (client)
//
// A Dialog wrapper around the shared SupportTicketForm. This is what
// opens when the user clicks "Contact Support to Downgrade" (or
// "Contact Support") on a pricing card, or any escalation button in
// the knowledge base. It renders on top of the pricing modal.
// ═══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import SupportTicketForm, { type SupportTicketFormPrefill } from './support-ticket-form';

interface SupportRequestDialogProps extends SupportTicketFormPrefill {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title, defaults based on the prefill category. */
  title?: string;
}

export default function SupportRequestDialog({
  open,
  onOpenChange,
  title,
  ...prefill
}: SupportRequestDialogProps) {
  const [submittedTicket, setSubmittedTicket] = useState<{
    id: string;
    ticketNumber: string;
  } | null>(null);

  const heading =
    title ||
    (prefill.subcategory === 'downgrade_plan'
      ? 'Contact Support to Downgrade'
      : 'Submit a Support Ticket');

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSubmittedTicket(null);
        onOpenChange(v);
      }}
    >
      <DialogContent
        // Responsive: fits small screens, scrolls internally.
        className="w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <LifeBuoy className="h-5 w-5 text-primary" />
            {submittedTicket ? 'Request submitted' : heading}
          </DialogTitle>
          {!submittedTicket && (
            <DialogDescription className="text-muted-foreground">
              Tell us what you need — your ticket goes straight to our support team.
            </DialogDescription>
          )}
        </DialogHeader>
        <SupportTicketForm
          {...prefill}
          source={prefill.source || 'pricing_modal'}
          onSubmitted={(ticket) => {
            setSubmittedTicket(ticket);
            prefill.onSubmitted?.(ticket);
          }}
          hideSuccessScreen={false}
        />
      </DialogContent>
    </Dialog>
  );
}
