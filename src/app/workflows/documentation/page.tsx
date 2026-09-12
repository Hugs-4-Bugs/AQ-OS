// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Documentation Page
// Server-rendered, 12 sections, sticky TOC sidebar (desktop) / collapsible
// <details> (mobile), responsive, semantic HTML, theme-aware.
// ═══════════════════════════════════════════════════════════════════

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Zap,
  Play,
  Mail,
  Bot,
  Clock,
  GitBranch,
  Server,
  LayoutTemplate,
  Coins,
  CreditCard,
  Code2,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  ArrowLeft,
  CircleHelp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Workflow Documentation — AcquisitionOS',
  description:
    'Comprehensive documentation for the AcquisitionOS Workflow engine: triggers, actions, executions, templates, credits, subscription retention, API reference, best practices, and troubleshooting.',
};

// Section IDs must match the hrefs used by the TOC anchors.
const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'getting-started', label: 'Getting Started', icon: Play },
  { id: 'workflow-builder', label: 'Workflow Builder', icon: GitBranch },
  { id: 'triggers', label: 'Triggers', icon: Zap },
  { id: 'actions', label: 'Actions', icon: Mail },
  { id: 'executions', label: 'Executions', icon: Server },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'credits-usage', label: 'Credits & Usage', icon: Coins },
  { id: 'subscription-retention', label: 'Subscription & Retention', icon: CreditCard },
  { id: 'api-reference', label: 'API Reference', icon: Code2 },
  { id: 'best-practices', label: 'Best Practices', icon: CheckCircle2 },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: CircleHelp },
] as const;

