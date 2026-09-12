'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Building2,
  Mail,
  Phone,
  Globe,
  Loader2,
  AlertCircle,
  X,
  Keyboard,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/* ── Form field interface ─────────────────────────────────── */
interface FormField {
  key: string;
  label: string;
  placeholder: string;
  type: string;
  icon: React.ElementType;
  required?: boolean;
  validate?: (value: string) => string | undefined;
}

const FIELDS: FormField[] = [
  { key: 'businessName', label: 'Business Name', placeholder: 'e.g., Sunrise Bakery', type: 'text', icon: Building2, required: true },
  { key: 'contactName', label: 'Contact Name', placeholder: 'e.g., John Smith', type: 'text', icon: UserPlus },
  { key: 'email', label: 'Email', placeholder: 'john@example.com', type: 'email', icon: Mail, validate: (v: string) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Invalid email format' : undefined) },
  { key: 'phone', label: 'Phone', placeholder: '+1 (555) 123-4567', type: 'tel', icon: Phone, validate: (v: string) => (v && !/^[\d\s\-+()]+$/.test(v) ? 'Invalid phone format' : undefined) },
  { key: 'website', label: 'Website', placeholder: 'https://example.com', type: 'url', icon: Globe, validate: (v: string) => (v && !/^https?:\/\/.+\..+/.test(v) ? 'Must include https://' : undefined) },
];

/* ── Main Component ─────────────────────────────────────────── */
export default function QuickLeadForm() {
  const { setActiveTab } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input when opened
  useEffect(() => {
    if (isOpen && firstInputRef.current) {
      setTimeout(() => firstInputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Keyboard shortcut: Cmd/Ctrl+N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setErrors({});
          setFormData({});
          setSuccess(false);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    FIELDS.forEach((field) => {
      if (field.required && !formData[field.key]?.trim()) {
        newErrors[field.key] = `${field.label} is required`;
      } else if (field.validate && formData[field.key]?.trim()) {
        const error = field.validate(formData[field.key].trim());
        if (error) newErrors[field.key] = error;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    if (!formData.businessName?.trim()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: formData.businessName.trim(),
          ownerName: formData.contactName?.trim() || undefined,
          email: formData.email?.trim() || undefined,
          phone: formData.phone?.trim() || undefined,
          website: formData.website?.trim() || undefined,
        }),
        credentials: 'include',
      });

      if (response.ok) {
        setSuccess(true);
        setFormData({});
        setTimeout(() => {
          handleClose();
          setSuccess(false);
        }, 1500);
      }
    } catch {
      // Network error — silently ignore
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateForm]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setErrors({});
    setFormData({});
    setSuccess(false);
  }, []);

  const updateField = useCallback((key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [errors]);

  const filledCount = FIELDS.filter((f) => formData[f.key]?.trim()).length;

  return (
    <div ref={formRef}>
      {/* Toggle button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Button
              variant="outline"
              className="w-full justify-between border-primary/20 hover:border-primary/40 active-spring gap-2 h-11"
              onClick={() => setIsOpen(true)}
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Quick Add Lead</span>
              </div>
              <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                <Keyboard className="h-2.5 w-2.5" />
                ⌘N
              </kbd>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="relative rounded-xl overflow-hidden border border-primary/15 bg-white/60 dark:bg-white/5 backdrop-blur-xl shadow-lg">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg p-1.5 bg-gradient-to-br from-primary to-purple-600">
                    <Plus className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm font-bold">Quick Add Lead</span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                    {filledCount}/{FIELDS.length}
                  </Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Success state */}
              {success ? (
                <div className="p-8 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/15 mb-3"
                  >
                    <Plus className="h-6 w-6 text-emerald-500" />
                  </motion.div>
                  <p className="text-sm font-semibold text-emerald-500">Lead created!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Adding to your pipeline...</p>
                </div>
              ) : (
                /* Form fields */
                <div className="p-4 space-y-3 form-group-spacing">
                  {FIELDS.map((field, i) => {
                    const Icon = field.icon;
                    const hasError = !!errors[field.key];
                    const isFirst = i === 0;

                    return (
                      <div key={field.key}>
                        <label className="form-label-styled" htmlFor={`qlf-${field.key}`}>
                          {field.label}
                          {field.required && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        <div className="relative">
                          <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            ref={isFirst ? firstInputRef : undefined}
                            id={`qlf-${field.key}`}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={formData[field.key] ?? ''}
                            onChange={(e) => updateField(field.key, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isSubmitting) handleSubmit();
                            }}
                            className={cn(
                              'pl-9 h-9 text-sm form-input-enhanced',
                              hasError && 'border-red-500 focus:ring-red-500/30 focus:border-red-500'
                            )}
                          />
                          {hasError && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center gap-1 mt-1"
                            >
                              <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                              <span className="text-[11px] text-red-400">{errors[field.key]}</span>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleClose}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5 min-w-[100px]"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !formData.businessName?.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          Add Lead
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
