'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Monitor, Smartphone, Tablet, AlertTriangle, ChevronDown, ChevronUp, X, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════
// Responsive Audit Utility — Developer-only component
// Only visible in dev mode or with ?audit=true query param
// ═══════════════════════════════════════════════════════════════════

interface BreakpointInfo {
  width: number;
  label: string;
  icon: React.ElementType;
}

const BREAKPOINTS: BreakpointInfo[] = [
  { width: 320, label: 'XS Mobile', icon: Smartphone },
  { width: 375, label: 'Mobile', icon: Smartphone },
  { width: 425, label: 'Large Mobile', icon: Smartphone },
  { width: 768, label: 'Tablet', icon: Tablet },
  { width: 1024, label: 'Laptop', icon: Monitor },
  { width: 1280, label: 'Desktop', icon: Monitor },
  { width: 1440, label: 'Large Desktop', icon: Monitor },
  { width: 1920, label: 'Full HD', icon: Monitor },
  { width: 2560, label: '4K', icon: Monitor },
];

interface OverflowIssue {
  element: string;
  selector: string;
  overflowWidth: number;
  elementWidth: number;
}

interface TouchTargetIssue {
  element: string;
  selector: string;
  width: number;
  height: number;
}

interface TruncationIssue {
  element: string;
  selector: string;
  text: string;
  scrollWidth: number;
  clientWidth: number;
}

interface AuditWarnings {
  horizontalOverflow: OverflowIssue[];
  smallTouchTargets: TouchTargetIssue[];
  textTruncation: TruncationIssue[];
}

function getCurrentBreakpoint(viewportWidth: number): BreakpointInfo | undefined {
  let current: BreakpointInfo | undefined;
  for (const bp of BREAKPOINTS) {
    if (viewportWidth >= bp.width) {
      current = bp;
    }
  }
  return current;
}

function detectOverflowIssues(): OverflowIssue[] {
  const issues: OverflowIssue[] = [];
  const allElements = document.querySelectorAll('*');
  const bodyWidth = document.documentElement.clientWidth;

  for (const el of allElements) {
    const rect = el.getBoundingClientRect();
    if (rect.width > bodyWidth + 2) {
      const tag = el.tagName.toLowerCase();
      const selector = buildSelector(el);
      issues.push({
        element: tag,
        selector,
        overflowWidth: Math.round(rect.width),
        elementWidth: Math.round(rect.right - rect.left),
      });
    }
    if (issues.length >= 20) break; // Limit to 20 issues
  }
  return issues;
}

function detectSmallTouchTargets(): TouchTargetIssue[] {
  const issues: TouchTargetIssue[] = [];
  const interactiveElements = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [tabindex]');
  const MIN_TOUCH_SIZE = 44;

  for (const el of interactiveElements) {
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_TOUCH_SIZE || rect.height < MIN_TOUCH_SIZE) {
      const tag = el.tagName.toLowerCase();
      const selector = buildSelector(el);
      issues.push({
        element: tag,
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
    if (issues.length >= 20) break;
  }
  return issues;
}

function detectTextTruncation(): TruncationIssue[] {
  const issues: TruncationIssue[] = [];
  const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, td, th, li, a, label');

  for (const el of textElements) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.slice(0, 50) || '';
      const selector = buildSelector(el);
      issues.push({
        element: tag,
        selector,
        text,
        scrollWidth: Math.round(el.scrollWidth),
        clientWidth: Math.round(el.clientWidth),
      });
    }
    if (issues.length >= 20) break;
  }
  return issues;
}

function buildSelector(el: Element): string {
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

function useIsDevMode(): boolean {
  const [isDev] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isDevMode = process.env.NODE_ENV === 'development';
    const params = new URLSearchParams(window.location.search);
    const auditParam = params.get('audit');
    return isDevMode || auditParam === 'true';
  });

  return isDev;
}

