'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Keyboard Shortcuts Help Dialog
// Phase 14.8: Comprehensive shortcuts with accessible descriptions
// ═══════════════════════════════════════════════════════════════════

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Kbd({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded border border-border bg-muted text-[11px] font-mono font-medium text-muted-foreground shadow-sm ${wide ? 'min-w-8' : ''}`}
    >
      {children}
    </kbd>
  );
}

interface ShortcutItem {
  keys: React.ReactNode;
  description: string;
  accessibleDescription: string;
}

// ─── Shortcut Definitions ─────────────────────────────────────────

const GLOBAL_SHORTCUTS: ShortcutItem[] = [
  {
    keys: <><Kbd wide>⌘</Kbd><Kbd>K</Kbd></>,
    description: 'Command Palette',
    accessibleDescription: 'Command+K or Control+K to open command palette',
  },
  {
    keys: <><Kbd wide>⌘</Kbd><Kbd>N</Kbd></>,
    description: 'New Lead',
    accessibleDescription: 'Command+N or Control+N to create a new lead',
  },
  {
    keys: <><Kbd>Esc</Kbd></>,
    description: 'Close modal / dialog',
    accessibleDescription: 'Escape to close current modal or dialog',
  },
  {
    keys: <><Kbd>?</Kbd></>,
    description: 'Show shortcuts',
    accessibleDescription: 'Question mark to show keyboard shortcuts',
  },
  {
    keys: <><Kbd wide>Ctrl</Kbd><Kbd wide>Shift</Kbd><Kbd>A</Kbd></>,
    description: 'Accessibility audit',
    accessibleDescription: 'Control+Shift+A to toggle accessibility audit panel',
  },
];

const NAVIGATION_SHORTCUTS: ShortcutItem[] = [
  { keys: <><Kbd>1</Kbd></>, description: 'Overview tab', accessibleDescription: 'Press 1 for Overview tab' },
  { keys: <><Kbd>2</Kbd></>, description: 'Leads tab', accessibleDescription: 'Press 2 for Leads tab' },
  { keys: <><Kbd>3</Kbd></>, description: 'Pipeline tab', accessibleDescription: 'Press 3 for Pipeline tab' },
  { keys: <><Kbd>4</Kbd></>, description: 'Discover tab', accessibleDescription: 'Press 4 for Discover tab' },
  { keys: <><Kbd>5</Kbd></>, description: 'Outreach tab', accessibleDescription: 'Press 5 for Outreach tab' },
  { keys: <><Kbd>6</Kbd></>, description: 'Assistant tab', accessibleDescription: 'Press 6 for Assistant tab' },
  { keys: <><Kbd>7</Kbd></>, description: 'Insights tab', accessibleDescription: 'Press 7 for Insights tab' },
  { keys: <><Kbd>8</Kbd></>, description: 'Deals tab', accessibleDescription: 'Press 8 for Deals tab' },
  { keys: <><Kbd>9</Kbd></>, description: 'Competitors tab', accessibleDescription: 'Press 9 for Competitors tab' },
  {
    keys: <><Kbd>J</Kbd></>,
    description: 'Next lead in list',
    accessibleDescription: 'Press J to navigate to next lead in the list',
  },
  {
    keys: <><Kbd>K</Kbd></>,
    description: 'Previous lead in list',
    accessibleDescription: 'Press K to navigate to previous lead in the list',
  },
];

const ACTION_SHORTCUTS: ShortcutItem[] = [
  {
    keys: <><Kbd>E</Kbd></>,
    description: 'Enrich selected lead',
    accessibleDescription: 'Press E to enrich the selected lead with AI data',
  },
  {
    keys: <><Kbd>S</Kbd></>,
    description: 'Score selected lead',
    accessibleDescription: 'Press S to score the selected lead',
  },
  {
    keys: <><Kbd>G</Kbd></>,
    description: 'Generate outreach',
    accessibleDescription: 'Press G to generate outreach message for the selected lead',
  },
  {
    keys: <><Kbd>N</Kbd></>,
    description: 'Create new lead',
    accessibleDescription: 'Press N to create a new lead',
  },
  {
    keys: <><Kbd>D</Kbd></>,
    description: 'Delete / archive lead',
    accessibleDescription: 'Press D to delete or archive the selected lead',
  },
  {
    keys: <><Kbd>F</Kbd></>,
    description: 'Focus search',
    accessibleDescription: 'Press F to focus the search input',
  },
];

// ─── Component ────────────────────────────────────────────────────

export default function KeyboardShortcutsHelp({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-label="Keyboard Shortcuts Help">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Keyboard Shortcuts
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">?</Badge>
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and take actions faster.
            Shortcuts are disabled when typing in input fields.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-5 pr-2">
            {/* Global Shortcuts */}
            <ShortcutSection title="Global" shortcuts={GLOBAL_SHORTCUTS} />

            <Separator />

            {/* Navigation */}
            <ShortcutSection title="Navigation" shortcuts={NAVIGATION_SHORTCUTS} />

            <Separator />

            {/* Actions */}
            <ShortcutSection title="Actions" shortcuts={ACTION_SHORTCUTS} />

            <Separator />

            {/* Tips */}
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Tips:</strong> Use <Kbd>Tab</Kbd> and <Kbd>Shift</Kbd>+<Kbd>Tab</Kbd> to navigate between elements.
                Use <Kbd>Enter</Kbd> or <Kbd>Space</Kbd> to activate buttons and links.
                Use <Kbd>Esc</Kbd> to close dialogs and modals.
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shortcut Section Sub-component ───────────────────────────────

function ShortcutSection({ title, shortcuts }: { title: string; shortcuts: ShortcutItem[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-1.5" role="list" aria-label={`${title} shortcuts`}>
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.description}
            className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-muted/50 transition-colors"
            role="listitem"
            aria-label={shortcut.accessibleDescription}
          >
            <span className="text-sm">{shortcut.description}</span>
            <div className="flex items-center gap-1">{shortcut.keys}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
