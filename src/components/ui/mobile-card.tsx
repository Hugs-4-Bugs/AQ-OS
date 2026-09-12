'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface MobileCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  highlight?: boolean;
}

export function MobileCard({ children, className, onClick, highlight }: MobileCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 sm:p-4 transition-all duration-200',
        onClick && 'cursor-pointer hover:bg-accent/50 active:scale-[0.99]',
        highlight && 'border-primary/30 bg-primary/5',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {children}
    </div>
  );
}

interface MobileCardRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function MobileCardRow({ label, value, className }: MobileCardRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right truncate">{value}</span>
    </div>
  );
}
