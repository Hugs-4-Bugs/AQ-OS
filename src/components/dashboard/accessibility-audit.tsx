'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Eye,
  ImageOff,
  Tag as LabelOff,
  Heading,
  Keyboard,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Palette,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════
// Accessibility Audit Component — Developer-only (dev mode only)
// ═══════════════════════════════════════════════════════════════════

interface AuditIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  element: string;
  selector: string;
  description: string;
  recommendation: string;
}

interface AuditResult {
  timestamp: number;
  issues: AuditIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
}

// ─── Audit Functions ─────────────────────────────────────────────

export function checkAltTexts(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const images = document.querySelectorAll('img');

  for (const img of images) {
    const alt = img.getAttribute('alt');
    const src = img.getAttribute('src') || '';
    const selector = buildA11ySelector(img);

    if (alt === null) {
      issues.push({
        severity: 'error',
        category: 'Images',
        element: 'img',
        selector,
        description: `Image missing alt attribute: ${src.slice(0, 50)}`,
        recommendation: 'Add alt text describing the image content, or alt="" for decorative images',
      });
    } else if (alt === '' && img.getAttribute('role') !== 'presentation') {
      issues.push({
        severity: 'warning',
        category: 'Images',
        element: 'img',
        selector,
        description: `Image has empty alt (may be decorative): ${src.slice(0, 50)}`,
        recommendation: 'If decorative, add role="presentation". If meaningful, add descriptive alt text',
      });
    }
  }

  // Check for background images with no accessible text
  const elementsWithBg = document.querySelectorAll('[style*="background-image"]');
  for (const el of elementsWithBg) {
    if (!el.textContent?.trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      issues.push({
        severity: 'warning',
        category: 'Images',
        element: el.tagName.toLowerCase(),
        selector: buildA11ySelector(el),
        description: 'Element with background-image has no accessible text',
        recommendation: 'Add aria-label or visible text describing the background image content',
      });
    }
  }

  return issues;
}

export function checkFormLabels(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const inputs = document.querySelectorAll('input, select, textarea');

  for (const input of inputs) {
    const type = input.getAttribute('type');
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;

    const id = input.getAttribute('id');
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    const title = input.getAttribute('title');
    const placeholder = input.getAttribute('placeholder');
    const selector = buildA11ySelector(input);

    // Check for associated label
    let hasLabel = false;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) hasLabel = true;
    }
    if (ariaLabel || ariaLabelledBy || title) hasLabel = true;

    if (!hasLabel) {
      issues.push({
        severity: 'error',
        category: 'Forms',
        element: input.tagName.toLowerCase(),
        selector,
        description: `Form input missing label: ${id || '(no id)'} type="${type || 'text'}"`,
        recommendation: 'Add a <label> with matching for attribute, or aria-label, or aria-labelledby',
      });
    }

    // Check if placeholder is used as the only label
    if (!hasLabel && placeholder) {
      issues.push({
        severity: 'warning',
        category: 'Forms',
        element: input.tagName.toLowerCase(),
        selector,
        description: `Input relies on placeholder only for labeling: "${placeholder.slice(0, 30)}"`,
        recommendation: 'Placeholder should not replace a visible label; add a proper <label> element',
      });
    }
  }

  // Check for missing aria attributes on custom controls
  const customControls = document.querySelectorAll('[role="button"], [role="tab"], [role="menu"], [role="dialog"]');
  for (const el of customControls) {
    const selector = buildA11ySelector(el);
    const role = el.getAttribute('role');
    const ariaLabel = el.getAttribute('aria-label');
    const ariaLabelledBy = el.getAttribute('aria-labelledby');

    if (!ariaLabel && !ariaLabelledBy && !el.textContent?.trim()) {
      issues.push({
        severity: 'error',
        category: 'ARIA',
        element: el.tagName.toLowerCase(),
        selector,
        description: `Custom control with role="${role}" has no accessible name`,
        recommendation: 'Add aria-label or aria-labelledby to provide an accessible name',
      });
    }
  }

  return issues;
}

