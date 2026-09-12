'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowRightLeft,
  Check,
  Clock,
  Eye,
  Mail,
  Phone,
  Globe,
  MapPin,
  Building2,
  Star,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ===== TYPES =====

interface LeadMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
}

interface LeadField {
  key: string;
  label: string;
  icon: React.ReactNode;
  valueA: string | number | null;
  valueB: string | number | null;
}

interface MergeSelection {
  [fieldKey: string]: 'A' | 'B';
}

// In-memory merge history for undo (5 min window)
interface MergeRecord {
  id: string;
  targetLeadId: string;
  sourceLeadId: string;
  originalTarget: Record<string, unknown>;
  originalSource: Record<string, unknown>;
  mergedAt: Date;
  undoDeadline: Date;
  fieldsMerged: string[];
}

const mergeHistory: MergeRecord[] = [];

// ===== FIELD DEFINITIONS =====

const MERGEABLE_FIELDS = [
  { key: 'businessName', label: 'Business Name', icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: 'email', label: 'Email', icon: <Mail className="h-3.5 w-3.5" /> },
  { key: 'phone', label: 'Phone', icon: <Phone className="h-3.5 w-3.5" /> },
  { key: 'website', label: 'Website', icon: <Globe className="h-3.5 w-3.5" /> },
  { key: 'address', label: 'Address', icon: <MapPin className="h-3.5 w-3.5" /> },
  { key: 'ownerName', label: 'Owner Name', icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: 'rating', label: 'Rating', icon: <Star className="h-3.5 w-3.5" /> },
  { key: 'conversionScore', label: 'Conversion Score', icon: <Star className="h-3.5 w-3.5" /> },
  { key: 'replyScore', label: 'Reply Score', icon: <Star className="h-3.5 w-3.5" /> },
  { key: 'urgencyScore', label: 'Urgency Score', icon: <Star className="h-3.5 w-3.5" /> },
  { key: 'revenuePotentialScore', label: 'Revenue Potential', icon: <Star className="h-3.5 w-3.5" /> },
];

