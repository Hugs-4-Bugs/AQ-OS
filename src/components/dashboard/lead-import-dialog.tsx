'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileUp,
  Download,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Lead } from '@/lib/types';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  success: boolean;
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

export default function ImportLeadsDialog({ open, onOpenChange }: ImportLeadsDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [csvData, setCsvData] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<Partial<Lead>[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setCsvData('');
    setParseErrors([]);
    setPreviewData([]);
    setImportProgress(0);
    setImportResults(null);
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      const text = await file.text();
      setFileName(file.name);
      setCsvData(text);

      // Parse preview (first 5 lines)
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        setParseErrors(['CSV file appears empty or has no data rows']);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const previewRows: Partial<Lead>[] = [];

      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        previewRows.push({
          businessName: row['Business Name'] || row['businessName'] || row['name'] || '',
          ownerName: row['Owner'] || row['ownerName'] || '',
          niche: row['Niche'] || row['niche'] || '',
          country: row['Country'] || row['country'] || '',
          city: row['City'] || row['city'] || '',
          email: row['Email'] || row['email'] || '',
          phone: row['Phone'] || row['phone'] || '',
        });
      }

      setPreviewData(previewRows);
      setStep('preview');
    } catch {
      toast.error('Failed to read the CSV file');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!csvData) return;

    setStep('importing');
    setImportProgress(10);

    try {
      const formData = new FormData();
      const blob = new Blob([csvData], { type: 'text/csv' });
      formData.append('file', blob, fileName);

      setImportProgress(30);

      const res = await fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      });

      setImportProgress(80);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Import failed');
      }

      const result = await res.json();
      setImportProgress(100);

      setImportResults({
        success: result.success ?? true,
        total: result.total ?? 0,
        imported: result.imported ?? result.total ?? 0,
        duplicates: result.duplicates ?? 0,
        failed: result.failed ?? result.errors?.length ?? 0,
        errors: result.errors ?? [],
      });

      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      setImportResults({
        success: false,
        total: 0,
        imported: 0,
        duplicates: 0,
        failed: 0,
        errors: [{ row: 0, message: error instanceof Error ? error.message : 'Import failed' }],
      });
      setStep('complete');
    }
  }, [csvData, fileName, queryClient]);

  const handleDownloadTemplate = useCallback(() => {
    const headers = 'Business Name,Owner Name,Niche,Country,City,Email,Phone,WhatsApp,Website,LinkedIn,Instagram,Facebook,Notes,Tags\n';
    const example = 'Acme Dental Clinic,Dr. John Smith,Dental,USA,New York,john@acme.com,+1 555 123 4567,+1 555 123 4567,acme-dental.com,linkedin.com/company/acme,@acmedental,facebook.com/acmedental,High value lead interested in digital marketing,Hot Lead;VIP\n';
    const blob = new Blob([headers + example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lead-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(reset, 200);
  }, [onOpenChange, reset]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            Import Leads from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file with your lead data. We&apos;ll handle deduplication automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200',
                'hover:border-primary/50 hover:bg-primary/5',
                isDragOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/25'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleInputChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  'flex items-center justify-center h-12 w-12 rounded-xl transition-colors',
                  isDragOver ? 'bg-primary/20' : 'bg-muted'
                )}>
                  <Upload className={cn('h-6 w-6', isDragOver ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {isDragOver ? 'Drop your CSV file here' : 'Drag & drop a CSV file here'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse · .csv files only
                  </p>
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 w-full"
              onClick={handleDownloadTemplate}
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV Template
            </Button>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">{previewData.length}+ rows found</p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="text-xs">Change file</Button>
            </div>

            {previewData.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Preview (first {previewData.length} rows)</p>
                <ScrollArea className="max-h-48">
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left p-2 font-medium">Business Name</th>
                          <th className="text-left p-2 font-medium">Niche</th>
                          <th className="text-left p-2 font-medium">Country</th>
                          <th className="text-left p-2 font-medium">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((lead, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2 font-medium truncate max-w-[140px]">{lead.businessName || '—'}</td>
                            <td className="p-2 text-muted-foreground">{lead.niche || '—'}</td>
                            <td className="p-2 text-muted-foreground">{lead.country || '—'}</td>
                            <td className="p-2 text-muted-foreground truncate max-w-[120px]">{lead.email || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} className="bg-primary hover:bg-primary/90 gap-2">
                <Upload className="h-4 w-4" />
                Import Leads
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Importing leads...</span>
            </div>
            <Progress value={importProgress} />
            <p className="text-xs text-center text-muted-foreground">
              Please wait while leads are being imported and deduplicated
            </p>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && importResults && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              {importResults.failed === 0 && importResults.success ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Import {importResults.success ? 'Complete' : 'Failed'}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    {importResults.imported} imported
                  </span>
                  {importResults.duplicates > 0 && (
                    <span className="text-xs flex items-center gap-1">
                      <Badge variant="outline" className="h-4 text-[9px] px-1">Duplicates</Badge>
                      {importResults.duplicates} skipped
                    </span>
                  )}
                  {importResults.failed > 0 && (
                    <span className="text-xs flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      {importResults.failed} failed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <ScrollArea className="max-h-28">
                <div className="space-y-0.5">
                  {importResults.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              </ScrollArea>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleClose} className="bg-primary hover:bg-primary/90">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
