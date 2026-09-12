'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranchPlus, List, History, LayoutTemplate, AlertTriangle, BarChart3, Hammer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import WorkflowList from './workflow-list';
import WorkflowBuilder from './workflow-builder';
import WorkflowExecutionHistory from './workflow-execution-history';
import WorkflowTemplates from './workflow-templates';
import WorkflowDeadLetter from './workflow-dead-letter';
import WorkflowMetrics from './workflow-metrics';

// ─── Local types (mirrors workflow domain models) ───────────────

interface Workflow {
  id?: string;
  name?: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  nodes?: unknown[];
  edges?: unknown[];
  [key: string]: unknown;
}

interface WorkflowTemplate {
  id?: string;
  name: string;
  description?: string;
  triggerType: string;
  nodes?: unknown[];
  edges?: unknown[];
  templateCategory?: string;
  [key: string]: unknown;
}

type WorkflowSubTab = 'workflows' | 'builder' | 'history' | 'templates' | 'dead_letter' | 'metrics';

const SUB_TABS: { id: WorkflowSubTab; label: string; icon: React.ElementType; shortLabel?: string }[] = [
  { id: 'workflows', label: 'Workflows', icon: List, shortLabel: 'List' },
  { id: 'builder', label: 'Builder', icon: Hammer, shortLabel: 'Build' },
  { id: 'history', label: 'History', icon: History, shortLabel: 'Log' },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, shortLabel: 'Tmpl' },
  { id: 'dead_letter', label: 'Dead Letter', icon: AlertTriangle, shortLabel: 'DLQ' },
  { id: 'metrics', label: 'Metrics', icon: BarChart3, shortLabel: 'Data' },
];

export default function WorkflowTab() {
  const [activeSubTab, setActiveSubTab] = useState<WorkflowSubTab>('workflows');
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [isNewWorkflow, setIsNewWorkflow] = useState(false);

  const handleNewWorkflow = useCallback(() => {
    setEditingWorkflow(null);
    setIsNewWorkflow(true);
    setActiveSubTab('builder');
  }, []);

  const handleEditWorkflow = useCallback((workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setIsNewWorkflow(false);
    setActiveSubTab('builder');
  }, []);

  const handleEditTemplate = useCallback((template: WorkflowTemplate & { id?: string }) => {
    // Convert template to Workflow shape for the builder
    const workflow: Workflow = {
      id: template.id || '',
      userId: '',
      name: template.name,
      description: template.description,
      status: 'draft',
      triggerType: template.triggerType,
      triggerConfig: {},
      nodes: template.nodes || [],
      edges: template.edges || [],
      version: 1,
      isTemplate: true,
      templateCategory: template.templateCategory,
      maxConcurrency: 1,
      timeoutMs: 300000,
      maxRetries: 3,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      avgRuntimeMs: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingWorkflow(workflow);
    setIsNewWorkflow(false);
    setActiveSubTab('builder');
  }, []);

  const handleBuilderBack = useCallback(() => {
    setEditingWorkflow(null);
    setIsNewWorkflow(false);
    setActiveSubTab('workflows');
  }, []);

  const renderSubTab = () => {
    switch (activeSubTab) {
      case 'workflows':
        return <WorkflowList onNewWorkflow={handleNewWorkflow} onEditWorkflow={handleEditWorkflow} />;
      case 'builder':
        return (
          <WorkflowBuilder
            open
            onOpenChange={(nextOpen) => {
              if (!nextOpen) handleBuilderBack();
            }}
          />
        );
      case 'history':
        return <WorkflowExecutionHistory />;
      case 'templates':
        return <WorkflowTemplates onUseTemplate={handleEditWorkflow} onEditTemplate={handleEditTemplate} />;
      case 'dead_letter':
        return <WorkflowDeadLetter />;
      case 'metrics':
        return <WorkflowMetrics />;
      default:
        return <WorkflowList onNewWorkflow={handleNewWorkflow} onEditWorkflow={handleEditWorkflow} />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur-md px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <GitBranchPlus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Workflow Automation</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">Build, monitor, and manage automated workflows</p>
            </div>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex gap-1 overflow-x-auto pb-0 -mb-px scrollbar-hide">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors',
                  isActive
                    ? 'bg-background text-emerald-600 dark:text-emerald-400 border border-b-background border-x-border border-t-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="workflow-subtab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {renderSubTab()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
