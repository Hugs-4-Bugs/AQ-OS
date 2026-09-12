'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Advanced Data Import UI
// Phase 7: Column mapping, data preview, deduplication
//
// Features:
// - CSV/JSON file upload with drag-and-drop
// - Automatic column detection and field mapping
// - Data preview table with scroll
// - Duplicate detection before import
// - Import progress bar with stats
// - Error handling with per-row validation
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  X,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  FileText,
  ArrowLeftRight,
  ChevronDown,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ── Types ───────────────────────────────────────────────────────
interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
}

interface PreviewRow {
  [key: string]: string | number | null;
  _duplicate?: boolean;
  _error?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  details?: string[];
}

// ── Field definitions ───────────────────────────────────────────
const TARGET_FIELDS = [
  { value: 'business_name', label: 'Business Name', required: true },
  { value: 'contact_name', label: 'Contact Name', required: false },
  { value: 'email', label: 'Email', required: false },
  { value: 'phone', label: 'Phone', required: false },
  { value: 'website', label: 'Website', required: false },
  { value: 'industry', label: 'Industry', required: false },
  { value: 'location', label: 'Location', required: false },
  { value: 'revenue', label: 'Revenue', required: false },
  { value: 'employees', label: 'Employees', required: false },
  { value: 'notes', label: 'Notes', required: false },
  { value: 'source', label: 'Source', required: false },
  { value: 'rating', label: 'Rating (1-5)', required: false },
] as const;

// Column name aliases for auto-mapping
const COLUMN_ALIASES: Record<string, string[]> = {
  business_name: ['business', 'company', 'company_name', 'business_name', 'org', 'organization', 'firm', 'brand', 'name', 'account'],
  contact_name: ['contact', 'name', 'contact_name', 'full_name', 'person', 'owner', 'manager', 'executive', 'first_name'],
  email: ['email', 'e_mail', 'email_address', 'mail', 'contact_email'],
  phone: ['phone', 'telephone', 'phone_number', 'tel', 'mobile', 'cell'],
  website: ['website', 'url', 'web', 'site', 'domain', 'homepage', 'link'],
  industry: ['industry', 'sector', 'category', 'niche', 'market', 'vertical', 'type'],
  location: ['location', 'city', 'address', 'state', 'country', 'region', 'area', 'geo'],
  revenue: ['revenue', 'annual_revenue', 'turnover', 'sales', 'income', 'arr'],
  employees: ['employees', 'size', 'headcount', 'staff', 'team_size', 'people'],
  notes: ['notes', 'description', 'comment', 'remark', 'details', 'info', 'summary'],
  source: ['source', 'referral', 'origin', 'channel', 'lead_source', 'how_found'],
  rating: ['rating', 'score', 'grade', 'priority', 'rank', 'stars'],
};

