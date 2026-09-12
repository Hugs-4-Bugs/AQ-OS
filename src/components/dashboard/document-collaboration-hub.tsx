'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileType2,
  Eye,
  Pencil,
  Share2,
  Trash2,
  Upload,
  HardDrive,
  Clock,
  User,
  Plus,
  Check,
  X,
  Search,
  Filter,
} from 'lucide-react';

/* ===== Types ===== */
type DocStatus = 'Draft' | 'Under Review' | 'Approved' | 'Archived';
type DocType = 'pdf' | 'xlsx' | 'pptx' | 'docx';
type FilterTab = 'all' | 'mine' | 'shared' | 'archived';
type CollaboratorRole = 'Owner' | 'Editor' | 'Viewer';

interface Document {
  id: string;
  name: string;
  type: DocType;
  owner: string;
  lastModified: string;
  status: DocStatus;
  size: string;
}

interface ActivityEntry {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  avatar: string;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: CollaboratorRole;
  avatar: string;
}

interface DocCollabData {
  documents: Document[];
  activities: ActivityEntry[];
  collaborators: Collaborator[];
  storage: { used: number; total: number };
}

/* ===== Config ===== */
const STATUS_CONFIG: Record<DocStatus, { color: string; bg: string; border: string }> = {
  'Draft': { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
  'Under Review': { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  'Approved': { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  'Archived': { color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border/50' },
};

const TYPE_CONFIG: Record<DocType, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  pdf: { icon: FileType2, color: 'text-red-500', bg: 'bg-red-500/10', label: 'PDF' },
  xlsx: { icon: FileSpreadsheet, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'XLSX' },
  pptx: { icon: Presentation, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'PPTX' },
  docx: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'DOCX' },
};

const ROLE_CONFIG: Record<CollaboratorRole, { color: string; bg: string; border: string }> = {
  'Owner': { color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  'Editor': { color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  'Viewer': { color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border/50' },
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All Documents' },
  { key: 'mine', label: 'My Documents' },
  { key: 'shared', label: 'Shared With Me' },
  { key: 'archived', label: 'Archived' },
];

const AVATAR_COLORS = ['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

/* ===== CSS Animation Keyframes ===== */
const animationStyles = `
@keyframes docFadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes docToastSlide {
  from { opacity: 0; transform: translateY(16px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes docToastOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(16px) scale(0.95); }
}
@keyframes docPulseIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes docBarGrow {
  from { width: 0%; }
}
.doc-animate-in { animation: docFadeSlideIn 0.5s ease-out both; }
.doc-animate-delay-1 { animation: docFadeSlideIn 0.5s ease-out 0.1s both; }
.doc-animate-delay-2 { animation: docFadeSlideIn 0.5s ease-out 0.2s both; }
.doc-animate-delay-3 { animation: docFadeSlideIn 0.5s ease-out 0.3s both; }
.doc-toast-in { animation: docToastSlide 0.3s ease-out both; }
.doc-toast-out { animation: docToastOut 0.3s ease-in both; }
.doc-pulse-in { animation: docPulseIn 0.3s ease-out both; }
.doc-bar-grow { animation: docBarGrow 1s ease-out both; }
`;

/* ===== Document Type Icon ===== */
function DocTypeBadge({ type }: { type: DocType }) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;
  return (
    <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md border', config.bg, config.border)}>
      <Icon className={cn('h-3.5 w-3.5', config.color)} />
      <span className={cn('text-[10px] font-semibold', config.color)}>{config.label}</span>
    </div>
  );
}

/* ===== Loading Skeleton ===== */
function HubSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-44" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-2 w-full rounded-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function DocumentCollaborationHub() {
  const [apiData, setApiData] = useState<DocCollabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/document-collaboration')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setApiData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Mark as mounted after initial render (for CSS animations)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const DOCUMENTS: Document[] = apiData?.documents ?? [];
  const ACTIVITIES: ActivityEntry[] = apiData?.activities ?? [];
  const COLLABORATORS: Collaborator[] = apiData?.collaborators ?? [];
  const STORAGE = apiData?.storage ?? { used: 0, total: 10 };

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleUpload = useCallback(() => {
    showToast('Document uploaded successfully!');
  }, [showToast]);

  const handleAction = useCallback((action: string, docName: string) => {
    if (action === 'delete') {
      setDeleteConfirm(docName);
      return;
    }
    if (action === 'share') {
      showToast(`Sharing "${docName}" — link copied to clipboard!`, 'info');
      return;
    }
    const messages: Record<string, string> = {
      view: `Opening "${docName}"...`,
      edit: `Editing "${docName}"...`,
    };
    showToast(messages[action] ?? `${action} on "${docName}"`, 'info');
  }, [showToast]);

  const confirmDelete = useCallback(() => {
    if (deleteConfirm) {
      showToast(`"${deleteConfirm}" moved to trash`, 'error');
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, showToast]);

  const filteredDocs = DOCUMENTS.filter((doc) => {
    if (searchQuery && !doc.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (activeTab === 'mine') return doc.owner === 'You';
    if (activeTab === 'shared') return doc.owner !== 'You';
    if (activeTab === 'archived') return doc.status === 'Archived';
    return true;
  });

  const storagePercent = STORAGE.total > 0 ? Math.round((STORAGE.used / STORAGE.total) * 100) : 0;

  if (loading) return <HubSkeleton />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'doc-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-sky-500 to-blue-600">
                  <FileText className="h-4 w-4 text-white" />
                </div>
                Document Collaboration Hub
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Storage usage */}
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-2">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>{STORAGE.used} / {STORAGE.total} GB</span>
                </div>
                <Button size="sm" className="text-xs gap-1.5" onClick={handleUpload}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Storage bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Storage Usage</span>
                <span className="font-semibold text-foreground">{storagePercent}%</span>
              </div>
              <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full doc-bar-grow transition-all duration-500',
                    storagePercent > 80 ? 'bg-red-500' : storagePercent > 60 ? 'bg-amber-500' : 'bg-sky-500'
                  )}
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document List */}
          <div className={cn('lg:col-span-2', mounted ? 'doc-animate-delay-1' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3">
                  {/* Filter tabs */}
                  <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/30 overflow-x-auto">
                    {FILTER_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap cursor-pointer',
                          activeTab === tab.key
                            ? 'bg-background shadow-sm text-foreground border border-border/50'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search documents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-muted/30 border border-border/30 rounded-lg outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Filter className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No documents found</p>
                    </div>
                  ) : (
                    filteredDocs.map((doc, idx) => {
                      const statusConfig = STATUS_CONFIG[doc.status];
                      return (
                        <div
                          key={doc.id}
                          className="doc-pulse-in group flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                          style={{ animationDelay: `${idx * 0.05}s` }}
                        >
                          {/* Type badge */}
                          <DocTypeBadge type={doc.type} />
                          {/* Name + Owner */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{doc.name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1"><User className="h-3 w-3" />{doc.owner}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{doc.lastModified}</span>
                              <span>{doc.size}</span>
                            </div>
                          </div>
                          {/* Status */}
                          <Badge variant="outline" className={cn('text-[9px] h-5 shrink-0', statusConfig.color, statusConfig.bg, statusConfig.border)}>
                            {doc.status}
                          </Badge>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                            <button
                              onClick={() => handleAction('view', doc.name)}
                              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-sky-500" />
                            </button>
                            {doc.status !== 'Archived' && (
                              <button
                                onClick={() => handleAction('edit', doc.name)}
                                className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-amber-500" />
                              </button>
                            )}
                            <button
                              onClick={() => handleAction('share', doc.name)}
                              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                              title="Share"
                            >
                              <Share2 className="h-3.5 w-3.5 text-muted-foreground hover:text-emerald-500" />
                            </button>
                            <button
                              onClick={() => handleAction('delete', doc.name)}
                              className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: Activity + Collaborators */}
          <div className={cn('space-y-6', mounted ? 'doc-animate-delay-2' : 'opacity-0')}>
            {/* Recent Activity */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ACTIVITIES.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-xs">No recent activity</p>
                  </div>
                ) : (
                  ACTIVITIES.map((entry, idx) => {
                    const colorIdx = idx % AVATAR_COLORS.length;
                    return (
                      <div
                        key={entry.id}
                        className="doc-pulse-in flex items-start gap-2.5"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <div className={cn('rounded-full h-7 w-7 flex items-center justify-center shrink-0 text-[9px] font-bold text-white', AVATAR_COLORS[colorIdx])}>
                          {entry.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] leading-relaxed">
                            <span className="font-semibold">{entry.user}</span>
                            {' '}
                            <span className="text-muted-foreground">{entry.action}</span>
                            {' '}
                            <span className="font-medium text-foreground truncate">{entry.target}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{entry.timestamp}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Collaborators */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <User className="h-4 w-4 text-violet-500" />
                    Shared With
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 gap-1">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {COLLABORATORS.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <User className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-xs">No collaborators yet</p>
                  </div>
                ) : (
                  COLLABORATORS.map((collab, idx) => {
                    const roleConfig = ROLE_CONFIG[collab.role];
                    return (
                      <div
                        key={collab.id}
                        className="doc-pulse-in flex items-center gap-2.5 p-2 rounded-lg border border-border/20 hover:border-border/50 hover:bg-muted/20 transition-all duration-200"
                        style={{ animationDelay: `${idx * 0.08}s` }}
                      >
                        <div className={cn('rounded-full h-8 w-8 flex items-center justify-center shrink-0 text-[10px] font-bold text-white', AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                          {collab.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{collab.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{collab.email}</p>
                        </div>
                        <Badge variant="outline" className={cn('text-[9px] h-5 shrink-0', roleConfig.color, roleConfig.bg, roleConfig.border)}>
                          {collab.role}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Delete confirmation modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm doc-pulse-in">
            <div className="bg-background border border-border/50 rounded-xl p-5 shadow-xl max-w-sm w-full mx-4">
              <p className="text-sm font-semibold mb-1">Delete Document</p>
              <p className="text-xs text-muted-foreground mb-4">
                Are you sure you want to delete &quot;{deleteConfirm}&quot;? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setDeleteConfirm(null)}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-xs gap-1 bg-red-500 hover:bg-red-600"
                  onClick={confirmDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Toast notification */}
        {toast && (
          <div
            className={cn(
              'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md doc-toast-in',
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : toast.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400'
            )}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : toast.type === 'error' ? (
              <Trash2 className="h-4 w-4" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