export default function ResponsiveAudit() {
  const isDev = useIsDevMode();
  const [isOpen, setIsOpen] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));
  const [warnings, setWarnings] = useState<AuditWarnings>({
    horizontalOverflow: [],
    smallTouchTargets: [],
    textTruncation: [],
  });
  const [isRunning, setIsRunning] = useState(false);
  const rafRef = useRef<number>(0);

  const runAudit = useCallback(() => {
    setIsRunning(true);
    // Use requestAnimationFrame to ensure DOM is stable
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const horizontalOverflow = detectOverflowIssues();
      const smallTouchTargets = detectSmallTouchTargets();
      const textTruncation = detectTextTruncation();
      setWarnings({ horizontalOverflow, smallTouchTargets, textTruncation });
      setIsRunning(false);
    });
  }, []);

  useEffect(() => {
    if (!isDev) return;

    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDev]);

  useEffect(() => {
    if (!isDev || !isOpen) return;

    // Run audit on open and on resize — all setState calls happen inside rAF callback
    const doAudit = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setIsRunning(true);
        const horizontalOverflow = detectOverflowIssues();
        const smallTouchTargets = detectSmallTouchTargets();
        const textTruncation = detectTextTruncation();
        setWarnings({ horizontalOverflow, smallTouchTargets, textTruncation });
        setIsRunning(false);
      });
    };
    doAudit();
    window.addEventListener('resize', doAudit);
    return () => {
      window.removeEventListener('resize', doAudit);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isDev, isOpen]);

  if (!isDev) return null;

  const currentBp = getCurrentBreakpoint(viewportSize.width);
  const totalIssues = warnings.horizontalOverflow.length + warnings.smallTouchTargets.length + warnings.textTruncation.length;
  const CurrentBpIcon = currentBp?.icon || Monitor;

  // Toggle button — bottom-right corner
  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999]">
        <Button
          onClick={() => setIsOpen(true)}
          size="sm"
          variant="outline"
          className={cn(
            'h-10 gap-2 shadow-lg backdrop-blur-sm bg-background/90 border-2',
            totalIssues > 0 ? 'border-amber-500' : 'border-emerald-500'
          )}
        >
          <Eye className="h-4 w-4" />
          <span className="text-xs font-mono">{viewportSize.width}×{viewportSize.height}</span>
          {totalIssues > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
              {totalIssues}
            </Badge>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[380px] max-h-[520px]">
      <Card className="shadow-2xl border-2 border-primary/20">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              Responsive Audit
              {totalIssues > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {totalIssues} issues
                </Badge>
              )}
              {totalIssues === 0 && (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 h-5 px-1.5 text-[10px]">
                  Pass
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={runAudit}
                disabled={isRunning}
              >
                <Eye className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')} />
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
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <ScrollArea className="max-h-[420px]">
            <div className="space-y-3">
              {/* Current Viewport */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <CurrentBpIcon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs font-semibold">{currentBp?.label || 'Unknown'}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {viewportSize.width} × {viewportSize.height}px
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  ≥{currentBp?.width}px
                </Badge>
              </div>

              {/* Breakpoint Map */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Breakpoints
                </p>
                <div className="flex flex-wrap gap-1">
                  {BREAKPOINTS.map((bp) => {
                    const isActive = viewportSize.width >= bp.width;
                    const isCurrent = currentBp?.width === bp.width;
                    return (
                      <div
                        key={bp.width}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors',
                          isCurrent
                            ? 'bg-primary text-primary-foreground font-bold'
                            : isActive
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {bp.width}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Horizontal Overflow */}
              {warnings.horizontalOverflow.length > 0 && (
                <WarningSection
                  title="Horizontal Overflow"
                  icon={AlertTriangle}
                  count={warnings.horizontalOverflow.length}
                  variant="destructive"
                >
                  {warnings.horizontalOverflow.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] py-1 border-b last:border-0">
                      <code className="text-amber-600 dark:text-amber-400 font-mono bg-amber-500/10 px-1 rounded truncate max-w-[140px]">
                        {issue.selector}
                      </code>
                      <span className="text-muted-foreground">
                        {issue.overflowWidth}px wide
                      </span>
                    </div>
                  ))}
                </WarningSection>
              )}

              {/* Small Touch Targets */}
              {warnings.smallTouchTargets.length > 0 && (
                <WarningSection
                  title="Small Touch Targets (<44px)"
                  icon={Smartphone}
                  count={warnings.smallTouchTargets.length}
                  variant="warning"
                >
                  {warnings.smallTouchTargets.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] py-1 border-b last:border-0">
                      <code className="text-amber-600 dark:text-amber-400 font-mono bg-amber-500/10 px-1 rounded truncate max-w-[140px]">
                        {issue.selector}
                      </code>
                      <span className="text-muted-foreground">
                        {issue.width}×{issue.height}px
                      </span>
                    </div>
                  ))}
                </WarningSection>
              )}

              {/* Text Truncation */}
              {warnings.textTruncation.length > 0 && (
                <WarningSection
                  title="Text Truncation Issues"
                  icon={AlertTriangle}
                  count={warnings.textTruncation.length}
                  variant="warning"
                >
                  {warnings.textTruncation.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] py-1 border-b last:border-0">
                      <code className="text-amber-600 dark:text-amber-400 font-mono bg-amber-500/10 px-1 rounded truncate max-w-[100px]">
                        {issue.selector}
                      </code>
                      <span className="text-muted-foreground truncate max-w-[120px]">
                        &ldquo;{issue.text}&rdquo;
                      </span>
                    </div>
                  ))}
                </WarningSection>
              )}

              {/* No issues */}
              {totalIssues === 0 && (
                <div className="text-center py-4">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ No responsive issues detected
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Resize the viewport and re-run to check at different widths
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function WarningSection({
  title,
  icon: Icon,
  count,
  variant,
  children,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  variant: 'destructive' | 'warning';
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-1.5">
          <Icon className={cn('h-3 w-3', variant === 'destructive' ? 'text-red-500' : 'text-amber-500')} />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          <Badge
            variant={variant === 'destructive' ? 'destructive' : 'outline'}
            className={cn(
              'h-4 px-1 text-[8px]',
              variant === 'warning' && 'bg-amber-500/10 text-amber-600 border-amber-500/20'
            )}
          >
            {count}
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="pl-1">{children}</div>}
    </div>
  );
}
