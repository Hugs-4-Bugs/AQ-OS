'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Mail,
  Search,
  Star,
  Heart,
  Clock,
  TrendingUp,
  Send,
  Filter,
  X,
  Eye,
  Copy,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  preview: string;
  openRate: number;
  replyRate: number;
  usageCount: number;
  isFavorite: boolean;
  variables: string[];
}

interface EmailTemplateLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate?: (template: EmailTemplate) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'All',
  'Introduction',
  'Follow-up',
  'Proposal',
  'Meeting Request',
  'Thank You',
  'Re-engagement',
  'Partnership',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Introduction: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  'Follow-up': 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  Proposal: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20',
  'Meeting Request': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'Thank You': 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/20',
  'Re-engagement': 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20',
  Partnership: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
};

// ── Mock Data ───────────────────────────────────────────────────────────────

const INITIAL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'warm-introduction',
    name: 'Warm Introduction',
    category: 'Introduction',
    subject: 'Introduction — synergy between {{business_name}} and {{my_company}}',
    body: `Hi {{contact_name}},

I hope this message finds you well. My name is {{sender_name}} and I'm reaching out from {{my_company}}.

I've been following {{business_name}} for some time now, and I'm genuinely impressed by the work you're doing in the {{industry}} space. After reviewing your recent initiatives, I believe there could be a meaningful opportunity for our teams to collaborate.

At {{my_company}}, we specialize in {{my_specialty}}, and I think there's a strong alignment between what you're building and the solutions we offer.

I'd love to schedule a brief 15-minute call to share some ideas that I think could add significant value to {{business_name}}. Would you be open to connecting this week?

Looking forward to hearing from you.

Best regards,
{{sender_name}}
{{sender_title}} | {{my_company}}`,
    preview: 'A personalized introduction highlighting synergy between companies...',
    openRate: 68,
    replyRate: 24,
    usageCount: 1842,
    isFavorite: true,
    variables: ['contact_name', 'business_name', 'my_company', 'sender_name', 'industry', 'my_specialty', 'sender_title'],
  },
  {
    id: 'follow-up-after-meeting',
    name: 'Follow-Up After Meeting',
    category: 'Follow-up',
    subject: 'Great meeting today — next steps for {{business_name}}',
    body: `Hi {{contact_name}},

Thank you so much for taking the time to meet with me today. I really enjoyed our conversation about {{meeting_topic}}.

As discussed, here's a quick summary of the key points we covered:
• Your current focus on {{current_focus}}
• The challenges you're facing with {{challenge_area}}
• How {{my_company}} can support your goals through {{solution_type}}

I've attached the materials I mentioned during our call, including {{attachment_name}}. Please feel free to share them with your team.

Based on our discussion, I'd suggest we schedule a follow-up call for {{next_week}} to dive deeper into the implementation details. Would {{suggested_date}} at {{suggested_time}} work for you?

In the meantime, if you have any questions, please don't hesitate to reach out.

Best regards,
{{sender_name}}`,
    preview: 'Reconnect after a productive meeting with key takeaways and next steps...',
    openRate: 82,
    replyRate: 41,
    usageCount: 3156,
    isFavorite: true,
    variables: ['contact_name', 'meeting_topic', 'current_focus', 'challenge_area', 'my_company', 'solution_type', 'attachment_name', 'next_week', 'suggested_date', 'suggested_time', 'sender_name'],
  },
  {
    id: 'proposal-review',
    name: 'Proposal Review',
    category: 'Proposal',
    subject: 'Custom proposal for {{business_name}} — review requested',
    body: `Hi {{contact_name}},

Following our recent conversations, I'm excited to share a tailored proposal for {{business_name}}. This document outlines how we can help you achieve {{goal_description}}.

**Proposal Highlights:**
1. **Phase 1 — Assessment** ({{timeline_phase1}}): Comprehensive analysis of your current {{department}} operations and identification of key optimization areas.
2. **Phase 2 — Strategy** ({{timeline_phase2}}): Development of a customized roadmap aligned with your specific business objectives and growth targets.
3. **Phase 3 — Execution** ({{timeline_phase3}}): Hands-on implementation with dedicated support and weekly progress reviews.

**Expected Outcomes:**
- {{outcome_1}}
- {{outcome_2}}
- {{outcome_3}}

I've attached the full proposal document for your review. I'd love to walk you through the details — would you be available for a 30-minute call on {{proposal_review_date}}?

Looking forward to your feedback.

Best regards,
{{sender_name}}
{{sender_title}} | {{my_company}}`,
    preview: 'A structured proposal with clear phases, timelines, and expected outcomes...',
    openRate: 71,
    replyRate: 33,
    usageCount: 1287,
    isFavorite: false,
    variables: ['contact_name', 'business_name', 'goal_description', 'timeline_phase1', 'timeline_phase2', 'timeline_phase3', 'department', 'outcome_1', 'outcome_2', 'outcome_3', 'proposal_review_date', 'sender_name', 'sender_title', 'my_company'],
  },
  {
    id: 'schedule-demo',
    name: 'Schedule a Demo',
    category: 'Meeting Request',
    subject: 'Quick demo of {{product_name}} — {{business_name}}',
    body: `Hi {{contact_name}},

I hope you're having a great week!

I'd love to show you how {{product_name}} can help {{business_name}} {{benefit_statement}}. Our platform has helped companies like {{competitor_or_peer}} achieve {{peer_result}} within {{timeframe}}.

During the demo, I'll walk you through:
• How {{product_name}} integrates with your existing {{tech_stack}} setup
• Real-time dashboard and analytics capabilities
• Custom workflows tailored to your {{industry}} needs
• ROI projections based on your current metrics

The demo takes about 20 minutes, and I promise to keep it focused on what matters most to {{business_name}}.

Here are a few time slots that work for me:
- {{slot_1}}
- {{slot_2}}
- {{slot_3}}

If none of these work, feel free to suggest a time that's convenient for you.

Looking forward to connecting!

Best regards,
{{sender_name}}`,
    preview: 'Invite prospects to a personalized product demonstration...',
    openRate: 64,
    replyRate: 19,
    usageCount: 2415,
    isFavorite: false,
    variables: ['contact_name', 'product_name', 'business_name', 'benefit_statement', 'competitor_or_peer', 'peer_result', 'timeframe', 'tech_stack', 'industry', 'slot_1', 'slot_2', 'slot_3', 'sender_name'],
  },
  {
    id: 'thank-you-time',
    name: 'Thank You for Your Time',
    category: 'Thank You',
    subject: 'Thank you, {{contact_name}} — it was great connecting',
    body: `Hi {{contact_name}},

I wanted to take a moment to sincerely thank you for the time you spent with me {{context}}. It was a pleasure learning more about {{business_name}} and the incredible work your team is doing.

A few key takeaways that stood out to me:
- Your innovative approach to {{notable_initiative}}
- The impressive growth trajectory in {{growth_area}}
- Your team's commitment to {{core_value}}

I'm particularly excited about the potential for {{opportunity_area}}, and I believe {{my_company}} is well-positioned to support you in that journey.

I'll follow up next week with {{follow_up_item}} as promised. In the meantime, please feel free to reach out if anything comes up.

Thank you again for your time and consideration.

Warm regards,
{{sender_name}}
{{sender_title}} | {{my_company}}`,
    preview: 'Express gratitude and reinforce key discussion points...',
    openRate: 91,
    replyRate: 52,
    usageCount: 3521,
    isFavorite: true,
    variables: ['contact_name', 'context', 'business_name', 'notable_initiative', 'growth_area', 'core_value', 'opportunity_area', 'my_company', 'follow_up_item', 'sender_name', 'sender_title'],
  },
  {
    id: 'checking-in',
    name: 'Checking In',
    category: 'Re-engagement',
    subject: 'Checking in — any updates on your end, {{contact_name}}?',
    body: `Hi {{contact_name}},

I hope everything is going well at {{business_name}}! It's been a little while since we last connected, and I wanted to check in.

Since our last conversation about {{previous_topic}}, I've been thinking about how things might have evolved on your end. We've recently launched some exciting updates at {{my_company}}, including {{new_feature_or_update}}, which I think could be really relevant to what you're working on.

I also noticed {{recent_news_or_achievement}} — congratulations on that! It's clear that {{business_name}} continues to make great strides in the {{industry}} space.

If you're open to it, I'd love to catch up and hear about what's new. No pressure at all — just a friendly check-in.

Would any of these times work for a quick chat?
- {{slot_1}}
- {{slot_2}}

Looking forward to hearing from you.

Best regards,
{{sender_name}}`,
    preview: 'Re-engage cold or dormant leads with a friendly, personalized check-in...',
    openRate: 47,
    replyRate: 15,
    usageCount: 956,
    isFavorite: false,
    variables: ['contact_name', 'business_name', 'previous_topic', 'my_company', 'new_feature_or_update', 'recent_news_or_achievement', 'industry', 'slot_1', 'slot_2', 'sender_name'],
  },
  {
    id: 'partnership-opportunity',
    name: 'Partnership Opportunity',
    category: 'Partnership',
    subject: 'Partnership opportunity — {{business_name}} × {{my_company}}',
    body: `Hi {{contact_name}},

I'm reaching out because I see a compelling partnership opportunity between {{business_name}} and {{my_company}}.

After analyzing the market landscape, I believe our combined strengths could create exceptional value for both our customer bases. Here's why I think this partnership makes sense:

**Alignment Points:**
- {{business_name}}'s expertise in {{their_strength}} complements our capabilities in {{my_strength}}
- Our shared target audience in the {{industry}} sector
- Complementary technology stacks with clear integration pathways
- Aligned company values around {{shared_value}}

**Potential Collaboration Models:**
1. **Co-marketing initiatives** — Joint webinars, content, and campaigns
2. **Product integration** — Connecting our platforms for seamless user experience
3. **Referral program** — Mutual referral incentives for both teams
4. **White-label solutions** — Custom packages for enterprise clients

I've put together a brief partnership overview that I'd love to share with you. Would you be open to an introductory call to discuss this further?

Best regards,
{{sender_name}}
{{sender_title}} | {{my_company}}`,
    preview: 'Propose a strategic partnership with clear alignment points...',
    openRate: 59,
    replyRate: 22,
    usageCount: 743,
    isFavorite: false,
    variables: ['contact_name', 'business_name', 'my_company', 'their_strength', 'my_strength', 'industry', 'shared_value', 'sender_name', 'sender_title'],
  },
  {
    id: 'cold-outreach-restaurant',
    name: 'Cold Outreach — Restaurant',
    category: 'Introduction',
    subject: 'Help {{restaurant_name}} grow with {{my_company}}',
    body: `Hi {{contact_name}},

I came across {{restaurant_name}} recently and was blown away by your {{notable_aspect}} — it's no wonder you have such rave reviews on {{review_platform}}!

I'm {{sender_name}} from {{my_company}}, and we help restaurants like yours increase {{metric_improvement}} by an average of {{percentage}}.

Here's what we've done for similar establishments:
• {{case_study_restaurant_1}} — saw a {{result_1}} increase in online orders within 3 months
• {{case_study_restaurant_2}} — reduced no-shows by {{result_2}} with automated confirmations
• {{case_study_restaurant_3}} — grew their loyalty program to {{result_3}} active members

I have a few specific ideas for {{restaurant_name}} that I think could make a real difference, particularly around {{specific_area}}.

Would you be open to a quick 10-minute call this week? I promise it'll be worth your time.

Best regards,
{{sender_name}}
{{my_company}}`,
    preview: 'Industry-specific cold outreach tailored for restaurant businesses...',
    openRate: 43,
    replyRate: 12,
    usageCount: 1634,
    isFavorite: false,
    variables: ['contact_name', 'restaurant_name', 'notable_aspect', 'review_platform', 'sender_name', 'my_company', 'metric_improvement', 'percentage', 'case_study_restaurant_1', 'result_1', 'case_study_restaurant_2', 'result_2', 'case_study_restaurant_3', 'result_3', 'specific_area'],
  },
  {
    id: 'post-demo-follow-up',
    name: 'Post-Demo Follow-Up',
    category: 'Follow-up',
    subject: 'Thanks for the demo today, {{contact_name}} — resources inside',
    body: `Hi {{contact_name}},

Thank you for taking the time to explore {{product_name}} with me today! I hope the demo gave you a clear picture of how it can help {{business_name}} {{benefit_summary}}.

As promised, here are the resources I mentioned:
• 📊 ROI Calculator: {{roi_calculator_link}}
• 📄 Case Study — {{case_study_name}}: {{case_study_link}}
• 🎥 Product Tour Recording: {{recording_link}}
• 💰 Pricing Overview: {{pricing_link}}

**Key Features We Covered:**
- {{feature_1}} — which directly addresses your need for {{need_1}}
- {{feature_2}} — helping streamline your {{process_area}} workflow
- {{feature_3}} — providing real-time insights into your {{data_type}} metrics

Based on what you shared about your priorities, I think {{recommended_plan}} would be the best fit to start with. The monthly investment would be {{price_point}}, with the potential to see ROI within {{roi_timeline}}.

I'd love to answer any questions that came up after the demo. Would you like to schedule a brief follow-up call this week?

Best regards,
{{sender_name}}
{{sender_title}} | {{my_company}}`,
    preview: 'Follow up after a demo with resources, recaps, and a soft push...',
    openRate: 76,
    replyRate: 38,
    usageCount: 2089,
    isFavorite: true,
    variables: ['contact_name', 'product_name', 'business_name', 'benefit_summary', 'roi_calculator_link', 'case_study_name', 'case_study_link', 'recording_link', 'pricing_link', 'feature_1', 'need_1', 'feature_2', 'process_area', 'feature_3', 'data_type', 'recommended_plan', 'price_point', 'roi_timeline', 'sender_name', 'sender_title', 'my_company'],
  },
];

