'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Download,
  Calendar,
  Plus,
  Trash2,
  Play,
  Eye,
  X,
  Clock,
  BarChart3,
  Bot,
  DollarSign,
  Activity,
  Users,
  Zap,
  Mail,
  Workflow,
  Gauge,
  RefreshCw,
  Save,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface Report {
  id: string;
  name: string;
  description: string | null;
  type: 'custom' | 'saved' | 'scheduled';
  dashboard: string | null;
  filters: string | null;
  chartConfig: string | null;
  scheduleCron: string | null;
  exportFormat: string;
  createdAt: string;
  updatedAt: string;
}

/* ===== Metric Options ===== */
const DASHBOARD_OPTIONS = [
  { value: 'executive', label: 'Executive', icon: DollarSign },
  { value: 'sales', label: 'Sales', icon: Users },
  { value: 'ai', label: 'AI', icon: Bot },
  { value: 'ops', label: 'Ops', icon: Activity },
];

const METRIC_OPTIONS = [
  { id: 'leads_discovered', label: 'Leads Discovered', category: 'Leads' },
  { id: 'leads_converted', label: 'Leads Converted', category: 'Leads' },
  { id: 'leads_contacted', label: 'Leads Contacted', category: 'Leads' },
  { id: 'response_rate', label: 'Response Rate', category: 'Leads' },
  { id: 'conversion_rate', label: 'Conversion Rate', category: 'Leads' },
  { id: 'pipeline_value', label: 'Pipeline Value', category: 'Leads' },
  { id: 'ai_credits_used', label: 'AI Credits Used', category: 'AI' },
  { id: 'ai_total_usage', label: 'AI Total Usage', category: 'AI' },
  { id: 'ai_provider_breakdown', label: 'AI Provider Breakdown', category: 'AI' },
  { id: 'ai_analysis_volume', label: 'AI Analysis Volume', category: 'AI' },
  { id: 'workflow_executions', label: 'Workflow Executions', category: 'Ops' },
  { id: 'workflow_success_rate', label: 'Workflow Success Rate', category: 'Ops' },
  { id: 'workflow_avg_runtime', label: 'Workflow Avg Runtime', category: 'Ops' },
  { id: 'workflow_queue_depth', label: 'Workflow Queue Depth', category: 'Ops' },
  { id: 'messaging_sent', label: 'Messages Sent', category: 'Messaging' },
  { id: 'messaging_reply_rate', label: 'Reply Rate', category: 'Messaging' },
  { id: 'messaging_channel_breakdown', label: 'Channel Breakdown', category: 'Messaging' },
  { id: 'billing_mrr', label: 'MRR', category: 'Billing' },
  { id: 'billing_arr', label: 'ARR', category: 'Billing' },
  { id: 'billing_revenue', label: 'Total Revenue', category: 'Billing' },
];

const CHART_TYPE_OPTIONS = [
  { value: 'line', label: 'Line Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'funnel', label: 'Funnel Chart' },
];

const EXPORT_FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
];

const SCHEDULE_OPTIONS = [
  { value: '', label: 'No schedule' },
  { value: '0 9 * * 1', label: 'Weekly (Monday 9AM)' },
  { value: '0 9 1 * *', label: 'Monthly (1st 9AM)' },
  { value: '0 9 1 */3 *', label: 'Quarterly (1st 9AM)' },
];