export function checkHeadingHierarchy(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

  let lastLevel = 0;
  let h1Count = 0;

  for (const heading of headings) {
    const level = parseInt(heading.tagName[1]);
    const selector = buildA11ySelector(heading);
    const text = heading.textContent?.slice(0, 40) || '';

    if (level === 1) {
      h1Count++;
      if (h1Count > 1) {
        issues.push({
          severity: 'warning',
          category: 'Headings',
          element: heading.tagName.toLowerCase(),
          selector,
          description: `Multiple h1 elements found (${h1Count} so far): "${text}"`,
          recommendation: 'Use only one h1 per page as the primary heading',
        });
      }
    }

    if (lastLevel > 0 && level > lastLevel + 1) {
      issues.push({
        severity: 'error',
        category: 'Headings',
        element: heading.tagName.toLowerCase(),
        selector,
        description: `Skipped heading level: h${lastLevel} → h${level}: "${text}"`,
        recommendation: `Use h${lastLevel + 1} instead of h${level} to maintain hierarchy`,
      });
    }

    lastLevel = level;
  }

  if (h1Count === 0) {
    issues.push({
      severity: 'warning',
      category: 'Headings',
      element: 'page',
      selector: 'body',
      description: 'No h1 element found on the page',
      recommendation: 'Add an h1 as the primary heading for the page',
    });
  }

  return issues;
}

function checkKeyboardNav(): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Check for elements with click handlers but no keyboard support
  const clickableDivs = document.querySelectorAll('div[onclick], span[onclick], [role="button"]:not(button):not(a)');
  for (const el of clickableDivs) {
    const selector = buildA11ySelector(el);
    const tabIndex = el.getAttribute('tabindex');

    if (!tabIndex && !el.hasAttribute('tabindex')) {
      issues.push({
        severity: 'error',
        category: 'Keyboard',
        element: el.tagName.toLowerCase(),
        selector,
        description: 'Clickable element is not keyboard accessible (no tabindex)',
        recommendation: 'Add tabindex="0" and keyboard event handlers (onKeyDown, etc.)',
      });
    }
  }

  // Check for positive tabindex (anti-pattern)
  const positiveTabIndex = document.querySelectorAll('[tabindex]');
  for (const el of positiveTabIndex) {
    const idx = parseInt(el.getAttribute('tabindex') || '0');
    if (idx > 0) {
      issues.push({
        severity: 'warning',
        category: 'Keyboard',
        element: el.tagName.toLowerCase(),
        selector: buildA11ySelector(el),
        description: `Positive tabindex (${idx}) can disrupt tab order`,
        recommendation: 'Use tabindex="0" and manage focus order via DOM structure instead',
      });
    }
  }

  // Check for focus traps
  const focusable = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) {
    issues.push({
      severity: 'warning',
      category: 'Keyboard',
      element: 'page',
      selector: 'body',
      description: 'No focusable elements found on the page',
      recommendation: 'Ensure interactive elements are present and keyboard accessible',
    });
  }

  return issues;
}

function checkColorContrast(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const textElements = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, label, button, td, th, li');

  for (const el of textElements) {
    const style = window.getComputedStyle(el);
    const color = style.color;
    const bgColor = style.backgroundColor;

    // Simplified contrast check — check if text color and background color are too similar
    if (color && bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      const colorLuminance = getRelativeLuminance(color);
      const bgLuminance = getRelativeLuminance(bgColor);
      const contrastRatio = (Math.max(colorLuminance, bgLuminance) + 0.05) / (Math.min(colorLuminance, bgLuminance) + 0.05);

      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight);
      const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
      const minRatio = isLargeText ? 3 : 4.5;

      if (contrastRatio < minRatio) {
        const selector = buildA11ySelector(el);
        // Deduplicate: don't add same selector twice
        if (!issues.some(i => i.selector === selector)) {
          issues.push({
            severity: 'warning',
            category: 'Color Contrast',
            element: el.tagName.toLowerCase(),
            selector,
            description: `Low contrast ratio (${contrastRatio.toFixed(1)}:1, min ${minRatio}:1) — ${color} on ${bgColor}`,
            recommendation: `Increase contrast ratio to at least ${minRatio}:1 for ${isLargeText ? 'large' : 'normal'} text`,
          });
        }
      }
    }

    if (issues.length >= 15) break;
  }

  return issues;
}

function getRelativeLuminance(colorStr: string): number {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return 0.5;
  const [, r, g, b] = match.map(Number);
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function buildA11ySelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.split(/\s+/).filter(c => c && !c.startsWith('css-')).slice(0, 2);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
    if (parts.length >= 3) break;
  }
  return parts.join(' > ');
}

