'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, AlertTriangle, RefreshCw, CheckCircle2, Lock, Activity, Search } from 'lucide-react';

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function fetchAction<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(`${url.split('?')[0]} (${res.status})`);
  const json = await res.json();
  return json.data as T;
}

function severityBadge(severity: string | null) {
  if (!severity) return <Badge variant="outline" className="text-[11px]">—</Badge>;
  const s = severity.toUpperCase();
  if (s === 'CRITICAL') return <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">CRITICAL</Badge>;
  if (s === 'HIGH') return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px] dark:text-amber-400">HIGH</Badge>;
  if (s === 'MEDIUM') return <Badge variant="outline" className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[11px] dark:text-blue-400">MEDIUM</Badge>;
  return <Badge variant="outline" className="text-[11px]">LOW</Badge>;
}

export default function AdminSecurityPage() {
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [securityEventsTotal, setSecurityEventsTotal] = useState(0);
  const [suspiciousDetections, setSuspiciousDetections] = useState<any[]>([]);
  const [roleChanges, setRoleChanges] = useState<any[]>([]);
  const [roleChangesTotal, setRoleChangesTotal] = useState(0);
  const [configChanges, setConfigChanges] = useState<any[]>([]);
  const [configChangesTotal, setConfigChangesTotal] = useState(0);
  const [integrityResult, setIntegrityResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [audit, events, suspicious, roles, configs] = await Promise.all([
        fetchAction<any>('/api/admin/security/audit?limit=15'),
        fetchAction<any>('/api/admin/security/events?limit=15'),
        fetchAction<any>('/api/admin/security/suspicious-activity'),
        fetchAction<any>('/api/admin/security/role-changes?limit=10'),
        fetchAction<any>('/api/admin/security/config-changes?limit=10'),
      ]);
      setAuditEntries(audit.entries || []); setAuditTotal(audit.total || 0);
      setSecurityEvents(events.entries || []); setSecurityEventsTotal(events.total || 0);
      setSuspiciousDetections(suspicious.detections || []);
      setRoleChanges(roles.entries || []); setRoleChangesTotal(roles.total || 0);
      setConfigChanges(configs.entries || []); setConfigChangesTotal(configs.total || 0);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load security data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const verifyIntegrity = useCallback(async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/admin/security/audit/verify-integrity', { method: 'POST', credentials: 'include' });
      const json = await res.json();
      setIntegrityResult(json.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Verification failed'); }
    finally { setVerifying(false); }
  }, []);

  if (loading) {
    return (<div className="space-y-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>);
  }
  if (error) {
    return (<Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><AlertTriangle className="h-8 w-8 text-amber-500" /><p className="text-sm font-medium">{error}</p><Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button></CardContent></Card>);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Audit &amp; Security Operations</h1><p className="text-xs text-muted-foreground">Tamper-evident audit chain, security events, suspicious activity detection, sensitive action confirmation</p></div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
      </div>

      {/* Audit Integrity */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-muted-foreground" />Audit Chain Integrity</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button size="sm" variant="outline" disabled={verifying} onClick={verifyIntegrity}>
            {verifying ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
            Verify Integrity
          </Button>
          {integrityResult && (
            <div className="text-xs">
              <span className="font-medium">Result: </span>
              {integrityResult.valid ? (
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">VALID</Badge>
              ) : (
                <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">INVALID</Badge>
              )}
              <span className="ml-2 text-muted-foreground">{integrityResult.totalEvents} events verified, {integrityResult.allViolations?.length || 0} violations</span>
              {integrityResult.firstViolation && (
                <p className="mt-1 text-rose-600 dark:text-rose-400">{integrityResult.firstViolation.message}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suspicious Activity */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" />Suspicious Activity Detection</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          {suspiciousDetections.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">No suspicious activity detected.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Rule</TableHead><TableHead>Severity</TableHead><TableHead>Evidence</TableHead><TableHead className="pr-6">Message</TableHead></TableRow></TableHeader>
              <TableBody>
                {suspiciousDetections.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6 text-xs font-medium">{d.rule}</TableCell>
                    <TableCell>{severityBadge(d.severity)}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{d.evidence.count}/{d.evidence.threshold} in {d.evidence.timeWindowMinutes}min</TableCell>
                    <TableCell className="pr-6 text-[11px] text-muted-foreground">{d.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Audit History */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4 text-muted-foreground" />Audit History <span className="ml-auto text-[11px] text-muted-foreground">{auditTotal} total</span></CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          {auditEntries.length === 0 ? <p className="px-6 pb-4 text-xs text-muted-foreground">No audit entries.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Action</TableHead><TableHead>Actor</TableHead><TableHead>Severity</TableHead><TableHead>Outcome</TableHead><TableHead className="pr-6 text-right">When</TableHead></TableRow></TableHeader>
              <TableBody>
                {auditEntries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs font-medium">{e.action}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[120px]">{e.userId}</TableCell>
                    <TableCell>{severityBadge(e.severity)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px]">{e.outcome || '—'}</Badge></TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Security Events */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Lock className="h-4 w-4 text-muted-foreground" />Security Events <span className="ml-auto text-[11px] text-muted-foreground">{securityEventsTotal} total</span></CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          {securityEvents.length === 0 ? <p className="px-6 pb-4 text-xs text-muted-foreground">No security events recorded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Type</TableHead><TableHead>Severity</TableHead><TableHead>Action</TableHead><TableHead>IP</TableHead><TableHead className="pr-6 text-right">When</TableHead></TableRow></TableHeader>
              <TableBody>
                {securityEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs font-medium">{e.securityEventType}</TableCell>
                    <TableCell>{severityBadge(e.severity)}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{e.action}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{e.ipAddress || '—'}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Role Changes */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-muted-foreground" />Role Changes <span className="ml-auto text-[11px] text-muted-foreground">{roleChangesTotal} total</span></CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          {roleChanges.length === 0 ? <p className="px-6 pb-4 text-xs text-muted-foreground">No role changes recorded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Action</TableHead><TableHead>Target</TableHead><TableHead>Confirmed</TableHead><TableHead className="pr-6 text-right">When</TableHead></TableRow></TableHeader>
              <TableBody>
                {roleChanges.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs font-medium">{e.action}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[120px]">{e.resourceId}</TableCell>
                    <TableCell>{e.confirmed === true ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">confirmed</Badge> : <Badge variant="outline" className="text-[11px]">—</Badge>}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Configuration Changes */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Search className="h-4 w-4 text-muted-foreground" />Configuration Changes <span className="ml-auto text-[11px] text-muted-foreground">{configChangesTotal} total</span></CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          {configChanges.length === 0 ? <p className="px-6 pb-4 text-xs text-muted-foreground">No configuration changes recorded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Config Key</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead><TableHead className="pr-6 text-right">When</TableHead></TableRow></TableHeader>
              <TableBody>
                {configChanges.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs font-medium">{e.resourceId}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[100px]">{e.beforeState ? '[REDACTED]' : '—'}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[100px]">{e.afterState ? '[REDACTED]' : '—'}</TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