export default function WorkflowDocumentationPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        {/* Top nav */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to AcquisitionOS
          </Link>
        </nav>

        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card border text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Workflow Documentation
            </h1>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Everything you need to design, run, and debug automated client-acquisition
            workflows in AcquisitionOS. Covers triggers, actions, executions, templates,
            credits, subscription retention, the public API, best practices, and troubleshooting.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* ===== Sidebar TOC (sticky on desktop) ===== */}
          <aside className="hidden lg:block">
            <nav aria-label="Table of contents" className="sticky top-6">
              <Card className="bg-card text-card-foreground">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Contents</CardTitle>
                  <CardDescription className="text-xs">
                    12 sections • ~10 min read
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ol className="space-y-1">
                    {SECTIONS.map((s, i) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                        >
                          <span className="text-xs tabular-nums text-muted-foreground/70 w-5">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <s.icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{s.label}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </nav>
          </aside>

          {/* ===== Mobile collapsible TOC ===== */}
          <details className="lg:hidden mb-4 rounded-lg border bg-card text-card-foreground">
            <summary className="cursor-pointer px-4 py-3 font-medium flex items-center gap-2 select-none">
              <BookOpen className="h-4 w-4" />
              Table of Contents
              <span className="ml-auto text-xs text-muted-foreground">tap to expand</span>
            </summary>
            <div className="px-4 pb-3">
              <ol className="space-y-1">
                {SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-xs tabular-nums text-muted-foreground/70 w-5">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <s.icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{s.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </details>

          {/* ===== Article content ===== */}
          <article className="space-y-12">
            {/* ─────────────────────────────────────────────────────── */}
            {/* 1. Overview */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="overview" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">1. Overview</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>
                    Workflows are the automation backbone of AcquisitionOS. They let you
                    connect <strong>triggers</strong> (events in your pipeline) to a sequence
                    of <strong>actions</strong> (emails, AI enrichment, stage moves, delays,
                    conditions) so that prospecting, follow-up, and pipeline hygiene run
                    themselves — without you manually clicking through the dashboard.
                  </p>
                  <p>
                    A typical workflow looks like this: <em>“When a lead replies → wait
                    1 hour → AI-summarise the reply → move the lead to <code>Replied</code>
                    → notify me on Telegram.”</em> That single sentence becomes a 4-node
                    workflow that runs automatically every time a reply lands.
                  </p>
                  <h3 className="text-base font-semibold mt-6 mb-2">What you can automate</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Nurture sequences that send the right email at the right stage.</li>
                    <li>AI enrichment + scoring the moment a new lead is discovered.</li>
                    <li>Auto-pause a sequence when a lead replies, books a meeting, or unsubscribes.</li>
                    <li>Internal alerts via Telegram, WhatsApp, or in-app notifications.</li>
                    <li>Scheduled clean-ups: move stale leads, reset tags, export data.</li>
                    <li>Webhook-driven automation for your external integrations.</li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 2. Getting Started */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="getting-started" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Play className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">2. Getting Started</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      Open the <strong>Workflows</strong> tab in your AcquisitionOS
                      dashboard.
                    </li>
                    <li>
                      Click <strong>New Workflow</strong>. Give it a name and pick a
                      trigger.
                    </li>
                    <li>
                      Add actions in the visual builder. Drag from the right-hand
                      palette onto the canvas, then connect them to your trigger.
                    </li>
                    <li>
                      Click <strong>Save</strong>. The workflow is now in <Badge variant="outline" className="ml-1">Draft</Badge> status — it won&apos;t run automatically yet, but you can <em>execute it manually</em> for testing.
                    </li>
                    <li>
                      When you&apos;re happy with the dry runs, flip the <strong>Enable</strong> switch. The workflow becomes <Badge variant="default" className="ml-1">Active</Badge> and starts reacting to its trigger.
                    </li>
                    <li>
                      Watch the <strong>Executions</strong> sub-tab to see live runs,
                      step-by-step logs, and errors.
                    </li>
                  </ol>
                  <div className="mt-6 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <strong className="text-primary">Tip:</strong> Drafts can be executed
                    on demand — perfect for testing a workflow against a real lead without
                    waiting for the trigger to fire naturally.
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 3. Workflow Builder */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="workflow-builder" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <GitBranch className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">3. Workflow Builder</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>
                    The builder is a node-and-edge canvas. Each workflow has exactly one
                    trigger node (the entry point) and one or more action/condition/delay
                    nodes that execute in order. Edges define the flow of execution.
                  </p>
                  <h3 className="text-base font-semibold mt-6 mb-2">Node types</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Trigger</strong> — when this event fires, the workflow runs.</li>
                    <li><strong>Action</strong> — does work: sends an email, calls AI, updates tags, etc.</li>
                    <li><strong>Condition</strong> — branches the flow based on a rule.</li>
                    <li><strong>Delay</strong> — waits a fixed duration before continuing.</li>
                    <li><strong>AI Action</strong> — specialised node that calls the AI engine with a prompt template.</li>
                  </ul>
                  <h3 className="text-base font-semibold mt-6 mb-2">Statuses</h3>
                  <p>Every workflow is in one of four statuses:</p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><Badge variant="outline">Draft</Badge> — not yet enabled; can be executed manually for testing.</li>
                    <li><Badge variant="default">Active</Badge> — reacts to its trigger automatically.</li>
                    <li><Badge variant="secondary">Paused</Badge> — frozen; the trigger is ignored until you (or the system) resume it.</li>
                    <li><Badge variant="destructive">Archived</Badge> — soft-deleted; no longer visible in the main list but kept for audit history.</li>
                  </ul>
                  <h3 className="text-base font-semibold mt-6 mb-2">Versioning</h3>
                  <p>
                    Each meaningful edit (name, trigger, nodes, edges) bumps the
                    workflow&apos;s <code>version</code> counter. Executions record the
                    version they ran against, so you can always tell which definition
                    produced a given run.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 4. Triggers */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="triggers" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">4. Triggers</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>Triggers are the events that start a workflow. Available triggers:</p>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4 font-semibold">Trigger</th>
                          <th className="py-2 pr-4 font-semibold">Fires when…</th>
                          <th className="py-2 font-semibold">Config</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Lead Discovered</td><td className="py-2 pr-4">A new lead enters your pipeline.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Lead Moved</td><td className="py-2 pr-4">A lead moves to a different stage.</td><td className="py-2"><code>stage</code></td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Lead Reply</td><td className="py-2 pr-4">A lead replies to an outreach email.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Score Change</td><td className="py-2 pr-4">Lead&apos;s AI score crosses a threshold.</td><td className="py-2"><code>threshold</code></td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Gmail Connected</td><td className="py-2 pr-4">User links a Gmail account.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Email Received</td><td className="py-2 pr-4">Inbound email arrives from a tracked lead.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Telegram / WhatsApp Received</td><td className="py-2 pr-4">A message arrives on a connected channel.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Payment Success</td><td className="py-2 pr-4">A payment succeeds (subscription or one-off).</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Trial Ending</td><td className="py-2 pr-4">Trial expires in &lt; 24h.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Credits Low</td><td className="py-2 pr-4">Credit balance drops below a threshold.</td><td className="py-2"><code>threshold</code></td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">AI Completed</td><td className="py-2 pr-4">A long-running AI job finishes.</td><td className="py-2">—</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Webhook</td><td className="py-2 pr-4">External HTTP request hits <code>/api/workflows/webhook/…</code>.</td><td className="py-2"><code>path</code></td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Scheduled</td><td className="py-2 pr-4">Time-based: hourly / daily / weekly / monthly.</td><td className="py-2"><code>schedule</code></td></tr>
                        <tr><td className="py-2 pr-4 font-medium text-foreground">Manual</td><td className="py-2 pr-4">User clicks <em>Execute Now</em> or calls the API.</td><td className="py-2">—</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <strong className="text-primary">Idempotency:</strong> if you supply an
                    <code> idempotencyKey</code> when triggering, duplicate triggers within
                    a short window are safely ignored — perfect for webhook-based triggers
                    that may fire more than once.
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 5. Actions */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="actions" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">5. Actions</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="bg-card text-card-foreground">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Email</CardTitle>
                    </div>
                    <CardDescription>Send an email or create a Gmail draft.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">Send Email</strong> — sends immediately via the connected SMTP / Gmail account.</p>
                    <p><strong className="text-foreground">Create Gmail Draft</strong> — leaves a draft in your Gmail folder so you can review before sending.</p>
                    <p>Both support <code>{'{{lead.name}}'}</code> template variables.</p>
                  </CardContent>
                </Card>

                <Card className="bg-card text-card-foreground">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">AI</CardTitle>
                    </div>
                    <CardDescription>Run AI enrichment, scoring, or outreach.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">AI Analysis</strong> — analyses the lead / reply and tags it.</p>
                    <p><strong className="text-foreground">AI Outreach</strong> — generates a personalised cold-outreach message.</p>
                    <p>Both consume credits — see <a href="#credits-usage" className="underline">Credits &amp; Usage</a>.</p>
                  </CardContent>
                </Card>

                <Card className="bg-card text-card-foreground">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Wait</CardTitle>
                    </div>
                    <CardDescription>Pause execution for a duration.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">Wait/Delay</strong> — sleeps the execution for minutes / hours / days.</p>
                    <p>Useful for spacing follow-ups or waiting for an event window to close.</p>
                  </CardContent>
                </Card>

                <Card className="bg-card text-card-foreground">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Condition</CardTitle>
                    </div>
                    <CardDescription>Branch based on a rule.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">Conditional Branch</strong> — evaluates a predicate and routes the flow.</p>
                    <p>Common predicates: <code>score &gt; 80</code>, <code>stage == &apos;Replied&apos;</code>, <code>tags includes &apos;enterprise&apos;</code>.</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-card text-card-foreground mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Other built-in actions</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p><strong className="text-foreground">Move Lead Stage</strong> — change pipeline stage.</p>
                    <p><strong className="text-foreground">Update Tags</strong> — add/remove tags on a lead.</p>
                    <p><strong className="text-foreground">Create Notification</strong> — in-app + push notification.</p>
                    <p><strong className="text-foreground">Webhook Call</strong> — outbound HTTP request.</p>
                    <p><strong className="text-foreground">Export Data</strong> — dump lead/execution data to CSV.</p>
                    <p><strong className="text-foreground">Score Lead</strong> — recompute AI score.</p>
                    <p><strong className="text-foreground">Add Note</strong> — append a note to the lead timeline.</p>
                    <p><strong className="text-foreground">Notify Low Credits / Trial Ending</strong> — billing-side alerts.</p>
                    <p><strong className="text-foreground">Send Telegram / WhatsApp</strong> — push messages to connected channels.</p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 6. Executions */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="executions" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Server className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">6. Executions</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>
                    An <strong>execution</strong> is a single run of a workflow. Each
                    execution has a status, a current-step pointer, a total-step count,
                    start/completion timestamps, an error (if any), and a retry counter.
                  </p>
                  <h3 className="text-base font-semibold mt-6 mb-2">Execution lifecycle</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><Badge variant="default">running</Badge> — steps are being executed sequentially.</li>
                    <li><Badge variant="secondary">paused</Badge> — held mid-flight (by user or by a Wait node).</li>
                    <li><Badge variant="default">completed</Badge> — every step finished successfully.</li>
                    <li><Badge variant="destructive">failed</Badge> — a step threw an error and retries are exhausted.</li>
                    <li><Badge variant="destructive">dead-lettered</Badge> — moved to the dead-letter queue for manual review / replay.</li>
                  </ul>
                  <h3 className="text-base font-semibold mt-6 mb-2">Retries &amp; timeouts</h3>
                  <p>
                    Every execution carries a <code>maxRetries</code> (default 3, env:
                    <code>WORKFLOW_MAX_RETRIES</code>) and <code>timeoutMs</code> (default
                    300 000 ms, env: <code>WORKFLOW_TIMEOUT</code>). When a step fails the
                    engine retries up to <code>maxRetries</code> times with backoff. After
                    all retries are spent, the execution is dead-lettered.
                  </p>
                  <h3 className="text-base font-semibold mt-6 mb-2">What you can do with an execution</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Pause / Resume</strong> — hold and later continue (state preserved).</li>
                    <li><strong>Cancel</strong> — abort immediately.</li>
                    <li><strong>Retry</strong> — re-run from the failed step.</li>
                    <li><strong>Replay</strong> — re-run the whole workflow from step 0 with the same trigger data.</li>
                    <li><strong>Inspect logs</strong> — view the per-step input, output, duration, and error.</li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 7. Templates */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="templates" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <LayoutTemplate className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">7. Templates</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>
                    The <strong>Templates</strong> sub-tab ships ready-made workflows you
                    can install in one click. Categories: <em>Nurture, Follow-up, Alerts,
                    Onboarding, Enrichment</em>. Some templates are premium (Pro/Elite
                    only); the rest are free.
                  </p>
                  <p>
                    Installing a template clones the definition into your account as a
                    Draft — you then customise and enable it. The original template is
                    untouched, so you can install the same template multiple times with
                    different configurations.
                  </p>
                  <h3 className="text-base font-semibold mt-6 mb-2">Featured templates</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>New Lead Nurture (5 steps)</strong> — discover → AI score → wait 1d → email #1 → wait 3d → email #2.</li>
                    <li><strong>Reply-to-Meeting (4 steps)</strong> — reply → AI summarise → notify sales → create draft reply.</li>
                    <li><strong>Stale Lead Wake-up (3 steps)</strong> — scheduled weekly → score &gt; 70 → re-engage email.</li>
                    <li><strong>Trial Expiry Reminder (2 steps)</strong> — trial ending → notify + offer upgrade.</li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 8. Credits & Usage */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="credits-usage" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Coins className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">8. Credits &amp; Usage</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>
                    Workflow executions and AI actions consume <strong>credits</strong>.
                    Your monthly credit allowance depends on your plan (Free / Pro /
                    Elite). Unused credits roll over up to a cap; they reset on the
                    monthly billing date.
                  </p>
                  <h3 className="text-base font-semibold mt-6 mb-2">What consumes credits</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Every workflow execution: <strong>1 credit</strong> base cost.</li>
                    <li>Every AI action inside a workflow: <strong>+1 credit</strong>.</li>
                    <li>AI scoring / enrichment outside workflows: credits per call.</li>
                  </ul>
                  <h3 className="text-base font-semibold mt-6 mb-2">Plan limits</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4 font-semibold">Plan</th>
                          <th className="py-2 pr-4 font-semibold">Monthly credits</th>
                          <th className="py-2 pr-4 font-semibold">Workflow cap</th>
                          <th className="py-2 font-semibold">Executions / month</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Free</td><td className="py-2 pr-4">100</td><td className="py-2 pr-4">3</td><td className="py-2">50</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-medium text-foreground">Pro</td><td className="py-2 pr-4">2,000</td><td className="py-2 pr-4">25</td><td className="py-2">unlimited*</td></tr>
                        <tr><td className="py-2 pr-4 font-medium text-foreground">Elite</td><td className="py-2 pr-4">10,000</td><td className="py-2 pr-4">unlimited</td><td className="py-2">unlimited*</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">* Subject to fair-use and credit balance.</p>
                  <h3 className="text-base font-semibold mt-6 mb-2">Credit warnings</h3>
                  <p>
                    When your balance drops below 20% / 10% / 0 of your monthly allowance,
                    the engine emits a <code>credit_warning</code> / <code>credit_zero</code>
                    audit event and (optionally) fires a <strong>Credits Low</strong>
                    trigger — so you can build a workflow that auto-notifies you when
                    you&apos;re about to run out.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 9. Subscription & Retention */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="subscription-retention" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">9. Subscription &amp; Retention</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <div className="rounded-md border border-orange-300/60 bg-orange-50 dark:bg-orange-950/30 p-3 mb-4 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-800 dark:text-orange-300">
                      <strong>Workflows are NEVER deleted when a subscription expires.</strong>
                      Your automation is safe across billing changes — only its
                      <em> status</em> changes.
                    </p>
                  </div>

                  <h3 className="text-base font-semibold mt-4 mb-2">What happens on expiry</h3>
                  <p>
                    When a subscription transitions to <Badge variant="destructive" className="ml-1">expired</Badge> —
                    whether by trial end, scheduled downgrade to Free, or cancel-at-period-end —
                    the system <strong>auto-pauses every active workflow</strong> and sets a
                    <code> disabledBySubscription</code> flag on it. The workflow
                    definition, nodes, edges, executions, and history are all preserved.
                  </p>

                  <h3 className="text-base font-semibold mt-6 mb-2">What happens on renewal</h3>
                  <p>
                    When a paid plan is reactivated (a new payment is confirmed), the
                    engine auto-resumes every workflow whose <code>disabledBySubscription</code>
                    flag is <code>true</code> — flipping it back to <Badge variant="default" className="ml-1">Active</Badge> and clearing the flag.
                  </p>

                  <h3 className="text-base font-semibold mt-6 mb-2">User intent is preserved</h3>
                  <p>
                    If <em>you</em> manually paused a workflow before the subscription
                    expired, it stays paused on renewal — the system only resumes
                    workflows it itself paused. Likewise, if you manually resume a
                    workflow the flag is cleared so it won&apos;t be re-touched by future
                    subscription transitions.
                  </p>

                  <h3 className="text-base font-semibold mt-6 mb-2">3-layer defence against running a paused workflow</h3>
                  <ol className="list-decimal pl-5 space-y-1.5">
                    <li>
                      <strong>UI disabled</strong> — the Execute / Run buttons, the
                      Enable switch, and the Execute-Now dropdown are all disabled
                      when <code>disabledBySubscription</code> is true. An orange
                      <Badge variant="outline" className="mx-1 bg-orange-100 text-orange-800 border-orange-300">Subscription Paused</Badge>
                      badge appears on the card with a hint to renew.
                    </li>
                    <li>
                      <strong>API 400</strong> — calls to <code>PUT /api/workflows/[id]</code>{' '}
                      that try to set <code>status: 'active'</code> on a flagged
                      workflow are rejected with an explanatory error.
                    </li>
                    <li>
                      <strong>Execute 403</strong> — <code>POST /api/workflows/[id]/execute</code>{' '}
                      returns <code>403 SUBSCRIPTION_PAUSED</code> if a flagged workflow
                      is invoked directly. Even though the engine technically allows
                      draft + active executions, the route short-circuits before
                      reaching the engine.
                    </li>
                  </ol>

                  <h3 className="text-base font-semibold mt-6 mb-2">Audit trail</h3>
                  <p>
                    Every auto-pause emits a <code>workflows_auto_paused</code> billing
                    audit event with the reason (<code>subscription_expired</code>,
                    <code> trial_expired</code>, or <code>scheduled_downgrade_to_free</code>).
                    Every auto-resume emits a <code>workflows_auto_resumed</code> event
                    with reason <code>payment_activated</code>. Find these under
                    Settings → Audit Log filtered to <code>resource = billing</code>.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 10. API Reference */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="api-reference" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">10. API Reference</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <p>All endpoints require a valid session cookie or Bearer token.</p>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4 font-semibold">Method</th>
                          <th className="py-2 pr-4 font-semibold">Path</th>
                          <th className="py-2 font-semibold">Description</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">GET</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows</td><td className="py-2">List workflows (filters: status, triggerType, search).</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows</td><td className="py-2">Create a workflow (starts in draft).</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">GET</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]</td><td className="py-2">Get a single workflow + recent executions.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">PUT</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]</td><td className="py-2">Update fields / status (clears disabledBySubscription on user status change).</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">DELETE</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]</td><td className="py-2">Soft-delete (archive).</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]/execute</td><td className="py-2">Execute. Returns 202 + executionId. 403 if disabledBySubscription.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]/pause</td><td className="py-2">Pause workflow.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]/resume</td><td className="py-2">Resume a paused workflow (clears disabledBySubscription).</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/[id]/duplicate</td><td className="py-2">Clone as a new draft.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">GET</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions</td><td className="py-2">List recent executions.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">GET</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions/[id]/logs</td><td className="py-2">Per-step logs.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions/[id]/retry</td><td className="py-2">Retry from failed step.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions/[id]/replay</td><td className="py-2">Replay from step 0.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions/[id]/pause</td><td className="py-2">Pause a running execution.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions/[id]/resume</td><td className="py-2">Resume a paused execution.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/executions/[id]/cancel</td><td className="py-2">Cancel execution.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">GET</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/templates</td><td className="py-2">List installable templates.</td></tr>
                        <tr className="border-b"><td className="py-2 pr-4 font-mono text-foreground">POST</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/webhook/[...path]</td><td className="py-2">Webhook trigger entry. Body forwarded as triggerData.</td></tr>
                        <tr><td className="py-2 pr-4 font-mono text-foreground">GET</td><td className="py-2 pr-4 font-mono text-foreground">/api/workflows/metrics</td><td className="py-2">Roll-up metrics for dashboards.</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <h3 className="text-base font-semibold mt-6 mb-2">Example: trigger via API</h3>
                  <pre className="rounded-md border bg-muted/50 p-3 text-xs overflow-x-auto"><code>{`curl -X POST https://acquisition.space-z.ai/api/workflows/\\
  $(WORKFLOW_ID)/execute \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: acquisitionos-session=…' \\
  -d '{ "triggerData": { "leadId": "abc123" }, "idempotencyKey": "webhook-abc123-1" }'

# 202 Accepted
# { "executionId": "ck…", "status": "running" }`}</code></pre>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 11. Best Practices */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="best-practices" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">11. Best Practices</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Start from a template</strong> — clone a featured template, then customise. Faster than building from scratch.</li>
                    <li><strong>Test as a draft first</strong> — execute manually against a real lead before flipping to Active. The Executions tab shows step-by-step logs.</li>
                    <li><strong>Always use an idempotency key on webhook triggers</strong> — protects you from double-fires.</li>
                    <li><strong>Keep workflows short</strong> — 5-7 nodes is the sweet spot. Long workflows are harder to debug and more brittle.</li>
                    <li><strong>Use Wait nodes for human-paced cadences</strong> — 1d / 3d / 7d spacing reads as natural, not spammy.</li>
                    <li><strong>Branch on score</strong> — route high-score leads to fast follow-up, low-score leads to long-term nurture.</li>
                    <li><strong>Set the AI action&apos;s temperature low (0.2-0.4)</strong> for outreach that needs to be predictable.</li>
                    <li><strong>Watch the dead-letter queue</strong> — failed executions land there. Replay once you&apos;ve fixed the root cause.</li>
                    <li><strong>Version your templates</strong> — bump version when changing trigger config so existing executions remain reproducible.</li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* 12. Troubleshooting */}
            {/* ─────────────────────────────────────────────────────── */}
            <section id="troubleshooting" className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <CircleHelp className="h-5 w-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-semibold">12. Troubleshooting</h2>
              </div>
              <Card className="bg-card text-card-foreground">
                <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 sm:p-6">
                  <h3 className="text-base font-semibold mb-2">My workflow won&apos;t run automatically</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Check the status — only <Badge variant="default">Active</Badge> workflows react to triggers. Drafts and Paused workflows don&apos;t.</li>
                    <li>If the badge says <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">Subscription Paused</Badge>, your subscription expired. Renew to auto-resume.</li>
                    <li>Verify the trigger type matches the event you&apos;re expecting (e.g. <code>lead_reply</code> fires on email reply, not on stage change).</li>
                  </ul>

                  <h3 className="text-base font-semibold mt-6 mb-2">Execute button is greyed out</h3>
                  <p>
                    The Execute / Run / Execute-Now controls are disabled when the
                    workflow is archived or subscription-paused. The detail view
                    shows an orange badge + hint when subscription-paused.
                  </p>

                  <h3 className="text-base font-semibold mt-6 mb-2">Execution failed mid-way</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Open the execution and read the per-step error log.</li>
                    <li>Most failures are AI/credit exhaustion, missing Gmail connection, or a malformed template variable.</li>
                    <li>Use <strong>Retry</strong> to re-run from the failed step, or <strong>Replay</strong> to start fresh.</li>
                  </ul>

                  <h3 className="text-base font-semibold mt-6 mb-2">Renewed my subscription but workflow still paused</h3>
                  <p>
                    Only workflows with <code>disabledBySubscription = true</code> are
                    auto-resumed. If you manually paused a workflow before the expiry,
                    it stays paused — flip the Enable switch to resume it. If the
                    badge still shows <em>Subscription Paused</em> after renewal,
                    refresh the page (the engine should have cleared the flag
                    automatically).
                  </p>

                  <h3 className="text-base font-semibold mt-6 mb-2">Webhook trigger not firing</h3>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Confirm the webhook URL: <code>/api/workflows/webhook/&lt;path&gt;</code> matching the trigger config.</li>
                    <li>Check the inbound request returns 202.</li>
                    <li>Look in Executions for a record — if there&apos;s none, the trigger config didn&apos;t match.</li>
                  </ul>

                  <h3 className="text-base font-semibold mt-6 mb-2">Still stuck?</h3>
                  <p>
                    Open the in-app feedback widget (bottom-right) and attach the
                    execution ID + workflow ID. The team monitors feedback daily.
                  </p>
                </CardContent>
              </Card>
            </section>

            <footer className="border-t pt-6 text-sm text-muted-foreground">
              <p>
                Last updated for AcquisitionOS Workflow Engine v1. See also:
                {' '}
                <Link href="/" className="underline hover:text-foreground">dashboard</Link>
                {' · '}
                <Link href="/api-docs" className="underline hover:text-foreground">API docs</Link>
                {' · '}
                <Link href="/dashboard/billing" className="underline hover:text-foreground">billing</Link>
              </p>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}