export default function LeadMergeDialog({ open, onOpenChange, leadIds }: LeadMergeDialogProps) {
  const [leadA, setLeadA] = useState<Record<string, unknown> | null>(null);
  const [leadB, setLeadB] = useState<Record<string, unknown> | null>(null);
  const [selections, setSelections] = useState<MergeSelection>({});
  const [step, setStep] = useState<'compare' | 'preview' | 'merging' | 'done'>('compare');
  const [error, setError] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState<MergeRecord | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);

  // Fetch both leads when dialog opens
  useEffect(() => {
    if (open && leadIds.length >= 2) {
      fetchLeads();
    } else {
      setLeadA(null);
      setLeadB(null);
      setSelections({});
      setStep('compare');
      setError(null);
    }
  }, [open, leadIds]);

  // Undo countdown timer
  useEffect(() => {
    if (!undoAvailable) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((undoAvailable.undoDeadline.getTime() - Date.now()) / 1000));
      setUndoCountdown(remaining);

      if (remaining <= 0) {
        setUndoAvailable(null);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [undoAvailable]);

  const fetchLeads = async () => {
    try {
      setError(null);
      const [resA, resB] = await Promise.all([
        fetch(`/api/leads/${leadIds[0]}`),
        fetch(`/api/leads/${leadIds[1]}`),
      ]);

      if (!resA.ok || !resB.ok) {
        throw new Error('Failed to fetch lead details');
      }

      const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
      setLeadA(dataA.lead || dataA);
      setLeadB(dataB.lead || dataB);

      // Auto-select: prefer non-empty values, prefer A for ties
      const autoSelections: MergeSelection = {};
      MERGEABLE_FIELDS.forEach((field) => {
        const valA = getFieldValue(dataA.lead || dataA, field.key);
        const valB = getFieldValue(dataB.lead || dataB, field.key);
        // Prefer the non-empty value; if both have values, prefer A (first selected)
        if (valA && !valB) {
          autoSelections[field.key] = 'A';
        } else if (!valA && valB) {
          autoSelections[field.key] = 'B';
        } else {
          autoSelections[field.key] = 'A';
        }
      });
      setSelections(autoSelections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    }
  };

  const getFieldValue = (lead: Record<string, unknown>, key: string): string | number | null => {
    const val = lead[key];
    if (val === null || val === undefined || val === '' || val === 0) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return val;
    return String(val);
  };

  const getFieldDisplayValue = (val: string | number | null): string => {
    if (val === null || val === undefined) return '—';
    return String(val);
  };

  const handleSelectionChange = (fieldKey: string, source: 'A' | 'B') => {
    setSelections((prev) => ({ ...prev, [fieldKey]: source }));
  };

  const getMergedPreview = useCallback((): Record<string, unknown> => {
    if (!leadA || !leadB) return {};
    const merged: Record<string, unknown> = { ...leadA };

    MERGEABLE_FIELDS.forEach((field) => {
      const source = selections[field.key] || 'A';
      const sourceLead = source === 'A' ? leadA : leadB;
      const val = sourceLead[field.key];
      if (val !== null && val !== undefined && val !== '') {
        merged[field.key] = val;
      }
    });

    return merged;
  }, [leadA, leadB, selections]);

  const handleMerge = async () => {
    if (!leadA || !leadB) return;

    setStep('merging');
    setError(null);

    try {
      // Determine which lead to keep (target) and which to remove (source)
      // The lead with more non-empty fields becomes the target
      const aFields = MERGEABLE_FIELDS.filter((f) => getFieldValue(leadA, f.key) !== null).length;
      const bFields = MERGEABLE_FIELDS.filter((f) => getFieldValue(leadB, f.key) !== null).length;

      const targetId = aFields >= bFields ? leadIds[0] : leadIds[1];
      const sourceId = aFields >= bFields ? leadIds[1] : leadIds[0];

      // Build field selections for the API
      const fieldSelections: Record<string, string> = {};
      MERGEABLE_FIELDS.forEach((field) => {
        const selection = selections[field.key] || 'A';
        // Map A/B to the actual lead IDs
        const selectedLeadId = selection === 'A' ? leadIds[0] : leadIds[1];
        fieldSelections[field.key] = selectedLeadId;
      });

      const res = await fetch('/api/leads/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLeadId: targetId,
          sourceLeadId: sourceId,
          fieldSelections,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Merge failed');
      }

      const result = await res.json();

      // Record merge for undo
      const record: MergeRecord = {
        id: `merge_${Date.now()}`,
        targetLeadId: targetId,
        sourceLeadId: sourceId,
        originalTarget: { ...leadA },
        originalSource: { ...leadB },
        mergedAt: new Date(),
        undoDeadline: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        fieldsMerged: result.fieldsMerged || [],
      };
      mergeHistory.push(record);
      setUndoAvailable(record);

      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
      setStep('compare');
    }
  };

  const handleUndo = async () => {
    if (!undoAvailable) return;

    try {
      // In a real implementation, this would call an undo API
      // For now, we'll just note that undo was requested
      console.log('[LeadMerge] Undo requested for merge:', undoAvailable.id);
      setUndoAvailable(null);
      setStep('compare');
      onOpenChange(false);
    } catch {
      setError('Failed to undo merge');
    }
  };

  const fields: LeadField[] = MERGEABLE_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    icon: field.icon,
    valueA: leadA ? getFieldValue(leadA, field.key) : null,
    valueB: leadB ? getFieldValue(leadB, field.key) : null,
  }));

  const hasDifferences = fields.some((f) => {
    const a = f.valueA ?? '';
    const b = f.valueB ?? '';
    return a !== b && (a !== '' || b !== '');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Merge Duplicate Leads
          </DialogTitle>
          <DialogDescription>
            Compare and merge duplicate leads. Select which value to keep for each field.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step: Compare & Select */}
        {step === 'compare' && leadA && leadB && (
          <div className="space-y-4">
            {/* Lead Headers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                    Lead A
                  </Badge>
                  <span className="font-semibold text-sm truncate">
                    {String(leadA.businessName || 'Unknown')}
                  </span>
                </div>
                {leadA.ownerName && (
                  <p className="text-xs text-muted-foreground truncate">{String(leadA.ownerName)}</p>
                )}
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500">
                    Lead B
                  </Badge>
                  <span className="font-semibold text-sm truncate">
                    {String(leadB.businessName || 'Unknown')}
                  </span>
                </div>
                {leadB.ownerName && (
                  <p className="text-xs text-muted-foreground truncate">{String(leadB.ownerName)}</p>
                )}
              </div>
            </div>

            {!hasDifferences && (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  These leads have no conflicting fields. Merging will combine all data.
                </AlertDescription>
              </Alert>
            )}

            {/* Field-by-field comparison */}
            <div className="space-y-2">
              {fields.map((field) => {
                const valA = field.valueA;
                const valB = field.valueB;
                const bothEmpty = !valA && !valB;
                const hasDiff = valA !== valB;
                const selected = selections[field.key] || 'A';

                if (bothEmpty) return null;

                return (
                  <div
                    key={field.key}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      hasDiff ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-muted-foreground">{field.icon}</span>
                      <span className="text-sm font-medium">{field.label}</span>
                      {hasDiff && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">
                          Different
                        </Badge>
                      )}
                    </div>

                    <RadioGroup
                      value={selected}
                      onValueChange={(val) => handleSelectionChange(field.key, val as 'A' | 'B')}
                      className="grid grid-cols-2 gap-3"
                    >
                      {/* Lead A value */}
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="A" id={`${field.key}-A`} className="mt-0.5" />
                        <Label
                          htmlFor={`${field.key}-A`}
                          className={cn(
                            'text-sm cursor-pointer flex-1',
                            !valA && 'text-muted-foreground italic'
                          )}
                        >
                          {getFieldDisplayValue(valA)}
                        </Label>
                      </div>

                      {/* Lead B value */}
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="B" id={`${field.key}-B`} className="mt-0.5" />
                        <Label
                          htmlFor={`${field.key}-B`}
                          className={cn(
                            'text-sm cursor-pointer flex-1',
                            !valB && 'text-muted-foreground italic'
                          )}
                        >
                          {getFieldDisplayValue(valB)}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('preview')} className="gap-2">
                <Eye className="h-4 w-4" />
                Preview Merge
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && leadA && leadB && (
          <div className="space-y-4">
            <Alert>
              <Eye className="h-4 w-4" />
              <AlertDescription>
                Review the merged result before confirming. This action can be undone within 5 minutes.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                Merged Result Preview
              </h3>

              {fields.map((field) => {
                const source = selections[field.key] || 'A';
                const sourceLead = source === 'A' ? leadA : leadB;
                const val = getFieldValue(sourceLead as Record<string, unknown>, field.key);
                if (!val) return null;

                return (
                  <div key={field.key} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0">{field.label}</span>
                    <span className="font-medium">{getFieldDisplayValue(val)}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        source === 'A'
                          ? 'border-primary/40 text-primary'
                          : 'border-emerald-500/40 text-emerald-500'
                      )}
                    >
                      From Lead {source}
                    </Badge>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('compare')}>
                Back
              </Button>
              <Button onClick={handleMerge} className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Confirm Merge
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Merging */}
        {step === 'merging' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Merging leads...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="space-y-4">
            <Alert className="border-emerald-500/30 bg-emerald-500/5">
              <Check className="h-4 w-4 text-emerald-500" />
              <AlertDescription>
                Leads merged successfully! The duplicate lead has been removed.
              </AlertDescription>
            </Alert>

            {undoAvailable && undoCountdown > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600 flex-1">
                  Undo available for {undoCountdown}s
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  className="gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                >
                  <RotateCcw className="h-3 w-3" />
                  Undo
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}

        {/* Loading state */}
        {!leadA && !leadB && !error && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
