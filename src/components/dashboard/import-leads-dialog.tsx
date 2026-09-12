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
import { createLead } from '@/lib/api';
import { parseCSVLeads, readCSVFile } from '@/lib/import';
import type { Lead } from '@/lib/types';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportLeadsDialog({ open, onOpenChange }: ImportLeadsDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedLeads, setParsedLeads] = useState<Partial<Lead>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState({ success: 0, errors: 0, errorMessages: [] as string[] });
  const [isDragOver, setIsDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setParsedLeads([]);
    setParseErrors([]);
    setImportProgress({ current: 0, total: 0 });
    setImportResults({ success: 0, errors: 0, errorMessages: [] });
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      const text = await readCSVFile(file);
      const { leads, errors } = parseCSVLeads(text);

      setFileName(file.name);
      setParsedLeads(leads);
      setParseErrors(errors);
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
    // Reset input so re-selecting the same file works
    e.target.value = '';
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (parsedLeads.length === 0) return;

    setStep('importing');
    setImportProgress({ current: 0, total: parsedLeads.length });

    let success = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (let i = 0; i < parsedLeads.length; i++) {
      const lead = parsedLeads[i];
      try {
        await createLead({
          businessName: lead.businessName!,
          ownerName: lead.ownerName,
          niche: lead.niche,
          country: lead.country,
          city: lead.city,
          email: lead.email,
          phone: lead.phone,
          website: lead.website,
          notes: lead.notes,
        });
        success++;
      } catch {
        errors++;
        errorMessages.push(`Row ${i + 1}: ${lead.businessName}`);
      }
      setImportProgress({ current: i + 1, total: parsedLeads.length });
    }

    setImportResults({ success, errors, errorMessages });
    setStep('complete');
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  }, [parsedLeads, queryClient]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Delay reset so dialog close animation plays
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
            Upload a CSV file with columns: Business Name, Owner, Niche, Country, City, Email, Phone, Website, Notes
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200',
              'hover:border-primary/50 hover:bg-primary/5',
              isDragOver
                ? 'border-primary bg-primary/10'
                : 'border-muted-foreground/25'
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
                  or click to browse &middot; .csv files only
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {parsedLeads.length} lead{parsedLeads.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-xs"
              >
                Change file
              </Button>
            </div>

            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {parseErrors.length} parsing error{parseErrors.length !== 1 ? 's' : ''}
                </p>
                <ScrollArea className="max-h-20">
                  <div className="space-y-0.5">
                    {parseErrors.map((err, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{err}</p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Preview table (first 5 rows) */}
            {parsedLeads.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Preview (first {Math.min(5, parsedLeads.length)} of {parsedLeads.length})
                </p>
                <ScrollArea className="max-h-48">
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left p-2 font-medium">Business Name</th>
                          <th className="text-left p-2 font-medium">Owner</th>
                          <th className="text-left p-2 font-medium">Niche</th>
                          <th className="text-left p-2 font-medium">Country</th>
                          <th className="text-left p-2 font-medium">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedLeads.slice(0, 5).map((lead, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2 font-medium truncate max-w-[140px]">{lead.businessName}</td>
                            <td className="p-2 text-muted-foreground truncate max-w-[100px]">{lead.ownerName || '—'}</td>
                            <td className="p-2 text-muted-foreground">
                              {lead.niche ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{lead.niche}</Badge> : '—'}
                            </td>
                            <td className="p-2 text-muted-foreground truncate">{lead.country || '—'}</td>
                            <td className="p-2 text-muted-foreground truncate max-w-[120px]">{lead.email || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Import button */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={parsedLeads.length === 0}
                className="bg-primary hover:bg-primary/90"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import {parsedLeads.length} Lead{parsedLeads.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">
                Importing {importProgress.current} of {importProgress.total}...
              </span>
            </div>
            <Progress value={(importProgress.current / importProgress.total) * 100} />
            <p className="text-xs text-center text-muted-foreground">
              Please wait while leads are being created
            </p>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              {importResults.errors === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Import {importResults.errors === 0 ? 'Complete' : 'Completed with Errors'}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    {importResults.success} succeeded
                  </span>
                  {importResults.errors > 0 && (
                    <span className="text-xs flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      {importResults.errors} failed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error details */}
            {importResults.errorMessages.length > 0 && (
              <ScrollArea className="max-h-28">
                <div className="space-y-0.5">
                  {importResults.errorMessages.map((msg, i) => (
                    <p key={i} className="text-xs text-destructive">{msg}</p>
                  ))}
                </div>
              </ScrollArea>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleClose} className="bg-primary hover:bg-primary/90">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
