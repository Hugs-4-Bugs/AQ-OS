'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}

export function ResponsiveTable({ children, className, minWidth = '600px' }: ResponsiveTableProps) {
  return (
    <div className={cn('table-responsive', className)} style={{ '--table-min-width': minWidth } as React.CSSProperties}>
      {children}
    </div>
  );
}

interface ResponsiveCardGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

export function ResponsiveCardGrid({ children, className, columns = { sm: 1, md: 2, lg: 3, xl: 4 } }: ResponsiveCardGridProps) {
  const colsClass = cn(
    'grid gap-4',
    columns.sm === 1 && 'grid-cols-1',
    columns.sm === 2 && 'grid-cols-2',
    columns.md === 2 && 'sm:grid-cols-2',
    columns.md === 3 && 'sm:grid-cols-3',
    columns.lg === 3 && 'lg:grid-cols-3',
    columns.lg === 4 && 'lg:grid-cols-4',
    columns.xl === 4 && 'xl:grid-cols-4',
    columns.xl === 5 && 'xl:grid-cols-5',
  );

  return (
    <div className={cn(colsClass, className)}>
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {Icon && (
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      )}
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {description && <p className="text-xs text-muted-foreground max-w-sm">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold truncate">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
