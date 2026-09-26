// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Center shared constants (client-safe)
//
// Category / subcategory taxonomy for support tickets. Imported by both
// the client form components and the API routes so the frontend and the
// backend always validate against the SAME source of truth.
// ═══════════════════════════════════════════════════════════════════

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const TICKET_STATUSES: TicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
];

export const TICKET_PRIORITIES: TicketPriority[] = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_USER: 'Waiting for You',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export interface SupportCategory {
  /** Value persisted on SupportTicket.category */
  value: string;
  label: string;
  description: string;
  /** Optional second-level options (SupportTicket.subcategory) */
  subcategories: { value: string; label: string }[];
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    value: 'billing',
    label: 'Billing & Subscription',
    description: 'Plans, payments, invoices, refunds, downgrade / upgrade',
    subcategories: [
      { value: 'downgrade_plan', label: 'Downgrade Plan' },
      { value: 'upgrade_plan', label: 'Upgrade Plan' },
      { value: 'billing_cycle', label: 'Billing Cycle (Monthly / Annual)' },
      { value: 'payment_failure', label: 'Payment Failure' },
      { value: 'invoice_receipt', label: 'Invoice / Receipt' },
      { value: 'refund', label: 'Refund' },
      { value: 'subscription_status', label: 'Subscription Status' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'credits',
    label: 'Credits & Usage',
    description: 'Credit balance, consumption, add-on packs, resets',
    subcategories: [
      { value: 'credit_balance', label: 'Credit Balance' },
      { value: 'credit_consumption', label: 'Credit Consumption' },
      { value: 'credit_addon', label: 'Credit Add-On Purchase' },
      { value: 'credit_reset', label: 'Monthly Credit Reset' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'leads',
    label: 'Leads & Discovery',
    description: 'Finding leads, filters, analysis, lead limits, data issues',
    subcategories: [
      { value: 'finding_leads', label: 'Finding Leads' },
      { value: 'lead_filters', label: 'Lead Filters' },
      { value: 'lead_analysis', label: 'Lead Analysis' },
      { value: 'lead_limits', label: 'Lead Limits' },
      { value: 'lead_data_issue', label: 'Lead Data Issue' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'outreach',
    label: 'Outreach & Messaging',
    description: 'Messages, sequences, sending issues, outreach limits',
    subcategories: [
      { value: 'outreach_messages', label: 'Outreach Messages' },
      { value: 'outreach_sequences', label: 'Outreach Sequences' },
      { value: 'sending_issues', label: 'Sending Issues' },
      { value: 'outreach_limits', label: 'Outreach Limits' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'ai_features',
    label: 'AI Features',
    description: 'AI analysis, sales coaching, proposals, competitor analysis',
    subcategories: [
      { value: 'ai_analysis', label: 'AI Analysis' },
      { value: 'sales_coaching', label: 'Sales Coaching' },
      { value: 'proposal_generation', label: 'Proposal Generation' },
      { value: 'competitor_analysis', label: 'Competitor Analysis' },
      { value: 'ai_credits', label: 'AI Credit Consumption' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'account',
    label: 'Account & Security',
    description: 'Login, OTP, Google sign-in, profile, security',
    subcategories: [
      { value: 'login_issue', label: 'Login Issue' },
      { value: 'otp_issue', label: 'OTP / Verification' },
      { value: 'google_login', label: 'Google Login' },
      { value: 'profile_settings', label: 'Profile Settings' },
      { value: 'account_security', label: 'Account Security' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'technical',
    label: 'Technical Troubleshooting',
    description: 'Dashboard problems, errors, slowness, browser issues',
    subcategories: [
      { value: 'dashboard_problem', label: 'Dashboard Problem' },
      { value: 'feature_not_working', label: 'Feature Not Working' },
      { value: 'slow_performance', label: 'Slow Requests' },
      { value: 'errors', label: 'Errors' },
      { value: 'browser_issue', label: 'Browser / Mobile Issue' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'integrations',
    label: 'Integrations & API',
    description: 'API access, connected services, custom integrations',
    subcategories: [
      { value: 'api_access', label: 'API Access' },
      { value: 'api_errors', label: 'API Errors' },
      { value: 'connected_services', label: 'Connected Services' },
      { value: 'custom_integration', label: 'Custom Integrations' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Anything that does not fit the categories above',
    subcategories: [{ value: 'other', label: 'General Question' }],
  },
];

export function findCategory(value: string): SupportCategory | undefined {
  return SUPPORT_CATEGORIES.find((c) => c.value === value);
}

export function isValidCategory(value: string): boolean {
  return SUPPORT_CATEGORIES.some((c) => c.value === value);
}

export function isValidSubcategory(
  category: string,
  subcategory: string | null | undefined,
): boolean {
  if (!subcategory) return true; // optional
  const cat = findCategory(category);
  if (!cat) return false;
  return cat.subcategories.some((s) => s.value === subcategory);
}

// ─── Knowledge-base taxonomy ────────────────────────────────────────

export interface KbCategory {
  value: string;
  label: string;
  description: string;
  /** Icon name from lucide-react (resolved client-side) */
  icon: string;
}

export const KB_CATEGORIES: KbCategory[] = [
  {
    value: 'getting_started',
    label: 'Getting Started',
    description: 'Account setup, dashboard, credits, leads, prospecting basics',
    icon: 'Rocket',
  },
  {
    value: 'leads',
    label: 'Leads & Discovery',
    description: 'Finding leads, filters, analysis, lead limits, data issues',
    icon: 'Search',
  },
  {
    value: 'outreach',
    label: 'Outreach',
    description: 'Outreach messages, sequences, email support, sending issues',
    icon: 'Send',
  },
  {
    value: 'ai_features',
    label: 'AI Features',
    description: 'AI analysis, sales coaching, proposals, competitor analysis',
    icon: 'Sparkles',
  },
  {
    value: 'credits',
    label: 'Credits & Usage',
    description: 'How credits work, consumption, balance, add-ons',
    icon: 'Zap',
  },
  {
    value: 'plans_billing',
    label: 'Plans & Billing',
    description: 'Free, Starter, Pro, Elite — upgrade, downgrade, payments',
    icon: 'CreditCard',
  },
  {
    value: 'account_security',
    label: 'Account & Security',
    description: 'Login, OTP, Google login, profile settings',
    icon: 'ShieldCheck',
  },
  {
    value: 'troubleshooting',
    label: 'Technical Troubleshooting',
    description: 'Dashboard problems, errors, slow requests, browser issues',
    icon: 'Wrench',
  },
  {
    value: 'integrations_api',
    label: 'Integrations & API',
    description: 'API access, connected services, API errors',
    icon: 'Plug',
  },
];

export function findKbCategory(value: string): KbCategory | undefined {
  return KB_CATEGORIES.find((c) => c.value === value);
}