/* ===== Report Builder Component ===== */
export function ReportBuilder({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'custom' | 'saved' | 'scheduled'>('saved');
  const [dashboard, setDashboard] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [chartType, setChartType] = useState('line');
  const [scheduleCron, setScheduleCron] = useState('');
  const [exportFormat, setExportFormat] = useState('json');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId)
        ? prev.filter((m) => m !== metricId)
        : [...prev, metricId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Report name is required');
      return;
    }
    if (selectedMetrics.length === 0) {
      setError('Select at least one metric');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          type,
          dashboard: dashboard || null,
          filters: {
            metrics: selectedMetrics,
            dateRange: dateRange.start ? dateRange : null,
            chartType,
          },
          chartConfig: {
            chartType,
            metrics: selectedMetrics,
          },
          scheduleCron: scheduleCron || null,
          exportFormat,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Failed to save report');
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  // Group metrics by category
  const metricsByCategory = METRIC_OPTIONS.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {} as Record<string, typeof METRIC_OPTIONS>);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="card-glow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Create Report
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-name" className="text-xs font-medium">Name *</Label>
              <Input
                id="report-name"
                placeholder="Monthly Sales Report"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-desc" className="text-xs font-medium">Description</Label>
              <Input
                id="report-desc"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Type & Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Report Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'custom' | 'saved' | 'scheduled')}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="saved">Saved</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Dashboard</Label>
              <Select value={dashboard} onValueChange={setDashboard}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {DASHBOARD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Chart Type</Label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Metrics Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Metrics *</Label>
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto custom-scrollbar space-y-3">
              {Object.entries(metricsByCategory).map(([category, metrics]) => (
                <div key={category}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{category}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {metrics.map((metric) => (
                      <label
                        key={metric.id}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors',
                          selectedMetrics.includes(metric.id)
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-accent/50'
                        )}
                      >
                        <Checkbox
                          checked={selectedMetrics.includes(metric.id)}
                          onCheckedChange={() => toggleMetric(metric.id)}
                          className="h-3.5 w-3.5"
                        />
                        {metric.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{selectedMetrics.length} metric{selectedMetrics.length !== 1 ? 's' : ''} selected</p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date-start" className="text-xs font-medium">Start Date</Label>
              <Input
                id="date-start"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-end" className="text-xs font-medium">End Date</Label>
              <Input
                id="date-end"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>

          {/* Schedule & Export */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {type === 'scheduled' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Schedule</Label>
                <Select value={scheduleCron} onValueChange={setScheduleCron}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value || 'none'} value={opt.value || 'none'}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Export Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMATS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? 'Saving...' : 'Save Report'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ===== Saved Reports Component ===== */
export function SavedReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showBuilder, setShowBuilder] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const limit = 10;

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reports?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      setReports((data.data as Report[]) || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    fetchReports();
    return () => { cancelled = true; };
  }, [fetchReports]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleExport = async (report: Report) => {
    try {
      // Fetch the report data from the analytics API
      const dashboard = report.dashboard || 'executive';
      const filters = report.filters ? JSON.parse(report.filters) : {};
      const period = filters.dateRange?.start ? 'custom' : '30d';
      const params = new URLSearchParams({ dashboard, period });
      if (filters.dateRange?.start) {
        params.set('start', filters.dateRange.start);
        params.set('end', filters.dateRange.end || new Date().toISOString().split('T')[0]);
      }

      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch data');

      const data = await res.json();
      const format = report.exportFormat || 'json';

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.name.replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'csv') {
        // Simple CSV export of the metrics
        const metrics = data.metrics || {};
        const rows = Object.entries(metrics).map(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            return `"${key}","${JSON.stringify(value)}"`;
          }
          return `"${key}","${value}"`;
        });
        const csv = 'Key,Value\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.name.replace(/\s+/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // PDF - just download as JSON for now
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.name.replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const typeBadgeStyles: Record<string, string> = {
    custom: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    saved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    scheduled: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  };

  const dashboardIcons: Record<string, React.ElementType> = {
    executive: DollarSign,
    sales: Users,
    ai: Bot,
    ops: Activity,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Saved Reports</h3>
          <p className="text-xs text-muted-foreground">{total} report{total !== 1 ? 's' : ''}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowBuilder(true)}
          className="gap-1.5"
          disabled={showBuilder}
        >
          <Plus className="h-3.5 w-3.5" />
          New Report
        </Button>
      </div>

      {/* Report Builder */}
      <AnimatePresence>
        {showBuilder && (
          <ReportBuilder onClose={() => { setShowBuilder(false); fetchReports(); }} />
        )}
      </AnimatePresence>

      {/* Reports List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="py-12 text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mx-auto mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No reports yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first report to get started</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 gap-1.5"
              onClick={() => setShowBuilder(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const DashIcon = dashboardIcons[report.dashboard || ''] || BarChart3;
            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-all group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <DashIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{report.name}</p>
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4', typeBadgeStyles[report.type] || '')}>
                      {report.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {report.dashboard && (
                      <span className="capitalize">{report.dashboard}</span>
                    )}
                    <span>·</span>
                    <span>{report.exportFormat.toUpperCase()}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(report.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleExport(report)}
                    title="Export"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => handleDelete(report.id)}
                    disabled={deleting === report.id}
                    title="Delete"
                  >
                    {deleting === report.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 text-xs"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
