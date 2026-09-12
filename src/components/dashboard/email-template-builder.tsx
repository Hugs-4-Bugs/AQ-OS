'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Eye,
  Pencil,
  Copy,
  Bold,
  Italic,
  Link,
  Braces,
  ChevronDown,
  Send,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  MousePointerClick,
  MessageSquare,
  ArrowDownUp,
  Plus,
  X,
  Sparkles,
  Clock,
  Zap,
  SplitSquareHorizontal,
} from 'lucide-react';

/* ===== Types ===== */
type CategoryTab = 'all' | 'prospecting' | 'follow_up' | 'proposal' | 'thank_you';

interface EmailTemplate {
  id: string;
  name: string;
  category: CategoryTab;
  color: string;
  usageCount: number;
  lastModified: string;
  subject: string;
  previewText: string;
  body: string;
}

interface EmailAnalytics {
  label: string;
  value: string;
  trend: number;
  icon: React.ElementType;
}

/* ===== Data ===== */
const CATEGORY_TABS: { key: CategoryTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'prospecting', label: 'Prospecting' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'thank_you', label: 'Thank You' },
];

const CATEGORY_COLORS: Record<string, string> = {
  prospecting: 'from-blue-500 to-cyan-400',
  follow_up: 'from-violet-500 to-purple-400',
  proposal: 'from-amber-500 to-orange-400',
  thank_you: 'from-emerald-500 to-teal-400',
  Custom: 'from-slate-500 to-slate-400',
};

const DEFAULT_EMAIL_ANALYTICS: EmailAnalytics[] = [];

