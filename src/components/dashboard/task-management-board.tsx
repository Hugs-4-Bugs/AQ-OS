'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Plus,
  ChevronDown,
  User,
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight,
  ListTodo,
  Filter,
  LayoutGrid,
  Tag,
} from 'lucide-react';

/* ===== Types ===== */
type TaskPriority = 'high' | 'medium' | 'low';
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
type FilterPriority = 'all' | 'high' | 'medium' | 'low';

interface Task {
  id: string;
  title: string;
  assignee: { name: string; avatar: string };
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  tags: string[];
  isMine?: boolean;
}

/* ===== Data (fetched from API) ===== */
const INITIAL_TASKS: Task[] = [];

/* ===== CSS Animations ===== */
const animationStyles = `
@keyframes tmFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes tmSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes tmToastIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes tmToastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-8px) scale(0.95); } }
@keyframes tmCardEnter { from { opacity: 0; transform: scale(0.95) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.tm-fade-in { animation: tmFadeIn 0.5s ease-out both; }
.tm-slide-up { animation: tmSlideUp 0.3s ease-out both; }
.tm-toast-in { animation: tmToastIn 0.3s ease-out both; }
.tm-toast-out { animation: tmToastOut 0.3s ease-in both; }
.tm-card-enter { animation: tmCardEnter 0.3s ease-out both; }
`;

