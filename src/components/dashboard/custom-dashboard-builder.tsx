'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Plus,
  Trash2,
  Save,
  FolderOpen,
  GripVertical,
  BarChart3,
  Table2,
  Clock,
  MapPin,
  Filter,
  Gauge,
  Rss,
  CreditCard,
  ChevronDown,
  Check,
  X,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Copy,
  Eye,
} from 'lucide-react';

/* ===== Types ===== */
type WidgetType = 'kpi' | 'chart' | 'table' | 'timeline' | 'map' | 'funnel' | 'gauge' | 'feed';
type WidgetSize = 'small' | 'medium' | 'large';

interface WidgetDefinition {
  type: WidgetType;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  description: string;
}

interface PlacedWidget {
  id: string;
  type: WidgetType;
  label: string;
  size: WidgetSize;
  row: number;
  col: number;
}

interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  widgetCount: number;
  color: string;
}

/* ===== Constants ===== */
const WIDGET_TYPES: WidgetDefinition[] = [
  { type: 'kpi', label: 'KPI Card', icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-500/10', description: 'Key metric display' },
  { type: 'chart', label: 'Chart', icon: BarChart3, color: 'text-sky-500', bg: 'bg-sky-500/10', description: 'Bar, line, pie charts' },
  { type: 'table', label: 'Table', icon: Table2, color: 'text-violet-500', bg: 'bg-violet-500/10', description: 'Data table view' },
  { type: 'timeline', label: 'Timeline', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', description: 'Event timeline view' },
  { type: 'map', label: 'Map', icon: MapPin, color: 'text-rose-500', bg: 'bg-rose-500/10', description: 'Geographic data map' },
  { type: 'funnel', label: 'Funnel', icon: Filter, color: 'text-orange-500', bg: 'bg-orange-500/10', description: 'Conversion funnel' },
  { type: 'gauge', label: 'Gauge', icon: Gauge, color: 'text-cyan-500', bg: 'bg-cyan-500/10', description: 'Gauge meter display' },
  { type: 'feed', label: 'Feed', icon: Rss, color: 'text-pink-500', bg: 'bg-pink-500/10', description: 'Activity feed stream' },
];

const SIZE_CONFIG: Record<WidgetSize, { cols: number; label: string; icon: React.ElementType }> = {
  small: { cols: 1, label: 'Small', icon: Minimize2 },
  medium: { cols: 2, label: 'Medium', icon: LayoutGrid },
  large: { cols: 2, label: 'Large', icon: Maximize2 },
};

const TEMPLATES: DashboardTemplate[] = [
  { id: 'sales', name: 'Sales Overview', description: 'Revenue, pipeline, and conversion tracking', icon: BarChart3, widgetCount: 6, color: 'text-emerald-500' },
  { id: 'executive', name: 'Executive Brief', description: 'High-level KPIs and team performance', icon: LayoutDashboard, widgetCount: 4, color: 'text-sky-500' },
  { id: 'pipeline', name: 'Pipeline Deep Dive', description: 'Stage analysis and funnel metrics', icon: Filter, widgetCount: 8, color: 'text-violet-500' },
];

const GRID_ROWS = 3;
const GRID_COLS = 3;

/* ===== CSS-in-JS keyframes injected via style tag ===== */
const animationStyles = `
@keyframes builderFadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes builderPulseIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes builderToastSlide {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes builderToastOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(100%); }
}
.builder-animate-in { animation: builderFadeSlideIn 0.5s ease-out both; }
.builder-animate-in-delay-1 { animation: builderFadeSlideIn 0.5s ease-out 0.1s both; }
.builder-animate-in-delay-2 { animation: builderFadeSlideIn 0.5s ease-out 0.2s both; }
.builder-animate-in-delay-3 { animation: builderFadeSlideIn 0.5s ease-out 0.3s both; }
.builder-pulse-in { animation: builderPulseIn 0.3s ease-out both; }
.builder-toast-in { animation: builderToastSlide 0.3s ease-out both; }
.builder-toast-out { animation: builderToastOut 0.3s ease-in both; }
`;

export default function CustomDashboardBuilder() {
  const [widgets, setWidgets] = useState<PlacedWidget[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<WidgetType | null>(null);
  const [selectedSize, setSelectedSize] = useState<WidgetSize>('small');
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [dashboards, setDashboards] = useState<string[]>(['My Dashboard', 'Team Sales View']);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const isCellOccupied = useCallback((row: number, col: number, excludeId?: string) => {
    return widgets.some((w) => {
      if (excludeId && w.id === excludeId) return false;
      const sizeConfig = SIZE_CONFIG[w.size];
      const endCol = w.col + sizeConfig.cols;
      return row === w.row && col >= w.col && col < endCol;
    });
  }, [widgets]);

  const addWidget = useCallback((row: number, col: number) => {
    if (!selectedWidget) return;
    if (isCellOccupied(row, col)) {
      showToast('Cell occupied, choose another spot', 'info');
      return;
    }
    const widgetDef = WIDGET_TYPES.find((w) => w.type === selectedWidget);
    if (!widgetDef) return;

    const colsNeeded = SIZE_CONFIG[selectedSize].cols;
    if (col + colsNeeded > GRID_COLS) {
      showToast('Not enough space for this size', 'info');
      return;
    }

    for (let c = col; c < col + colsNeeded; c++) {
      if (isCellOccupied(row, c)) {
        showToast('Not enough space — overlap detected', 'info');
        return;
      }
    }

    const newWidget: PlacedWidget = {
      id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: selectedWidget,
      label: widgetDef.label,
      size: selectedSize,
      row,
      col,
    };
    setWidgets((prev) => [...prev, newWidget]);
    showToast(`${widgetDef.label} added successfully`);
  }, [selectedWidget, selectedSize, isCellOccupied, showToast]);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    showToast('Widget removed', 'info');
  }, [showToast]);

  const applyTemplate = useCallback((templateId: string) => {
    setActiveTemplate(templateId);
    const templateWidgets = templateId === 'sales'
      ? [
          { type: 'kpi' as WidgetType, label: 'Revenue', size: 'small' as WidgetSize, row: 0, col: 0 },
          { type: 'kpi' as WidgetType, label: 'Deals', size: 'small' as WidgetSize, row: 0, col: 1 },
          { type: 'kpi' as WidgetType, label: 'Pipeline', size: 'small' as WidgetSize, row: 0, col: 2 },
          { type: 'chart' as WidgetType, label: 'Revenue Chart', size: 'large' as WidgetSize, row: 1, col: 0 },
          { type: 'funnel' as WidgetType, label: 'Sales Funnel', size: 'medium' as WidgetSize, row: 2, col: 0 },
          { type: 'table' as WidgetType, label: 'Top Deals', size: 'small' as WidgetSize, row: 2, col: 2 },
        ]
      : templateId === 'executive'
        ? [
            { type: 'kpi' as WidgetType, label: 'MRR', size: 'small' as WidgetSize, row: 0, col: 0 },
            { type: 'kpi' as WidgetType, label: 'ARR', size: 'small' as WidgetSize, row: 0, col: 1 },
            { type: 'chart' as WidgetType, label: 'Team Performance', size: 'large' as WidgetSize, row: 1, col: 0 },
            { type: 'gauge' as WidgetType, label: 'Goal Progress', size: 'small' as WidgetSize, row: 2, col: 0 },
          ]
        : [
            { type: 'funnel' as WidgetType, label: 'Pipeline Funnel', size: 'large' as WidgetSize, row: 0, col: 0 },
            { type: 'chart' as WidgetType, label: 'Stage Distribution', size: 'medium' as WidgetSize, row: 0, col: 2 },
            { type: 'timeline' as WidgetType, label: 'Deal Timeline', size: 'large' as WidgetSize, row: 1, col: 0 },
            { type: 'table' as WidgetType, label: 'Pipeline Table', size: 'medium' as WidgetSize, row: 1, col: 2 },
            { type: 'gauge' as WidgetType, label: 'Velocity', size: 'small' as WidgetSize, row: 2, col: 0 },
            { type: 'kpi' as WidgetType, label: 'Avg Deal Size', size: 'small' as WidgetSize, row: 2, col: 1 },
            { type: 'feed' as WidgetType, label: 'Recent Activity', size: 'small' as WidgetSize, row: 2, col: 2 },
          ];

    const placed = templateWidgets.map((w) => ({
      ...w,
      id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }));
    setWidgets(placed);
    showToast(`${TEMPLATES.find((t) => t.id === templateId)?.name} template applied`);
  }, [showToast]);

  const saveDashboard = useCallback(() => {
    showToast('Dashboard saved successfully!');
  }, [showToast]);

  const getWidgetDef = (type: WidgetType) => WIDGET_TYPES.find((w) => w.type === type);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'builder-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-purple-600">
                  <LayoutDashboard className="h-4 w-4 text-white" />
                </div>
                Custom Dashboard Builder
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => setPreviewMode(!previewMode)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {previewMode ? 'Edit Mode' : 'Preview'}
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => showToast('Open dashboard dialog', 'info')}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open
                </Button>
                <Button size="sm" className="text-xs gap-1.5" onClick={saveDashboard}>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{widgets.length}</span> widget{widgets.length !== 1 ? 's' : ''} placed
              {activeTemplate && (
                <>
                  <span className="text-border">|</span>
                  <Badge variant="outline" className="text-[10px] h-5">
                    Template: {TEMPLATES.find((t) => t.id === activeTemplate)?.name}
                  </Badge>
                </>
              )}
              {dashboards.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  <span>{dashboards.length} saved dashboard{dashboards.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Widget Palette */}
          {!previewMode && (
            <div className={cn('lg:col-span-3', mounted ? 'builder-animate-in-delay-1' : 'opacity-0')}>
              <Card className="glass-card overflow-hidden h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    Widget Palette
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Widget type selector */}
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Select Widget</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {WIDGET_TYPES.map((w) => {
                        const Icon = w.icon;
                        const isSelected = selectedWidget === w.type;
                        return (
                          <button
                            key={w.type}
                            onClick={() => setSelectedWidget(isSelected ? null : w.type)}
                            className={cn(
                              'flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-center transition-all duration-200 cursor-pointer',
                              isSelected
                                ? 'border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20'
                                : 'border-border/50 hover:border-border hover:bg-muted/30'
                            )}
                          >
                            <Icon className={cn('h-4 w-4', isSelected ? w.color : 'text-muted-foreground')} />
                            <span className={cn('text-[10px] font-semibold leading-tight', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                              {w.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Size selector */}
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Widget Size</p>
                    <div className="flex gap-1.5">
                      {(Object.keys(SIZE_CONFIG) as WidgetSize[]).map((size) => {
                        const cfg = SIZE_CONFIG[size];
                        const Icon = cfg.icon;
                        const isSelected = selectedSize === size;
                        return (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all duration-200 cursor-pointer',
                              isSelected
                                ? 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/20'
                                : 'border-border/50 text-muted-foreground hover:border-border hover:bg-muted/30'
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {selectedSize === 'small' && '1×1 grid cell'}
                      {selectedSize === 'medium' && '2×1 grid cells'}
                      {selectedSize === 'large' && '2×2 grid cells'}
                    </p>
                  </div>

                  {/* Template selector */}
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Templates</p>
                    <div className="space-y-1.5">
                      {TEMPLATES.map((tpl) => {
                        const Icon = tpl.icon;
                        const isActive = activeTemplate === tpl.id;
                        return (
                          <button
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl.id)}
                            className={cn(
                              'w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer',
                              isActive
                                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                                : 'border-border/50 hover:border-border hover:bg-muted/30'
                            )}
                          >
                            <div className="rounded-md p-1.5 bg-muted/50">
                              <Icon className={cn('h-4 w-4', tpl.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{tpl.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{tpl.description}</p>
                            </div>
                            {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Saved dashboards */}
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Saved Dashboards</p>
                    <div className="space-y-1">
                      {dashboards.map((name) => (
                        <div
                          key={name}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/40 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">{name}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-1 rounded hover:bg-muted/60 transition-colors" title="Load">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button className="p-1 rounded hover:bg-red-500/10 transition-colors" title="Delete">
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Canvas area */}
          <div className={cn(previewMode ? 'lg:col-span-12' : 'lg:col-span-9', mounted ? 'builder-animate-in-delay-2' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-violet-500" />
                    Dashboard Canvas
                  </CardTitle>
                  {!previewMode && (
                    <div className="flex items-center gap-2">
                      {widgets.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7"
                          onClick={() => { setWidgets([]); setActiveTemplate(null); showToast('Canvas cleared', 'info'); }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Clear All
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border-2 border-dashed border-border/60 p-3 bg-muted/10">
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                      gridTemplateRows: `repeat(${GRID_ROWS}, minmax(100px, auto))`,
                    }}
                  >
                    {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, idx) => {
                      const row = Math.floor(idx / GRID_COLS);
                      const col = idx % GRID_COLS;
                      const widget = widgets.find((w) => {
                        const sizeConfig = SIZE_CONFIG[w.size];
                        const isRow = w.row === row;
                        const isCol = col >= w.col && col < w.col + sizeConfig.cols;
                        return isRow && isCol && (col === w.col || SIZE_CONFIG[w.size].cols > 1);
                      });
                      const isOccupied = widget && widget.col === col;

                      if (widget && isOccupied) {
                        const widgetDef = getWidgetDef(widget.type);
                        if (!widgetDef) return null;
                        const Icon = widgetDef.icon;
                        const sizeConfig = SIZE_CONFIG[widget.size];
                        const colSpan = sizeConfig.cols;
                        const rowSpan = widget.size === 'large' ? 2 : 1;

                        return (
                          <div
                            key={widget.id}
                            className={cn(
                              'relative rounded-lg border border-primary/30 bg-primary/5 p-3 flex flex-col gap-2 builder-pulse-in',
                              'transition-all duration-200 hover:shadow-md hover:border-primary/50 group',
                              previewMode && 'hover:scale-[1.01]'
                            )}
                            style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={cn('rounded-md p-1.5', widgetDef.bg)}>
                                  <Icon className={cn('h-4 w-4', widgetDef.color)} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold">{widget.label}</p>
                                  <p className="text-[9px] text-muted-foreground">{sizeConfig.label} — {widgetDef.description}</p>
                                </div>
                              </div>
                              {!previewMode && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    className="p-1 rounded hover:bg-red-500/10 transition-colors"
                                    onClick={() => removeWidget(widget.id)}
                                    title="Remove widget"
                                  >
                                    <X className="h-3.5 w-3.5 text-red-400" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* Mock content area */}
                            <div className="flex-1 rounded bg-background/40 border border-border/30 flex items-center justify-center min-h-[60px]">
                              <div className="flex items-center gap-1.5 text-muted-foreground/50">
                                <Icon className="h-6 w-6" />
                                <span className="text-[10px]">Preview</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[8px] h-4 px-1.5">{widget.type}</Badge>
                              <Badge variant="outline" className="text-[8px] h-4 px-1.5">{sizeConfig.label}</Badge>
                              {!previewMode && (
                                <span className="text-[8px] text-muted-foreground ml-auto">Row {widget.row + 1}, Col {widget.col + 1}</span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Skip cells that are part of a multi-col widget but not the first col
                      const isPartOfWidget = widgets.some((w) => {
                        const sizeConfig = SIZE_CONFIG[w.size];
                        return w.row === row && col > w.col && col < w.col + sizeConfig.cols;
                      });
                      if (isPartOfWidget) return null;

                      // Skip cells part of large widget row 2
                      const isPartOfLargeWidget = widgets.some((w) => {
                        return w.size === 'large' && row === w.row + 1 && col >= w.col && col < w.col + SIZE_CONFIG[w.size].cols;
                      });
                      if (isPartOfLargeWidget) return null;

                      return (
                        <button
                          key={`cell-${row}-${col}`}
                          onClick={() => !previewMode && addWidget(row, col)}
                          disabled={!selectedWidget || previewMode}
                          className={cn(
                            'rounded-lg border-2 border-dashed min-h-[100px] flex flex-col items-center justify-center gap-2 transition-all duration-200',
                            selectedWidget && !previewMode
                              ? 'border-primary/30 hover:border-primary/60 hover:bg-primary/5 cursor-pointer'
                              : 'border-border/40 cursor-default'
                          )}
                        >
                          {selectedWidget && !previewMode ? (
                            <>
                              <Plus className="h-5 w-5 text-primary/50" />
                              <span className="text-[10px] text-muted-foreground font-medium">
                                Add {WIDGET_TYPES.find((w) => w.type === selectedWidget)?.label}
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="h-5 w-5 rounded border border-border/30" />
                              <span className="text-[10px] text-muted-foreground/60">Empty</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Instructions when canvas is empty */}
                {widgets.length === 0 && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {selectedWidget
                        ? 'Click on a grid cell to place your widget'
                        : 'Select a widget type from the palette, then click a cell to place it'}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Or choose a template to get started quickly
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Toast notification */}
        {toast && (
          <div
            className={cn(
              'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md',
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400',
              toast.type === 'success' ? 'builder-toast-in' : 'builder-toast-in'
            )}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <Gauge className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
