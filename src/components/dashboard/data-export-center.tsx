'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileJson,
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  Zap,
  ChevronDown,
  CalendarDays,
  ArrowRight,
  Eye,
  Trash2,
  Mail,
  Timer,
  CircleDot,
  Plus,
} from 'lucide-react';

/* ===== Types ===== */
type ReportType = 'pipeline' | 'revenue' | 'lead_analytics' | 'team_performance' | 'forecast' | 'custom';
type DateRange = 'this_week' | 'this_month' | 'this_quarter' | 'custom';
type ExportFormat = 'pdf' | 'excel' | 'csv' | 'json';
type ExportStatus = 'completed' | 'processing' | 'failed';

interface ReportTypeDefinition {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface DateRangeDefinition {
  id: DateRange;
  label: string;
  description: string;
}

interface ExportFormatDefinition {
  id: ExportFormat;
  label: string;
  extension: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface ScheduledReport {
  id: string;
  name: string;
  type: string;
  frequency: string;
  lastRun: string;
  nextRun: string;
  status: 'active' | 'paused';
  recipients: number;
}

interface ExportHistoryEntry {
  id: string;
  reportName: string;
  type: string;
  format: ExportFormat;
  date: string;
  size: string;
  status: ExportStatus;
  requestedBy: string;
}

/* ===== Constants ===== */
const REPORT_TYPES: ReportTypeDefinition[] = [
  { id: 'pipeline', label: 'Pipeline Report', description: 'Full pipeline analysis with stage breakdown', icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'revenue', label: 'Revenue Summary', description: 'Revenue metrics, trends, and forecasts', icon: DollarSign, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  { id: 'lead_analytics', label: 'Lead Analytics', description: 'Lead source, scoring, and conversion data', icon: TrendingUp, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { id: 'team_performance', label: 'Team Performance', description: 'Individual and team productivity metrics', icon: Users, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'forecast', label: 'Forecast Report', description: 'AI-powered revenue and deal predictions', icon: Zap, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { id: 'custom', label: 'Custom Report', description: 'Build your own report from scratch', icon: FileText, color: 'text-pink-500', bg: 'bg-pink-500/10' },
];

const DATE_RANGES: DateRangeDefinition[] = [
  { id: 'this_week', label: 'This Week', description: 'Mon – Today' },
  { id: 'this_month', label: 'This Month', description: '1st – Today' },
  { id: 'this_quarter', label: 'This Quarter', description: 'Q1 – Today' },
  { id: 'custom', label: 'Custom', description: 'Pick your dates' },
];

const EXPORT_FORMATS: ExportFormatDefinition[] = [
  { id: 'pdf', label: 'PDF', extension: '.pdf', icon: FileText, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'excel', label: 'Excel', extension: '.xlsx', icon: FileSpreadsheet, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'csv', label: 'CSV', extension: '.csv', icon: FileText, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  { id: 'json', label: 'JSON', extension: '.json', icon: FileJson, color: 'text-amber-500', bg: 'bg-amber-500/10' },
];

// Scheduled reports loaded from API
const scheduledReports: ScheduledReport[] = [];

// Export history loaded from API
const exportHistory: ExportHistoryEntry[] = [];

const STATUS_STYLES: Record<ExportStatus, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Completed' },
  processing: { icon: RefreshCw, color: 'text-sky-500', bg: 'bg-sky-500/10', label: 'Processing' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
};

/* ===== Animation Styles ===== */
const animationStyles = `
@keyframes exportFadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes exportScaleIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes exportToastSlide {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes exportSpinner {
  to { transform: rotate(360deg); }
}
.export-animate-in { animation: exportFadeSlideIn 0.5s ease-out both; }
.export-animate-in-d1 { animation: exportFadeSlideIn 0.5s ease-out 0.1s both; }
.export-animate-in-d2 { animation: exportFadeSlideIn 0.5s ease-out 0.2s both; }
.export-animate-in-d3 { animation: exportFadeSlideIn 0.5s ease-out 0.3s both; }
.export-scale-in { animation: exportScaleIn 0.3s ease-out both; }
.export-toast-in { animation: exportToastSlide 0.3s ease-out both; }
.export-spinner { animation: exportSpinner 1s linear infinite; }
`;

export default function DataExportCenter() {
  const [selectedReport, setSelectedReport] = useState<ReportType>('pipeline');
  const [selectedRange, setSelectedRange] = useState<DateRange>('this_month');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleExport = useCallback(() => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      const reportLabel = REPORT_TYPES.find((r) => r.id === selectedReport)?.label;
      const formatLabel = EXPORT_FORMATS.find((f) => f.id === selectedFormat)?.label;
      showToast(`${reportLabel} exported as ${formatLabel} successfully!`);
    }, 1500);
  }, [selectedReport, selectedFormat, showToast]);

  const handleQuickExport = useCallback((reportName: string, format: ExportFormat) => {
    showToast(`${reportName} (${format.toUpperCase()}) export started!`, 'info');
    setTimeout(() => showToast(`${reportName} exported successfully!`), 2000);
  }, [showToast]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'export-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-500 to-teal-600">
                  <Download className="h-4 w-4 text-white" />
                </div>
                Data Export & Reports Center
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px] h-5">
                  {scheduledReports.filter((s) => s.status === 'active').length} active schedules
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5">
                  {exportHistory.length} recent exports
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Quick Export Buttons */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'export-animate-in-d1' : 'opacity-0')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Quick Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Pipeline Report', format: 'pdf' as ExportFormat, color: 'text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20' },
                { label: 'Revenue Summary', format: 'excel' as ExportFormat, color: 'text-sky-600 bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20' },
                { label: 'Lead Analytics', format: 'csv' as ExportFormat, color: 'text-violet-600 bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20' },
                { label: 'Forecast Data', format: 'json' as ExportFormat, color: 'text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleQuickExport(item.label, item.format)}
                  className={cn(
                    'flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-semibold transition-all duration-200 cursor-pointer',
                    item.color
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  {item.label}
                  <span className="text-[9px] font-normal opacity-60 uppercase">{item.format}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report Builder */}
          <div className={cn('lg:col-span-2', mounted ? 'export-animate-in-d2' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Export Builder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Report type selector */}
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Report Type</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {REPORT_TYPES.map((r) => {
                      const Icon = r.icon;
                      const isSelected = selectedReport === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedReport(r.id)}
                          className={cn(
                            'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer',
                            isSelected
                              ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-sm'
                              : 'border-border/50 hover:border-border hover:bg-muted/30'
                          )}
                        >
                          <div className={cn('rounded-md p-1.5 shrink-0', isSelected ? r.bg : 'bg-muted/50')}>
                            <Icon className={cn('h-3.5 w-3.5', isSelected ? r.color : 'text-muted-foreground')} />
                          </div>
                          <div className="min-w-0">
                            <p className={cn('text-[11px] font-semibold truncate', isSelected ? 'text-foreground' : 'text-muted-foreground')}>{r.label}</p>
                            <p className="text-[9px] text-muted-foreground truncate hidden sm:block">{r.description.slice(0, 30)}...</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date range selector */}
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Date Range</p>
                  <div className="flex gap-1.5">
                    {DATE_RANGES.map((range) => (
                      <button
                        key={range.id}
                        onClick={() => setSelectedRange(range.id)}
                        className={cn(
                          'flex-1 flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-lg border transition-all duration-200 cursor-pointer',
                          selectedRange === range.id
                            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border/50 hover:border-border hover:bg-muted/30'
                        )}
                      >
                        <CalendarDays className={cn('h-4 w-4', selectedRange === range.id ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('text-[11px] font-semibold', selectedRange === range.id ? 'text-foreground' : 'text-muted-foreground')}>
                          {range.label}
                        </span>
                        <span className="text-[9px] text-muted-foreground">{range.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export format selector */}
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Export Format</p>
                  <div className="grid grid-cols-4 gap-2">
                    {EXPORT_FORMATS.map((fmt) => {
                      const Icon = fmt.icon;
                      const isSelected = selectedFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          onClick={() => setSelectedFormat(fmt.id)}
                          className={cn(
                            'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-200 cursor-pointer',
                            isSelected
                              ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border/50 hover:border-border hover:bg-muted/30'
                          )}
                        >
                          <div className={cn('rounded-lg p-2', isSelected ? fmt.bg : 'bg-muted/50')}>
                            <Icon className={cn('h-5 w-5', isSelected ? fmt.color : 'text-muted-foreground')} />
                          </div>
                          <span className={cn('text-[11px] font-bold', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                            {fmt.label}
                          </span>
                          <span className="text-[9px] text-muted-foreground">{fmt.extension}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Export button */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    className="flex-1 gap-2 text-sm"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <RefreshCw className="h-4 w-4 export-spinner" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Export Report
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="default" className="gap-1.5 text-sm" onClick={() => showToast('Report preview opened', 'info')}>
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                </div>

                {/* Summary */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30 text-xs text-muted-foreground">
                  <CircleDot className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <strong className="text-foreground">{REPORT_TYPES.find((r) => r.id === selectedReport)?.label}</strong> &middot;{' '}
                    {DATE_RANGES.find((r) => r.id === selectedRange)?.label} &middot;{' '}
                    {EXPORT_FORMATS.find((f) => f.id === selectedFormat)?.label} format
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scheduled Reports */}
          <div className={cn(mounted ? 'export-animate-in-d3' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Timer className="h-4 w-4 text-violet-500" />
                    Scheduled Reports
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] h-6 gap-1"
                    onClick={() => showToast('Schedule form opened', 'info')}
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduledReports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Timer className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No scheduled exports</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a schedule to automate recurring exports.</p>
                  </div>
                ) : (
                  scheduledReports.map((sched) => (
                    <div
                      key={sched.id}
                      className={cn(
                        'p-3 rounded-lg border transition-all duration-200 hover:shadow-sm',
                        sched.status === 'active'
                          ? 'border-border/50 bg-background/50'
                          : 'border-border/30 bg-muted/20 opacity-70'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{sched.name}</p>
                          <p className="text-[10px] text-muted-foreground">{sched.type}</p>
                        </div>
                        <Badge
                          className={cn(
                            'text-[8px] px-1.5 py-0 h-4 shrink-0 ml-2 border',
                            sched.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/25'
                          )}
                        >
                          {sched.status === 'active' ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {sched.frequency}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">Last: {sched.lastRun}</span>
                          <span className="text-muted-foreground">Next: {sched.nextRun}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {sched.recipients} recipient{sched.recipients !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Exports History */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'export-animate-in-d3' : 'opacity-0')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-sky-500" />
                Recent Exports
              </CardTitle>
              <Button size="sm" variant="ghost" className="text-[10px] h-6 text-muted-foreground" onClick={() => showToast('Full history opened', 'info')}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Report</th>
                    <th className="text-left py-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider hidden sm:table-cell">Format</th>
                    <th className="text-left py-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Date</th>
                    <th className="text-left py-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Size</th>
                    <th className="text-left py-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Status</th>
                    <th className="text-right py-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {exportHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8">
                        <div className="flex flex-col items-center justify-center text-center">
                          <RefreshCw className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No export history</p>
                          <p className="text-xs text-muted-foreground mt-1">Exported reports will appear here.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    exportHistory.map((entry) => {
                      const fmt = EXPORT_FORMATS.find((f) => f.id === entry.format);
                      const statusCfg = STATUS_STYLES[entry.status];
                      const StatusIcon = statusCfg.icon;
                      return (
                        <tr key={entry.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold truncate max-w-[200px]">{entry.reportName}</p>
                            <p className="text-[10px] text-muted-foreground">by {entry.requestedBy}</p>
                          </td>
                          <td className="py-2.5 px-3 hidden sm:table-cell">
                            <Badge variant="outline" className="text-[9px] h-5 font-mono">
                              {fmt?.extension}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">{entry.date}</td>
                          <td className="py-2.5 px-3 text-muted-foreground tabular-nums hidden md:table-cell">{entry.size}</td>
                          <td className="py-2.5 px-3">
                            <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', statusCfg.bg, statusCfg.color)}>
                              <StatusIcon className="h-3 w-3" />
                              {statusCfg.label}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {entry.status === 'completed' && (
                                <button
                                  className="p-1.5 rounded-md hover:bg-muted/60 transition-colors"
                                  onClick={() => showToast('Download started', 'info')}
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </button>
                              )}
                              <button
                                className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                                onClick={() => showToast('Export deleted', 'info')}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Toast */}
        {toast && (
          <div
            className={cn(
              'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md export-toast-in',
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : toast.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400'
            )}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CircleDot className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
