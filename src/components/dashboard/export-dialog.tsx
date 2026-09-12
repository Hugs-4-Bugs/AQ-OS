'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  FileText,
  FileJson,
  Table,
  CheckSquare,
  Square,
  Loader2,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  type ExportFormat,
  type ColumnDef,
  type EntityType,
  getColumnDefs,
  generateFilename,
  getFormatDescription,
  getFormatExtension,
  resolveColumnValue,
  exportData,
  type ProgressCallback,
} from '@/lib/data-export';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Props ──────────────────────────────────────────────────────

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataType: EntityType;
  data: Record<string, any>[];
  totalCount: number;
  filteredCount?: number;
}

// ─── Format option metadata ────────────────────────────────────

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof FileText; color: string }[] = [
  { value: 'csv', label: 'CSV', icon: Table, color: 'text-emerald-400' },
  { value: 'json', label: 'JSON', icon: FileJson, color: 'text-blue-400' },
  { value: 'tsv', label: 'TSV (Excel)', icon: FileText, color: 'text-amber-400' },
];

// ─── Export Scope ───────────────────────────────────────────────

type ExportScope = 'current' | 'all' | 'filtered';

// ─── Component ─────────────────────────────────────────────────

export default function ExportDialog({
  open,
  onOpenChange,
  dataType,
  data,
  totalCount,
  filteredCount,
}: ExportDialogProps) {
  const allColumns = useMemo(() => getColumnDefs(dataType), [dataType]);

  // State
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(allColumns.map((c) => c.key))
  );
  const [scope, setScope] = useState<ExportScope>('all');
  const [filename, setFilename] = useState(() =>
    generateFilename(dataType, getFormatExtension('csv'))
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Keep filename extension in sync with format
  const handleFormatChange = useCallback((newFormat: ExportFormat) => {
    setFormat(newFormat);
    setFilename((prev) => {
      const base = prev.replace(/\.[^.]+$/, '');
      return `${base}.${getFormatExtension(newFormat)}`;
    });
  }, []);

  // Column selection helpers
  const toggleColumn = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(allColumns.map((c) => c.key)));
  }, [allColumns]);

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  // Active columns (filtered by selection)
  const activeColumns = useMemo(
    () => allColumns.filter((c) => selectedKeys.has(c.key)),
    [allColumns, selectedKeys]
  );

  // Resolve export data based on scope
  const exportDataRows = useMemo(() => {
    switch (scope) {
      case 'current':
        return data;
      case 'filtered':
        return filteredCount != null ? data : data;
      case 'all':
        return data;
      default:
        return data;
    }
  }, [data, scope, filteredCount]);

  // Preview: first 3 rows of active columns
  const previewRows = useMemo(() => exportDataRows.slice(0, 3), [exportDataRows]);

  // Row count label
  const rowCountLabel = useMemo(() => {
    switch (scope) {
      case 'current':
        return `${exportDataRows.length} row${exportDataRows.length !== 1 ? 's' : ''} (current page)`;
      case 'filtered':
        return `${filteredCount ?? exportDataRows.length} rows (filtered)`;
      case 'all':
        return `${totalCount} rows (all)`;
      default:
        return `${exportDataRows.length} rows`;
    }
  }, [scope, exportDataRows.length, filteredCount, totalCount]);

  // Progress callback
  const onProgress: ProgressCallback = useCallback(({ percent }) => {
    setExportProgress(percent);
  }, []);

  // Perform export
  const handleExport = useCallback(() => {
    if (activeColumns.length === 0) {
      toast.error('Select at least one column to export');
      return;
    }
    if (exportDataRows.length === 0) {
      toast.error('No data to export');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    // Use a short timeout to let the UI update before the heavy work
    requestAnimationFrame(() => {
      try {
        exportData(format, exportDataRows, activeColumns, filename, onProgress);
        toast.success(`Exported ${exportDataRows.length} ${dataType} as ${format.toUpperCase()}`);
        onOpenChange(false);
      } catch (err) {
        toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsExporting(false);
        setExportProgress(0);
      }
    });
  }, [activeColumns, exportDataRows, format, filename, onProgress, dataType, onOpenChange]);

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setSelectedKeys(new Set(allColumns.map((c) => c.key)));
        setScope('all');
        setFormat('csv');
        setFilename(generateFilename(dataType, 'csv'));
        setExportProgress(0);
        setIsExporting(false);
      }
      onOpenChange(newOpen);
    },
    [allColumns, dataType, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-xl bg-background/80 border-primary/20 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold gradient-text">
            <Download className="h-5 w-5 text-primary" />
            Export {dataType.charAt(0).toUpperCase() + dataType.slice(1)}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Configure your export format, columns, and scope.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 py-4">
            {/* ── Format Selector ── */}
            <div className="space-y-2.5">
              <Label className="text-sm font-semibold text-foreground/90">Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(val) => handleFormatChange(val as ExportFormat)}
                className="grid grid-cols-3 gap-2"
              >
                {FORMAT_OPTIONS.map(({ value, label, icon: Icon, color }) => (
                  <Label
                    key={value}
                    htmlFor={`format-${value}`}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-all',
                      'hover:border-primary/40 hover:bg-primary/5',
                      format === value
                        ? 'border-primary/50 bg-primary/10 shadow-sm'
                        : 'border-border bg-muted/30'
                    )}
                  >
                    <RadioGroupItem value={value} id={`format-${value}`} className="sr-only" />
                    <Icon className={cn('h-5 w-5', format === value ? color : 'text-muted-foreground')} />
                    <span className={cn('text-xs font-medium', format === value ? 'text-foreground' : 'text-muted-foreground')}>
                      {label}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>{getFormatDescription(format)}</p>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* ── Export Scope ── */}
            <div className="space-y-2.5">
              <Label className="text-sm font-semibold text-foreground/90">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ExportScope)}>
                <SelectTrigger className="h-9 border-primary/20 hover:border-primary/40 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    Current page ({exportDataRows.length} rows)
                  </SelectItem>
                  <SelectItem value="filtered">
                    Filtered results ({filteredCount ?? data.length} rows)
                  </SelectItem>
                  <SelectItem value="all">
                    All results ({totalCount} rows)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{rowCountLabel}</p>
            </div>

            <Separator className="bg-border/50" />

            {/* ── Column Picker ── */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-foreground/90">
                  Columns
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                    {activeColumns.length} / {allColumns.length}
                  </Badge>
                </Label>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectAll}>
                    <CheckSquare className="h-3 w-3" /> All
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={deselectAll}>
                    <Square className="h-3 w-3" /> None
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-[180px] overflow-y-auto custom-scrollbar rounded-md border border-border/50 p-2 bg-muted/20">
                {allColumns.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-muted/60 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedKeys.has(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                      className="translate-y-[1px]"
                    />
                    <span className="text-xs truncate">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* ── Filename ── */}
            <div className="space-y-2">
              <Label htmlFor="export-filename" className="text-sm font-semibold text-foreground/90">
                Filename
              </Label>
              <Input
                id="export-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="h-9 border-primary/20 focus-visible:ring-primary/30 font-mono text-sm"
              />
            </div>

            <Separator className="bg-border/50" />

            {/* ── Preview ── */}
            {activeColumns.length > 0 && previewRows.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground/90">
                  Preview
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    (first {previewRows.length} rows)
                  </span>
                </Label>
                <div className="rounded-lg border border-border/50 overflow-hidden bg-muted/20">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 border-b border-border/50">
                          {activeColumns.map((col) => (
                            <th
                              key={col.key}
                              className="px-3 py-2 text-left font-semibold text-foreground/80 whitespace-nowrap"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-border/30 last:border-0">
                            {activeColumns.map((col) => (
                              <td
                                key={col.key}
                                className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[200px] truncate"
                              >
                                {resolveColumnValue(row, col) || (
                                  <span className="text-muted-foreground/50 italic">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer ── */}
        <div className="pt-3 border-t border-border/50 space-y-3">
          {/* Progress bar */}
          {isExporting && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Exporting...</span>
                <span>{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} className="h-1.5" />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isExporting}
              className="border-primary/20 hover:border-primary/40"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isExporting || activeColumns.length === 0 || exportDataRows.length === 0}
              className="gap-1.5 min-w-[120px]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export {dataType}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