/* ===== Config ===== */
const COLUMNS: { key: TaskStatus; label: string; icon: React.ElementType; color: string; bg: string; dotColor: string }[] = [
  { key: 'todo', label: 'To Do', icon: ListTodo, color: 'text-slate-400', bg: 'bg-slate-400/10', dotColor: 'bg-slate-400' },
  { key: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-sky-500', bg: 'bg-sky-500/10', dotColor: 'bg-sky-500' },
  { key: 'review', label: 'Review', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', dotColor: 'bg-amber-500' },
  { key: 'done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', dotColor: 'bg-emerald-500' },
];

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; bg: string; border: string; label: string }> = {
  high: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'High' },
  medium: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Medium' },
  low: { color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30', label: 'Low' },
};

const TAG_COLORS: Record<string, string> = {
  Reporting: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  Research: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  CRM: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  Data: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
  Proposal: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Outreach: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  Legal: 'bg-red-500/10 text-red-500 border-red-500/20',
  Contract: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Technical: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  Pricing: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  Marketing: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20',
  Deal: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  Won: 'bg-green-500/10 text-green-500 border-green-500/20',
  Communication: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  HR: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  Onboarding: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  Compliance: 'bg-red-500/10 text-red-400 border-red-500/20',
  Q1: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

const EMPTY_TASK_TEMPLATE: Omit<Task, 'id'> = {
  title: '',
  assignee: { name: '', avatar: '' },
  priority: 'medium',
  status: 'todo',
  dueDate: '',
  tags: [],
  isMine: true,
};

/* ===== Main Component ===== */
export default function TaskManagementBoard() {
  const [mounted, setMounted] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>('all');
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const [toastExiting, setToastExiting] = useState(false);

  const showToast = (message: string) => {
    setToast({ message, id: Date.now() });
    setToastExiting(false);
    setTimeout(() => setToastExiting(true), 2000);
    setTimeout(() => setToast(null), 2300);
  };

  const handleMoveTask = (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    const colLabel = COLUMNS.find(c => c.key === newStatus)?.label;
    showToast(`Task moved to "${colLabel}"`);
  };

  const handleAddTask = () => {
    const newTask: Task = { ...EMPTY_TASK_TEMPLATE, id: `t-new-${Date.now()}`, title: 'New Task' };
    setTasks(prev => [newTask, ...prev]);
    showToast('New task added to To Do');
  };

  const visibleTasks = useMemo(() => {
    let filtered = [...tasks];
    if (showMyTasks) filtered = filtered.filter(t => t.isMine);
    if (priorityFilter !== 'all') filtered = filtered.filter(t => t.priority === priorityFilter);
    return filtered;
  }, [tasks, showMyTasks, priorityFilter]);

  const summaryStats = useMemo(() => {
    const allTasks = showMyTasks ? tasks.filter(t => t.isMine) : tasks;
    return {
      total: allTasks.length,
      overdue: allTasks.filter(t => t.dueDate === 'Overdue').length,
      dueToday: allTasks.filter(t => t.dueDate === 'Today').length,
      completed: allTasks.filter(t => t.status === 'done').length,
    };
  }, [tasks, showMyTasks]);

  const getNextStatus = (current: TaskStatus): TaskStatus | null => {
    const order: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
    const idx = order.indexOf(current);
    return idx < order.length - 1 ? order[idx + 1] : null;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-4', mounted ? 'tm-fade-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-purple-600">
                  <LayoutGrid className="h-4 w-4 text-white" />
                </div>
                Task Management Board
                <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/25 border text-[9px] h-5">
                  {summaryStats.total} tasks
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAddTask}
                  className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-xs shadow-md hover:shadow-lg transition-all duration-200"
                  size="sm"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Task
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total Tasks', value: summaryStats.total, icon: ListTodo, color: 'text-violet-500', bg: 'bg-violet-500/10' },
                { label: 'Overdue', value: summaryStats.overdue, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
                { label: 'Due Today', value: summaryStats.dueToday, icon: Calendar, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                { label: 'Completed', value: summaryStats.completed, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div className={cn('rounded-md p-1.5 shrink-0', stat.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', stat.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight tabular-nums">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controls Row */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* My Tasks / All Tasks Toggle */}
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
                <button
                  onClick={() => setShowMyTasks(false)}
                  className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer', !showMyTasks ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  All Tasks
                </button>
                <button
                  onClick={() => setShowMyTasks(true)}
                  className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer', showMyTasks ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  <User className="h-3 w-3 inline mr-1" />
                  My Tasks
                </button>
              </div>

              {/* Priority Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/40 text-xs font-medium hover:bg-muted/60 transition-all duration-200 cursor-pointer"
                >
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  Priority: {priorityFilter === 'all' ? 'All' : priorityFilter.charAt(0).toUpperCase() + priorityFilter.slice(1)}
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200', showPriorityDropdown && 'rotate-180')} />
                </button>
                {showPriorityDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-36 rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg z-20 py-1 tm-slide-up">
                    {(['all', 'high', 'medium', 'low'] as FilterPriority[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => { setPriorityFilter(p); setShowPriorityDropdown(false); }}
                        className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors cursor-pointer', priorityFilter === p ? 'bg-violet-500/10 text-violet-500 font-medium' : 'hover:bg-muted/50')}
                      >
                        {p === 'all' ? 'All Priorities' : PRIORITY_CONFIG[p].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {COLUMNS.map((col) => {
                const ColIcon = col.icon;
                const columnTasks = visibleTasks.filter(t => t.status === col.key);
                return (
                  <div key={col.key} className="rounded-xl border border-border/40 bg-muted/20 p-3 min-h-[280px]">
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={cn('h-2 w-2 rounded-full', col.dotColor)} />
                        <span className="text-xs font-semibold">{col.label}</span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">{columnTasks.length}</Badge>
                      </div>
                      <ColIcon className={cn('h-3.5 w-3.5', col.color)} />
                    </div>

                    {/* Task Cards */}
                    <div className="space-y-2">
                      {columnTasks.map((task, idx) => {
                        const priorityConf = PRIORITY_CONFIG[task.priority];
                        const nextStatus = getNextStatus(task.status);
                        return (
                          <div
                            key={task.id}
                            className="tm-card-enter rounded-lg border border-border/30 bg-background/70 p-3 hover:border-border/60 hover:shadow-sm transition-all duration-200 group cursor-pointer"
                            style={{ animationDelay: `${idx * 0.05}s` }}
                            onClick={() => { if (nextStatus) handleMoveTask(task.id, nextStatus); }}
                          >
                            {/* Priority Badge + Due Date */}
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className={cn('text-[8px] h-4 px-1.5', priorityConf.color, priorityConf.border)}>
                                {priorityConf.label}
                              </Badge>
                              <span className={cn('text-[10px] flex items-center gap-1', task.dueDate === 'Overdue' ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                                <Calendar className="h-2.5 w-2.5" />
                                {task.dueDate}
                              </span>
                            </div>

                            {/* Title */}
                            <p className="text-xs font-medium leading-snug mb-2 group-hover:text-primary transition-colors">{task.title}</p>

                            {/* Tags */}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {task.tags.map((tag) => (
                                <span key={tag} className={cn('text-[8px] px-1.5 py-0.5 rounded-md border font-medium', TAG_COLORS[tag] ?? 'bg-muted/50 text-muted-foreground border-border/30')}>
                                  {tag}
                                </span>
                              ))}
                            </div>

                            {/* Footer: Assignee + Action */}
                            <div className="flex items-center justify-between pt-2 border-t border-border/20">
                              <div className="flex items-center gap-1.5">
                                <div className="flex h-5 w-5 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 items-center justify-center">
                                  <span className="text-[7px] font-bold text-primary">{task.assignee.avatar}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{task.assignee.name}</span>
                              </div>
                              {nextStatus && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <ArrowRight className={cn('h-3 w-3', col.color)} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {columnTasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
                          <ListTodo className="h-6 w-6 mb-1.5" />
                          <p className="text-[10px]">No tasks</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Toast Notification */}
        {toast && (
          <div className={cn('fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-medium shadow-lg backdrop-blur-xl', toastExiting ? 'tm-toast-out' : 'tm-toast-in')}>
            <CheckCircle2 className="h-4 w-4" />
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