// ── Animation Variants ──────────────────────────────────────────────────────

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.06,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  exit: { opacity: 0, y: -10, scale: 0.96, transition: { duration: 0.2 } },
};

// ── Component ───────────────────────────────────────────────────────────────

export function EmailTemplateLibrary({
  open,
  onOpenChange,
  onSelectTemplate,
}: EmailTemplateLibraryProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(INITIAL_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // ── Derived state ──────────────────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (activeCategory !== 'All') {
      result = result.filter((t) => t.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.subject.toLowerCase().includes(query) ||
          t.preview.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query),
      );
    }

    return result;
  }, [templates, activeCategory, searchQuery]);

  // ── Handlers ───────────────────────────────────────────────────────
  const toggleFavorite = useCallback((templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId ? { ...t, isFavorite: !t.isFavorite } : t,
      ),
    );
  }, []);

  const handleCardClick = useCallback(
    (template: EmailTemplate) => {
      setSelectedTemplate(template);
      setShowDetailModal(true);
    },
    [],
  );

  const handleUseTemplate = useCallback(
    (template: EmailTemplate, e: React.MouseEvent) => {
      e.stopPropagation();
      if (onSelectTemplate) {
        onSelectTemplate(template);
      } else {
        toast.success(`Template "${template.name}" selected`, {
          description: 'Compose dialog will open with pre-filled content.',
        });
      }
      onOpenChange(false);
    },
    [onSelectTemplate, onOpenChange],
  );

  const handleCopyBody = useCallback((body: string) => {
    navigator.clipboard.writeText(body).then(() => {
      toast.success('Template body copied to clipboard');
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setActiveCategory('All');
  }, []);

  // ── Helper ─────────────────────────────────────────────────────────
  const formatCount = (count: number): string => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  const highlightVariables = (text: string) => {
    const parts = text.split(/({{[^}]+}})/g);
    return parts.map((part, i) =>
      part.startsWith('{{') && part.endsWith('}}') ? (
        <span
          key={i}
          className="inline-block rounded bg-primary/10 px-1 py-0.5 text-primary font-mono text-xs"
        >
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Main Library Dialog ──────────────────────────────────── */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-5xl w-full p-0 gap-0 overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl"
          showCloseButton={false}
        >
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between px-6 pt-5 pb-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  Email Template Library
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>

          <Separator className="opacity-50" />

          {/* Search & Filter Bar */}
          <div className="px-6 pt-4 pb-2 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates by name, subject, or keyword..."
                className="h-10 pl-9 pr-10 bg-muted/30 border-border/40 rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted-foreground/10"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1" />
              {CATEGORIES.map((category) => {
                const isActive = activeCategory === category;
                const count =
                  category === 'All'
                    ? templates.length
                    : templates.filter((t) => t.category === category).length;
                return (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={cn(
                      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {category}
                    <span
                      className={cn(
                        'text-[10px] tabular-nums',
                        isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/60',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template Grid */}
          <ScrollArea className="h-[520px] px-6 py-3">
            {filteredTemplates.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                  <Search className="h-7 w-7 text-muted-foreground/50" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">
                  No templates found
                </h3>
                <p className="text-xs text-muted-foreground mb-4 max-w-[240px]">
                  {searchQuery
                    ? `No templates match "${searchQuery}". Try adjusting your search.`
                    : `No templates in the "${activeCategory}" category.`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="gap-1.5 text-xs rounded-lg"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Reset Filters
                </Button>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredTemplates.map((template, index) => (
                    <motion.div
                      key={template.id}
                      custom={index}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      onClick={() => handleCardClick(template)}
                      className="group relative cursor-pointer rounded-xl border border-border/40 bg-background/40 backdrop-blur-sm p-4 transition-all duration-300 hover:border-primary/30 hover:bg-background/70 hover:shadow-lg hover:shadow-primary/5"
                    >
                      {/* Top Row: Category + Favorite */}
                      <div className="flex items-start justify-between mb-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-medium px-2 py-0.5 border',
                            CATEGORY_COLORS[template.category] || 'bg-muted/50 text-muted-foreground',
                          )}
                        >
                          {template.category}
                        </Badge>
                        <button
                          onClick={(e) => toggleFavorite(template.id, e)}
                          className="p-1 rounded-full transition-colors hover:bg-muted/80"
                          aria-label={template.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Heart
                            className={cn(
                              'h-4 w-4 transition-colors',
                              template.isFavorite
                                ? 'fill-red-500 text-red-500'
                                : 'text-muted-foreground/40 group-hover:text-muted-foreground/70',
                            )}
                          />
                        </button>
                      </div>

                      {/* Template Name */}
                      <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-1">
                        {template.name}
                      </h3>

                      {/* Subject Line */}
                      <p className="text-xs text-foreground/70 font-medium mb-2 line-clamp-1">
                        {template.subject}
                      </p>

                      {/* Preview Text */}
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                        {template.preview}
                      </p>

                      {/* Stats Row */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          <span>{template.openRate}%</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          <span>{template.replyRate}%</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatCount(template.usageCount)}</span>
                        </div>
                        {template.isFavorite && (
                          <Star className="h-3 w-3 text-amber-500 ml-auto" />
                        )}
                      </div>

                      {/* Use Template Button */}
                      <Button
                        size="sm"
                        onClick={(e) => handleUseTemplate(template, e)}
                        className="w-full h-8 text-xs gap-1.5 rounded-lg bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm"
                      >
                        <Send className="h-3 w-3" />
                        Use Template
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>

          <Separator className="opacity-50" />

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3">
            <p className="text-[11px] text-muted-foreground">
              Click a card to preview the full template
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Mail className="h-3 w-3" />
                {templates.filter((t) => t.isFavorite).length} favorited
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Template Detail Modal ─────────────────────────────────── */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent
          className="max-w-2xl w-full p-0 gap-0 overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl"
          showCloseButton={false}
        >
          {selectedTemplate && (
            <>
              {/* Detail Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between px-6 pt-5 pb-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 mt-0.5">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-lg font-semibold tracking-tight">
                      {selectedTemplate.name}
                    </DialogTitle>
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-1 text-[10px] font-medium px-2 py-0.5 border',
                        CATEGORY_COLORS[selectedTemplate.category],
                      )}
                    >
                      {selectedTemplate.category}
                    </Badge>
                    <p className="text-sm text-foreground/80 mt-2 font-medium">
                      Subject: {selectedTemplate.subject}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg shrink-0"
                  onClick={() => setShowDetailModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>

              <Separator className="opacity-50" />

              {/* Stats Bar */}
              <div className="flex items-center gap-4 px-6 py-3 bg-muted/20">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{selectedTemplate.openRate}%</span>
                  <span className="text-[10px] text-muted-foreground">open rate</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{selectedTemplate.replyRate}%</span>
                  <span className="text-[10px] text-muted-foreground">reply rate</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{formatCount(selectedTemplate.usageCount)}</span>
                  <span className="text-[10px] text-muted-foreground">times used</span>
                </div>
              </div>

              {/* Email Body */}
              <ScrollArea className="h-[340px]">
                <div className="px-6 py-4">
                  <div className="rounded-xl border border-border/40 bg-background/50 p-5">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-sans">
                      {highlightVariables(selectedTemplate.body)}
                    </pre>
                  </div>

                  {/* Variables List */}
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Available Variables
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplate.variables.map((variable) => (
                        <Badge
                          key={variable}
                          variant="outline"
                          className="text-[11px] font-mono px-2 py-0.5 bg-primary/5 border-primary/15 text-primary/80"
                        >
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <Separator className="opacity-50" />

              {/* Detail Footer */}
              <div className="flex items-center justify-between gap-2 px-6 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyBody(selectedTemplate.body)}
                  className="gap-1.5 text-xs rounded-lg"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Body
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleUseTemplate(selectedTemplate, { stopPropagation: () => {} } as React.MouseEvent)}
                  className="gap-1.5 text-xs rounded-lg bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 shadow-sm"
                >
                  <Send className="h-3.5 w-3.5" />
                  Use This Template
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EmailTemplateLibrary;