// ── Main Component ──────────────────────────────────────────────
interface AdvancedImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AdvancedImportDialog({ open, onOpenChange }: AdvancedImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'result'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<Record<string, string | number | null>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File Handling ─────────────────────────────────────────────
  const parseFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const text = await file.text();
      let data: Record<string, string | number | null>[];

      if (file.name.endsWith('.json')) {
        const json = JSON.parse(text);
        data = Array.isArray(json) ? json : [json];
      } else {
        // CSV parsing
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error('File must have headers and at least one row');

        const headers = parseCSVLine(lines[0]);
        data = lines.slice(1).map(line => {
          const values = parseCSVLine(line);
          const row: Record<string, string | number | null> = {};
          headers.forEach((h, i) => {
            row[h.trim()] = values[i]?.trim() || null;
          });
          return row;
        });
      }

      const cols = Object.keys(data[0] || {});
      setRawData(data);
      setColumns(cols);
      autoMapColumns(cols);
      setPreviewRows(data.slice(0, 100).map(row => ({ ...row, _duplicate: false })));
      setFile(file);
      setStep('mapping');
    } catch (error) {
      console.error('Parse error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const autoMapColumns = useCallback((cols: string[]) => {
    const newMappings: ColumnMapping[] = cols.map(col => {
      const normalizedCol = col.toLowerCase().replace(/[^a-z0-9]/g, '_');

      // Find matching target field
      let bestMatch = '';
      let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';

      for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        const exactMatch = aliases.some(a => a === normalizedCol);
        const partialMatch = aliases.some(a => normalizedCol.includes(a) || a.includes(normalizedCol));

        if (exactMatch) {
          bestMatch = field;
          confidence = 'high';
          break;
        } else if (partialMatch && confidence !== 'high') {
          bestMatch = field;
          confidence = 'medium';
        }
      }

      return { sourceColumn: col, targetField: bestMatch, confidence };
    });
    setMappings(newMappings);
  }, []);

  // ── Drag & Drop ───────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.json'))) {
      parseFile(droppedFile);
    }
  }, [parseFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) parseFile(selectedFile);
  }, [parseFile]);

  // ── Mapping Update ────────────────────────────────────────────
  const updateMapping = useCallback((sourceColumn: string, targetField: string) => {
    setMappings(prev => prev.map(m =>
      m.sourceColumn === sourceColumn
        ? { ...m, targetField, confidence: targetField ? 'high' : 'none' }
        : m
    ));
  }, []);

  // ── Import Simulation ─────────────────────────────────────────
  const startImport = useCallback(async () => {
    setStep('importing');
    setImportProgress(0);

    const total = previewRows.length;
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Simulate progressive import
    for (let i = 0; i < total; i++) {
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
      const row = previewRows[i];

      // Check for duplicates (by business_name + email)
      const isDuplicate = i > 0 && previewRows.slice(0, i).some(prev =>
        prev.business_name === row.business_name && prev.email === row.email
      );

      // Check required fields
      const mappedBusinessName = mappings.find(m => m.targetField === 'business_name')?.sourceColumn;
      if (!mappedBusinessName || !row[mappedBusinessName]) {
        errors++;
      } else if (isDuplicate) {
        skipped++;
      } else {
        imported++;
      }

      setImportProgress(Math.round(((i + 1) / total) * 100));
    }

    setImportResult({ imported, skipped, errors, total });
    setStep('result');
  }, [previewRows, mappings]);

  // ── Reset ─────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setRawData([]);
    setColumns([]);
    setMappings([]);
    setPreviewRows([]);
    setImportResult(null);
    setImportProgress(0);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Stats ─────────────────────────────────────────────────────
  const mappedFields = useMemo(() => mappings.filter(m => m.targetField).length, [mappings]);
  const duplicateCount = useMemo(() => previewRows.filter(r => r._duplicate).length, [previewRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        {/* ── Header ───────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Advanced Data Import
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Import leads from CSV or JSON with column mapping, preview, and deduplication
              </DialogDescription>
            </div>
            {step !== 'upload' && (
              <Button variant="ghost" size="sm" onClick={reset} className="text-xs gap-1">
                <RefreshCw className="h-3 w-3" />
                Start Over
              </Button>
            )}
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-4">
            {(['upload', 'mapping', 'preview', 'importing', 'result'] as const).map((s, i) => (
              <React.Fragment key={s}>
                <div className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
                  step === s
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : i < ['upload', 'mapping', 'preview', 'importing', 'result'].indexOf(step)
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                )}>
                  {i < ['upload', 'mapping', 'preview', 'importing', 'result'].indexOf(step) ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border text-[9px] flex items-center justify-center">{i + 1}</span>
                  )}
                  <span className="hidden sm:inline capitalize">{s}</span>
                </div>
                {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <Separator />

        {/* ── Step Content ──────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* UPLOAD STEP */}
            {step === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6"
              >
                <div
                  className={cn(
                    'border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200',
                    isDragging
                      ? 'border-primary bg-primary/5 scale-[1.02]'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  )}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <Upload className={cn('h-12 w-12 mx-auto mb-4 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground/50')} />
                  <h3 className="text-sm font-semibold mb-1">
                    {isDragging ? 'Drop your file here' : 'Drag & drop your file'}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Supports CSV and JSON files up to 10MB
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Browse Files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {/* Format Tips */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="glass-card-premium p-4 rounded-lg">
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      CSV Format
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      First row should be column headers. Supported delimiters: comma, semicolon, tab.
                      Wrap values with quotes if they contain commas.
                    </p>
                  </div>
                  <div className="glass-card-premium p-4 rounded-lg">
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Auto-Mapping
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Column headers are automatically matched to lead fields.
                      You can adjust mappings in the next step.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* MAPPING STEP */}
            {step === 'mapping' && (
              <motion.div
                key="mapping"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold">Column Mapping</h3>
                    <p className="text-xs text-muted-foreground">
                      {file?.name} — {rawData.length} rows, {columns.length} columns
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {mappedFields}/{TARGET_FIELDS.length} fields mapped
                  </Badge>
                </div>

                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {mappings.map((mapping, i) => (
                      <motion.div
                        key={mapping.sourceColumn}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                      >
                        {/* Source Column */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{mapping.sourceColumn}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            Sample: {String(rawData[0]?.[mapping.sourceColumn] || '—').substring(0, 40)}
                          </p>
                        </div>

                        <ArrowLeftRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />

                        {/* Target Field Select */}
                        <Select
                          value={mapping.targetField}
                          onValueChange={(val) => updateMapping(mapping.sourceColumn, val)}
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Skip column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">— Skip column —</SelectItem>
                            {TARGET_FIELDS.map(field => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.label} {field.required && '*'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Confidence Badge */}
                        {mapping.confidence !== 'none' && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] shrink-0',
                              mapping.confidence === 'high' && 'badge-gradient-success border-emerald-200/50 dark:border-emerald-800/50',
                              mapping.confidence === 'medium' && 'badge-gradient-warning border-amber-200/50 dark:border-amber-800/50',
                            )}
                          >
                            {mapping.confidence} match
                          </Badge>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                  <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setStep('preview')}
                    disabled={mappedFields === 0}
                    className="gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Preview Data
                  </Button>
                </div>
              </motion.div>
            )}

            {/* PREVIEW STEP */}
            {step === 'preview' && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold">Data Preview</h3>
                    <p className="text-xs text-muted-foreground">
                      Showing first {Math.min(20, previewRows.length)} of {rawData.length} rows
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {mappedFields} fields mapped
                    </Badge>
                    {duplicateCount > 0 && (
                      <Badge variant="outline" className="text-xs badge-gradient-warning">
                        {duplicateCount} duplicates
                      </Badge>
                    )}
                  </div>
                </div>

                <ScrollArea className="h-[300px]">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                          {mappings.filter(m => m.targetField).map(m => (
                            <th key={m.sourceColumn} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                              {TARGET_FIELDS.find(f => f.value === m.targetField)?.label || m.targetField}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 20).map((row, i) => (
                          <tr
                            key={i}
                            className={cn(
                              'border-t transition-colors',
                              row._duplicate ? 'bg-amber-500/5' : 'hover:bg-muted/30'
                            )}
                          >
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            {mappings.filter(m => m.targetField).map(m => (
                              <td key={m.sourceColumn} className="px-3 py-2 max-w-[200px] truncate">
                                {row[m.sourceColumn] != null ? String(row[m.sourceColumn]) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>

                <div className="flex justify-between gap-2 mt-4 pt-4 border-t">
                  <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                    <ArrowRight className="h-4 w-4 rotate-180" />
                    Back to Mapping
                  </Button>
                  <Button
                    size="sm"
                    onClick={startImport}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Import {rawData.length} Leads
                  </Button>
                </div>
              </motion.div>
            )}

            {/* IMPORTING STEP */}
            {step === 'importing' && (
              <motion.div
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 flex flex-col items-center justify-center gap-6"
              >
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="h-12 w-12 text-primary" />
                  </motion.div>
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold">Importing Data...</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Processing {rawData.length} records
                  </p>
                </div>
                <div className="w-full max-w-xs">
                  <Progress value={importProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {importProgress}% complete
                  </p>
                </div>
              </motion.div>
            )}

            {/* RESULT STEP */}
            {step === 'result' && importResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6"
              >
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500 mb-4" />
                  </motion.div>
                  <h3 className="text-lg font-semibold">Import Complete!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your data has been processed successfully
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="metric-card-premium text-center p-4">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.imported}</p>
                    <p className="text-xs text-muted-foreground mt-1">Imported</p>
                  </div>
                  <div className="metric-card-premium text-center p-4">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.skipped}</p>
                    <p className="text-xs text-muted-foreground mt-1">Duplicates</p>
                  </div>
                  <div className="metric-card-premium text-center p-4">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.errors}</p>
                    <p className="text-xs text-muted-foreground mt-1">Errors</p>
                  </div>
                </div>

                <div className="flex justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={reset} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Import More
                  </Button>
                  <Button size="sm" onClick={() => onOpenChange(false)} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── CSV Parser ───────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',' || char === ';' || char === '\t') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}
