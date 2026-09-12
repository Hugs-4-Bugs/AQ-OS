'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded border border-border bg-muted text-[11px] font-mono font-medium text-muted-foreground shadow-sm">
      {children}
    </kbd>
  );
}

interface ShortcutItem {
  keys: React.ReactNode;
  description: string;
}

const NAVIGATION_SHORTCUTS: ShortcutItem[] = [
  { keys: <><Kbd>1</Kbd></>, description: 'Overview tab' },
  { keys: <><Kbd>2</Kbd></>, description: 'Leads tab' },
  { keys: <><Kbd>3</Kbd></>, description: 'Pipeline tab' },
  { keys: <><Kbd>4</Kbd></>, description: 'Discover tab' },
  { keys: <><Kbd>5</Kbd></>, description: 'Outreach tab' },
  { keys: <><Kbd>6</Kbd></>, description: 'Assistant tab' },
  { keys: <><Kbd>7</Kbd></>, description: 'Insights tab' },
  { keys: <><Kbd>8</Kbd></>, description: 'Deals tab' },
  { keys: <><Kbd>9</Kbd></>, description: 'Competitors tab' },
];

const ACTION_SHORTCUTS: ShortcutItem[] = [
  { keys: <><Kbd>⌘</Kbd><Kbd>K</Kbd></>, description: 'Open Command Palette' },
  { keys: <><Kbd>N</Kbd></>, description: 'Create new lead' },
  { keys: <><Kbd>?</Kbd></>, description: 'Show keyboard shortcuts' },
];

export default function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and take actions faster
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Navigation */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Navigation
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {NAVIGATION_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.description}
                  className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm">{shortcut.description}</span>
                  <div className="flex items-center gap-1">{shortcut.keys}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Actions
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {ACTION_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.description}
                  className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm">{shortcut.description}</span>
                  <div className="flex items-center gap-1">{shortcut.keys}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-1">
            Shortcuts are disabled when typing in input fields
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