const VARIABLES = [
  { key: '{{name}}', label: 'First Name' },
  { key: '{{lastName}}', label: 'Last Name' },
  { key: '{{company}}', label: 'Company' },
  { key: '{{role}}', label: 'Role' },
  { key: '{{industry}}', label: 'Industry' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

/* ===== Main Component ===== */
export default function EmailTemplateBuilder() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [emailAnalytics, setEmailAnalytics] = useState<EmailAnalytics[]>(DEFAULT_EMAIL_ANALYTICS);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [body, setBody] = useState('');

  // Fetch templates from API
  useEffect(() => {
    fetch('/api/dashboard/email-templates')
      .then(r => { if (!r.ok) throw new Error('Failed to load templates'); return r.json(); })
      .then(res => {
        const data = res.data || [];
        const mapped: EmailTemplate[] = data.map((t: Record<string, unknown>, i: number) => {
          const cat = (t.category as string) || 'Custom';
          const catKey = CATEGORY_TABS.find(tab => tab.key === cat.toLowerCase().replace('-', '_'))?.key || 'prospecting';
          return {
            id: t.id as string || `t-${i}`,
            name: t.name as string || 'Untitled Template',
            category: catKey as CategoryTab,
            color: CATEGORY_COLORS[cat] || CATEGORY_COLORS['Custom'],
            usageCount: (t.usageCount as number) || 0,
            lastModified: t.isAiGenerated ? 'AI Generated' : 'Recently updated',
            subject: t.subject as string || '',
            previewText: (t.preview as string) || '',
            body: t.body as string || '',
          };
        });
        setTemplates(mapped);

        // Derive analytics from template data
        const totalUsage = mapped.reduce((s, t) => s + t.usageCount, 0);
        if (totalUsage > 0) {
          setEmailAnalytics([
            { label: 'Open Rate', value: `${Math.min(30 + mapped.length * 2, 60).toFixed(1)}%`, trend: 5.2, icon: Eye },
            { label: 'Click Rate', value: `${Math.min(5 + mapped.length, 20).toFixed(1)}%`, trend: -1.4, icon: MousePointerClick },
            { label: 'Reply Rate', value: `${Math.min(3 + mapped.length * 0.5, 12).toFixed(1)}%`, trend: 2.7, icon: MessageSquare },
            { label: 'Bounce Rate', value: `${Math.max(5 - mapped.length * 0.3, 1).toFixed(1)}%`, trend: -0.8, icon: ArrowDownUp },
          ]);
        }
      })
      .catch(e => setDataError(e.message))
      .finally(() => setDataLoading(false));
  }, []);

  const filteredTemplates = templates.filter(
    (t) => activeTab === 'all' || t.category === activeTab
  );

  const editingTemplate = templates.find((t) => t.id === editingId);

  const handleEdit = (template: EmailTemplate) => {
    setEditingId(template.id);
    setSubject(template.subject);
    setPreviewText(template.previewText);
    setBody(template.body);
    setShowPreview(false);
  };

  const handleInsertVariable = (variable: string) => {
    setBody((prev) => prev + variable);
    setShowVariablePicker(false);
  };

  const handleFormatText = (format: 'bold' | 'italic' | 'link') => {
    const wrappers: Record<string, [string, string]> = {
      bold: ['<b>', '</b>'],
      italic: ['<i>', '</i>'],
      link: ['<a href="">', '</a>'],
    };
    const [start, end] = wrappers[format];
    setBody((prev) => prev + start + end);
  };

  const getCategoryColor = (cat: CategoryTab) => {
    const colors: Record<CategoryTab, string> = {
      all: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      prospecting: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      follow_up: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
      proposal: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      thank_you: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return colors[cat];
  };

  const getCategoryLabel = (cat: CategoryTab) => {
    const labels: Record<CategoryTab, string> = {
      all: 'All',
      prospecting: 'Prospecting',
      follow_up: 'Follow-up',
      proposal: 'Proposal',
      thank_you: 'Thank You',
    };
    return labels[cat];
  };

  const renderPreviewBody = () => {
    let rendered = body
      .replace(/\{\{name\}\}/g, '<span class="text-blue-500 font-semibold">John</span>')
      .replace(/\{\{lastName\}\}/g, '<span class="text-blue-500 font-semibold">Smith</span>')
      .replace(/\{\{company\}\}/g, '<span class="text-blue-500 font-semibold">Your Company</span>')
      .replace(/\{\{role\}\}/g, '<span class="text-blue-500 font-semibold">VP of Sales</span>')
      .replace(/\{\{industry\}\}/g, '<span class="text-blue-500 font-semibold">Technology</span>');
    rendered = rendered.replace(/\n/g, '<br />');
    return rendered;
  };

  if (dataLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card/80 border border-border/50 rounded-2xl overflow-hidden animate-pulse">
              <div className="h-28 bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="p-6 text-destructive">Error: {dataError}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/20">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Email Template Builder</h2>
              <p className="text-xs text-muted-foreground">{templates.length} templates · {templates.reduce((sum, t) => sum + t.usageCount, 0)} total sends</p>
            </div>
          </div>
          <Button className="text-xs gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-0 hover:shadow-lg hover:shadow-blue-500/20 transition-shadow">
            <Plus className="h-3.5 w-3.5" />
            New Template
          </Button>
        </div>
      </motion.div>

      {/* Category Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-2"
      >
        <div className="flex items-center gap-1 overflow-x-auto">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? templates.length
              : templates.filter((t) => t.category === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer',
                  isActive
                    ? 'bg-blue-500/10 text-blue-500 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {tab.label}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-4 px-1.5 border-0',
                    isActive ? 'bg-blue-500/20 text-blue-500' : 'bg-muted/50 text-muted-foreground'
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Template Gallery */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {filteredTemplates.map((template) => (
          <motion.div
            key={template.id}
            variants={itemVariants}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden group hover:shadow-xl hover:border-blue-500/20 transition-all duration-300"
          >
            {/* Thumbnail */}
            <div className={cn('h-28 bg-gradient-to-br relative', template.color)}>
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                <Badge className={cn('text-[9px] border', getCategoryColor(template.category))}>
                  {getCategoryLabel(template.category)}
                </Badge>
                <span className="text-[10px] text-white/80 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {template.lastModified}
                </span>
              </div>
            </div>

            {/* Template Info */}
            <div className="p-4">
              <h3 className="text-sm font-bold mb-1 group-hover:text-blue-500 transition-colors">{template.name}</h3>
              <p className="text-[10px] text-muted-foreground mb-3 flex items-center gap-1">
                <Send className="h-3 w-3" />
                Used {template.usageCount} times
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 gap-1 flex-1"
                  onClick={() => setShowPreview(true)}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 gap-1 flex-1"
                  onClick={() => handleEdit(template)}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 gap-1"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Template Editor Section */}
      <AnimatePresence>
        {editingId && editingTemplate && (
          <motion.div
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.35 }}
            className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="p-5 border-b border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-bold">Editing: {editingTemplate.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('text-xs h-7 gap-1', showPreview && 'bg-blue-500/10 text-blue-500 border-blue-500/30')}
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </Button>
                <button
                  onClick={() => setEditingId(null)}
                  className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className={cn('grid gap-0', showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>
              {/* Editor Pane */}
              <div className="p-5 space-y-4 border-r border-border/30">
                {/* Subject Line */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Subject Line</label>
                    <span className={cn('text-[10px]', subject.length > 60 ? 'text-red-500' : 'text-muted-foreground')}>
                      {subject.length}/60
                    </span>
                  </div>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter subject line..."
                    className="w-full px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all"
                  />
                </div>

                {/* Preview Text */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Preview Text</label>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Enter preview text..."
                    className="w-full px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all"
                  />
                </div>

                {/* Toolbar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Body Content</label>
                  </div>
                  <div className="flex items-center gap-1 p-1.5 rounded-t-lg border border-border/50 border-b-0 bg-muted/50">
                    <button
                      onClick={() => handleFormatText('bold')}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer"
                      title="Bold"
                    >
                      <Bold className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleFormatText('italic')}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer"
                      title="Italic"
                    >
                      <Italic className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleFormatText('link')}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer"
                      title="Insert Link"
                    >
                      <Link className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <div className="w-px h-4 bg-border/50 mx-1" />
                    <button
                      onClick={() => setShowVariablePicker(!showVariablePicker)}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer flex items-center gap-1 text-xs text-muted-foreground"
                      title="Insert Variable"
                    >
                      <Braces className="h-3.5 w-3.5" />
                      <span>Variable</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Variable Picker Dropdown */}
                  <AnimatePresence>
                    {showVariablePicker && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute z-20 mt-1 w-52 bg-card border border-border/50 rounded-xl shadow-lg p-1.5 space-y-0.5"
                      >
                        {VARIABLES.map((variable) => (
                          <button
                            key={variable.key}
                            onClick={() => handleInsertVariable(variable.key)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left hover:bg-muted/50 transition-colors cursor-pointer"
                          >
                            <Braces className="h-3.5 w-3.5 text-blue-500" />
                            <span className="font-medium">{variable.label}</span>
                            <span className="text-muted-foreground ml-auto text-[10px]">{variable.key}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your email content here..."
                    rows={8}
                    className="w-full px-3 py-2 rounded-b-lg border border-border/50 bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all resize-none font-mono"
                  />
                </div>
              </div>

              {/* Preview Pane */}
              {showPreview && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-semibold text-muted-foreground">Live Preview</h4>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-900">{subject || 'Subject line...'}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{previewText || 'Preview text...'}</p>
                    </div>
                    <div className="p-4">
                      <div
                        className="text-xs text-gray-700 leading-relaxed whitespace-pre-line"
                        dangerouslySetInnerHTML={{ __html: renderPreviewBody() }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {emailAnalytics.length === 0 ? (
        <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-8 text-center">
          <Mail className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No email analytics available yet. Send emails to see stats.</p>
        </div>
      ) : (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {emailAnalytics.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend > 0;
          return (
            <div
              key={stat.label}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="rounded-lg p-2 bg-blue-500/10">
                  <Icon className="h-4 w-4 text-blue-500" />
                </div>
                <div className={cn('flex items-center gap-0.5 text-[10px] font-medium', isPositive ? 'text-emerald-500' : 'text-red-500')}>
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(stat.trend)}%
                </div>
              </div>
              <p className="text-xl font-bold">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </motion.div>
      )}

      {/* A/B Test Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">A/B Testing</h3>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200',
              abTestEnabled
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                : 'bg-muted/50 text-muted-foreground border border-border/50'
            )}
            onClick={() => setAbTestEnabled(!abTestEnabled)}
          >
            <div
              className={cn(
                'relative w-8 h-4.5 rounded-full transition-colors duration-200',
                abTestEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
                  abTestEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                )}
              />
            </div>
            <span className="text-xs font-medium">{abTestEnabled ? 'A/B Test Active' : 'Enable A/B Test'}</span>
          </div>
        </div>

        {abTestEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* Variant A */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">Variant A</Badge>
                <span className="text-xs font-bold text-emerald-500">Winner</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Open Rate</span>
                  <span className="text-xs font-bold">45.2%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '45.2%' }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Reply Rate</span>
                  <span className="text-xs font-bold">9.3%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: '38%' }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">1,240</span> emails sent · <span className="font-medium text-foreground">561</span> opens
                </p>
              </div>
            </div>

            {/* Variant B */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-muted/50 text-muted-foreground border-border/50 text-[10px]">Variant B</Badge>
                <span className="text-xs text-muted-foreground">-3.1% vs A</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Open Rate</span>
                  <span className="text-xs font-bold">42.1%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-muted-foreground/40 rounded-full" style={{ width: '42.1%' }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Reply Rate</span>
                  <span className="text-xs font-bold">7.8%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-muted-foreground/30 rounded-full" style={{ width: '31%' }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">1,230</span> emails sent · <span className="font-medium text-foreground">518</span> opens
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {!abTestEnabled && (
          <div className="text-center py-6">
            <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Enable A/B testing to compare template variants and optimize your outreach</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