export function runAccessibilityAudit(): AuditResult {
  const allIssues: AuditIssue[] = [
    ...checkAltTexts(),
    ...checkFormLabels(),
    ...checkHeadingHierarchy(),
    ...checkKeyboardNav(),
    ...checkColorContrast(),
  ];

  return {
    timestamp: Date.now(),
    issues: allIssues,
    summary: {
      errors: allIssues.filter(i => i.severity === 'error').length,
      warnings: allIssues.filter(i => i.severity === 'warning').length,
      info: allIssues.filter(i => i.severity === 'info').length,
      total: allIssues.length,
    },
  };
}

// ─── Component ───────────────────────────────────────────────────

export default function AccessibilityAudit() {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const isDev = process.env.NODE_ENV === 'development';

  const runAudit = useCallback(() => {
    setIsRunning(true);
    requestAnimationFrame(() => {
      const auditResult = runAccessibilityAudit();
      setResult(auditResult);
      setIsRunning(false);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Run audit when panel opens — setState only inside rAF callback
    const rafId = requestAnimationFrame(() => {
      setIsRunning(true);
      const auditResult = runAccessibilityAudit();
      setResult(auditResult);
      setIsRunning(false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  if (!isDev) return null;

  const categories = result
    ? ['all', ...Array.from(new Set(result.issues.map(i => i.category)))]
    : ['all'];

  const filteredIssues = result
    ? activeCategory === 'all'
      ? result.issues
      : result.issues.filter(i => i.category === activeCategory)
    : [];

  // Toggle button
  if (!isOpen) {
    return (
      <div className="fixed bottom-16 right-4 z-[9998]">
        <Button
          onClick={() => setIsOpen(true)}
          size="sm"
          variant="outline"
          className={cn(
            'h-10 gap-2 shadow-lg backdrop-blur-sm bg-background/90 border-2',
            result && result.summary.errors > 0
              ? 'border-red-500'
              : result && result.summary.warnings > 0
              ? 'border-amber-500'
              : 'border-emerald-500'
          )}
        >
          <Eye className="h-4 w-4" />
          <span className="text-xs">A11y</span>
          {result && result.summary.total > 0 && (
            <Badge
              variant={result.summary.errors > 0 ? 'destructive' : 'outline'}
              className={cn(
                'h-5 px-1.5 text-[10px]',
                result.summary.errors === 0 && result.summary.warnings > 0 && 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              )}
            >
              {result.summary.total}
            </Badge>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-16 right-4 z-[9998] w-[400px] max-h-[520px]">
      <Card className="shadow-2xl border-2 border-primary/20">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Accessibility Audit
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={runAudit}
                disabled={isRunning}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Summary badges */}
          {result && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {result.summary.errors} errors
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 h-5 px-1.5 text-[10px]">
                {result.summary.warnings} warnings
              </Badge>
              {result.summary.info > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {result.summary.info} info
                </Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <ScrollArea className="max-h-[380px]">
            {/* Category filters */}
            {result && categories.length > 1 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      activeCategory === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {cat === 'all' ? 'All' : cat}
                  </button>
                ))}
              </div>
            )}

            {isRunning ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                <p className="text-xs text-muted-foreground">Running accessibility audit...</p>
              </div>
            ) : result && result.issues.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  No accessibility issues found!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Re-run after changes to re-check
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredIssues.map((issue, i) => (
                  <div
                    key={i}
                    className={cn(
                      'p-2.5 rounded-lg border text-[11px]',
                      issue.severity === 'error'
                        ? 'border-red-500/20 bg-red-500/5'
                        : issue.severity === 'warning'
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : 'border-blue-500/20 bg-blue-500/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {issue.severity === 'error' ? (
                        <ImageOff className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                      ) : issue.category === 'Headings' ? (
                        <Heading className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      ) : issue.category === 'Keyboard' ? (
                        <Keyboard className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      ) : issue.category === 'Color Contrast' ? (
                        <Palette className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      ) : issue.category === 'Forms' ? (
                        <LabelOff className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="outline" className="h-4 px-1 text-[8px] shrink-0">
                            {issue.category}
                          </Badge>
                          <code className="font-mono text-[9px] text-muted-foreground truncate">
                            {issue.selector}
                          </code>
                        </div>
                        <p className="text-[10px] text-foreground/80 mb-1">
                          {issue.description}
                        </p>
                        <p className="text-[9px] text-muted-foreground italic">
                          💡 {issue.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
