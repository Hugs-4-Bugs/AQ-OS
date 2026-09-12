'use client';

import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  UserCircle,
  Mail,
  Phone,
  Globe,
  MapPin,
  Tag,
  Plus,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { createLead } from '@/lib/api';
import { STAGE_ORDER, STAGE_LABELS, NICHE_OPTIONS, COUNTRY_OPTIONS, type LeadStage } from '@/lib/types';
import { toast } from 'sonner';

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormData {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  linkedin: string;
  instagram: string;
  facebook: string;
  niche: string;
  city: string;
  country: string;
  stage: string;
  notes: string;
  tags: string;
}

const INITIAL_FORM: FormData = {
  businessName: '',
  ownerName: '',
  email: '',
  phone: '',
  whatsapp: '',
  website: '',
  linkedin: '',
  instagram: '',
  facebook: '',
  niche: '',
  city: '',
  country: '',
  stage: 'discovered',
  notes: '',
  tags: '',
};

export default function CreateLeadDialog({ open, onOpenChange }: CreateLeadDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.businessName.trim()) {
      toast.error('Business name is required');
      return;
    }

    setCreating(true);
    try {
      const data: Record<string, unknown> = {
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        website: form.website.trim() || undefined,
        linkedin: form.linkedin.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        facebook: form.facebook.trim() || undefined,
        niche: form.niche || undefined,
        city: form.city.trim() || undefined,
        country: form.country || undefined,
        stage: form.stage,
        notes: form.notes.trim() || undefined,
        tags: form.tags.trim() ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };

      await createLead(data as Parameters<typeof createLead>[0]);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead created successfully');
      setForm(INITIAL_FORM);
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create lead');
    } finally {
      setCreating(false);
    }
  }, [form, queryClient, onOpenChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => setForm(INITIAL_FORM), 200);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Add New Lead
          </DialogTitle>
          <DialogDescription>
            Manually create a new lead entry. Required fields are marked with *.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Business Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Business Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium flex items-center gap-1">
                  Business Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={form.businessName}
                  onChange={(e) => updateField('businessName', e.target.value)}
                  placeholder="e.g. Acme Dental Clinic"
                  className="border-primary/20 focus-visible:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Owner Name</label>
                <Input
                  value={form.ownerName}
                  onChange={(e) => updateField('ownerName', e.target.value)}
                  placeholder="Contact person name"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Niche
                </label>
                <Select value={form.niche} onValueChange={(v) => updateField('niche', v)}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue placeholder="Select niche" />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Contact Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Contact Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Phone</label>
                <Input
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">WhatsApp</label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => updateField('whatsapp', e.target.value)}
                  placeholder="WhatsApp number"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Website</label>
                <Input
                  value={form.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="example.com"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Social Links */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Social Links
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">LinkedIn</label>
                <Input
                  value={form.linkedin}
                  onChange={(e) => updateField('linkedin', e.target.value)}
                  placeholder="linkedin.com/in/..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Instagram</label>
                <Input
                  value={form.instagram}
                  onChange={(e) => updateField('instagram', e.target.value)}
                  placeholder="@handle or URL"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Facebook</label>
                <Input
                  value={form.facebook}
                  onChange={(e) => updateField('facebook', e.target.value)}
                  placeholder="facebook.com/..."
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Location & Stage */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Location & Pipeline Stage
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">City</label>
                <Input
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="City"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Country</label>
                <Select value={form.country} onValueChange={(v) => updateField('country', v)}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Stage</label>
                <Select value={form.stage} onValueChange={(v) => updateField('stage', v)}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_ORDER.map((stage) => (
                      <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Notes & Tags */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Notes & Tags
            </h4>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Any additional notes about this lead..."
                className="min-h-[80px] border-primary/20 focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Tags (comma separated)</label>
              <Input
                value={form.tags}
                onChange={(e) => updateField('tags', e.target.value)}
                placeholder="e.g. Hot Lead, VIP, Follow-up"
                className="border-primary/20 focus-visible:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.businessName.trim() || creating}
            className="bg-primary hover:bg-primary/90 gap-2"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create Lead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
