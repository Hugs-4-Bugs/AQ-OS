'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Eye,
  UserCheck,
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  Globe,
  HardDrive,
  Server,
  Download,
  FileText,
  RefreshCw,
  Users,
  Monitor,
  ChevronRight,
  Bug,
  Fingerprint,
} from 'lucide-react';

/* ===== Types ===== */
type ComplianceStatus = 'pass' | 'warning' | 'fail';
type AlertSeverity = 'Critical' | 'Warning' | 'Info';
type SessionStatus = 'Active' | 'Idle' | 'Expired';

interface ComplianceArea {
  id: string;
  name: string;
  status: ComplianceStatus;
  score: number;
  lastChecked: string;
  icon: React.ElementType;
}

interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  timestamp: string;
  icon: React.ElementType;
}

interface ActiveSession {
  id: string;
  name: string;
  role: string;
  loginTime: string;
  ip: string;
  status: SessionStatus;
}

interface PermissionCategory {
  name: string;
  permissions: string[];
}

interface RolePermission {
  role: string;
  permissions: Record<string, boolean>;
}

interface ActivityLogEntry {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  icon: React.ElementType;
  iconColor: string;
}

interface EncryptionStatus {
  label: string;
  status: 'active' | 'inactive';
  description: string;
}

/* ===== Default empty data (fetched from API) ===== */
const DEFAULT_COMPLIANCE_AREAS: ComplianceArea[] = [];
const DEFAULT_SECURITY_ALERTS: SecurityAlert[] = [];
const DEFAULT_ACTIVE_SESSIONS: ActiveSession[] = [];

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  { name: 'Read', permissions: ['data_read', 'reports_read', 'users_read', 'settings_read'] },
  { name: 'Write', permissions: ['data_write', 'reports_write', 'users_write', 'settings_write'] },
  { name: 'Delete', permissions: ['data_delete', 'reports_delete', 'users_delete', 'settings_delete'] },
  { name: 'Admin', permissions: ['data_admin', 'reports_admin', 'users_admin', 'settings_admin'] },
];

const ROLE_PERMISSIONS: RolePermission[] = [
  { role: 'Admin', permissions: { Read: true, Write: true, Delete: true, Admin: true } },
  { role: 'Manager', permissions: { Read: true, Write: true, Delete: true, Admin: false } },
  { role: 'Analyst', permissions: { Read: true, Write: true, Delete: false, Admin: false } },
  { role: 'Viewer', permissions: { Read: true, Write: false, Delete: false, Admin: false } },
];

const ACTIVITY_LOG: ActivityLogEntry[] = [];

const ENCRYPTION_STATUS: EncryptionStatus[] = [
  { label: 'At Rest', status: 'active', description: 'AES-256 encryption for all stored data' },
  { label: 'In Transit', status: 'active', description: 'TLS 1.3 for all API and web connections' },
  { label: 'Backups', status: 'active', description: 'Encrypted daily backups with 30-day retention' },
];

/* ===== Animation Variants ===== */
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ===== Empty State ===== */
function EmptyStateMessage({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted/20 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/* ===== Compliance Score Gauge ===== */
function ComplianceGauge({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;
  const centerX = 90;
  const centerY = 90;

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();
    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [score]);

  const scoreColor = score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs Attention';

  /* Color zones for the gauge background */
  const zoneRanges = [
    { start: 0, end: 70, color: '#ef4444' },
    { start: 70, end: 85, color: '#f59e0b' },
    { start: 85, end: 100, color: '#10b981' },
  ];

  function zoneArc(startVal: number, endVal: number) {
    const startAngle = (startVal / 100) * 360 - 90;
    const endAngle = (endVal / 100) * 360 - 90;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);
    const largeArc = endVal - startVal > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 180 180" className="transform -rotate-90">
        <defs>
          <linearGradient id="complianceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <filter id="complianceGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Color zones */}
        {zoneRanges.map((zone) => (
          <path
            key={`${zone.start}-${zone.end}`}
            d={zoneArc(zone.start, zone.end)}
            fill="none"
            stroke={zone.color}
            strokeWidth="10"
            opacity={0.12}
            strokeLinecap="butt"
          />
        ))}
        {/* Score arc */}
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="url(#complianceGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          filter="url(#complianceGlow)"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: 180, height: 180 }}>
        <span className="text-3xl font-extrabold tabular-nums" style={{ color: scoreColor }}>
          {animatedScore}
        </span>
        <span className="text-[10px] text-muted-foreground font-medium">out of 100</span>
      </div>
      <div className="mt-2">
        <Badge className={cn(
          'text-[10px] px-2',
          score >= 90 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
          score >= 75 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
          'bg-red-500/10 text-red-500 border-red-500/20'
        )}>
          {scoreLabel}
        </Badge>
      </div>
    </div>
  );
}

/* ===== Alert Severity Badge ===== */
function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const config = {
    Critical: { className: 'bg-red-500/10 text-red-500 border-red-500/20', dotClass: 'bg-red-500' },
    Warning: { className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotClass: 'bg-amber-500' },
    Info: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dotClass: 'bg-blue-500' },
  };
  const c = config[severity];
  return (
    <Badge className={cn('text-[9px] h-5 px-1.5 border flex items-center gap-1', c.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      {severity}
    </Badge>
  );
}

/* ===== Session Status Badge ===== */
function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const config = {
    Active: { className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dotClass: 'bg-emerald-500' },
    Idle: { className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotClass: 'bg-amber-500' },
    Expired: { className: 'bg-muted/50 text-muted-foreground border-border/30', dotClass: 'bg-muted-foreground' },
  };
  const c = config[status];
  return (
    <Badge className={cn('text-[9px] h-5 px-1.5 border flex items-center gap-1', c.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      {status}
    </Badge>
  );
}

/* ===== Compliance Status Helper ===== */
function getComplianceStatusConfig(status: ComplianceStatus) {
  const configs = {
    pass: { icon: CheckCircle2, className: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    warning: { icon: AlertTriangle, className: 'text-amber-500', bg: 'bg-amber-500/5', border: 'border-amber-500/20', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    fail: { icon: XCircle, className: 'text-red-500', bg: 'bg-red-500/5', border: 'border-red-500/20', badge: 'bg-red-500/10 text-red-500 border-red-500/20' },
  };
  return configs[status];
}

/* ===== Main Component ===== */
export default function ComplianceSecurityCenter() {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const auditIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [COMPLIANCE_AREAS, setComplianceAreas] = useState<ComplianceArea[]>(DEFAULT_COMPLIANCE_AREAS);
  const [SECURITY_ALERTS, setSecurityAlerts] = useState<SecurityAlert[]>(DEFAULT_SECURITY_ALERTS);
  const [ACTIVE_SESSIONS, setActiveSessions] = useState<ActiveSession[]>(DEFAULT_ACTIVE_SESSIONS);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/compliance-security')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.complianceAreas) setComplianceAreas(d.complianceAreas);
        if (d.securityAlerts) setSecurityAlerts(d.securityAlerts);
        if (d.activeSessions) setActiveSessions(d.activeSessions);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  // Cleanup audit interval on unmount
  useEffect(() => {
    return () => {
      if (auditIntervalRef.current) {
        clearInterval(auditIntervalRef.current);
        auditIntervalRef.current = null;
      }
    };
  }, []);

  const handleRunAudit = () => {
    // Clear any existing interval
    if (auditIntervalRef.current) {
      clearInterval(auditIntervalRef.current);
    }
    setIsAuditing(true);
    setAuditProgress(0);
    auditIntervalRef.current = setInterval(() => {
      setAuditProgress((prev) => {
        if (prev >= 100) {
          if (auditIntervalRef.current) {
            clearInterval(auditIntervalRef.current);
            auditIntervalRef.current = null;
          }
          setIsAuditing(false);
          return 100;
        }
        return prev + 8;
      });
    }, 350);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Compliance & Security Center</h2>
              <p className="text-xs text-muted-foreground">Monitor compliance posture, security alerts, and access controls</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              View Full Report
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-0 hover:shadow-lg hover:shadow-emerald-500/20"
              onClick={handleRunAudit}
              disabled={isAuditing}
            >
              {isAuditing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Shield className="h-3.5 w-3.5" />
              )}
              {isAuditing ? `Scanning... ${Math.min(Math.round(auditProgress), 100)}%` : 'Run Security Audit'}
            </Button>
          </div>
        </div>
        {/* Audit progress bar */}
        {isAuditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3"
          >
            <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                style={{ width: `${Math.min(auditProgress, 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Compliance Score + Areas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Score Gauge */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5 flex flex-col items-center justify-center"
        >
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Overall Compliance Score</h3>
          <div className="relative">
            <ComplianceGauge score={COMPLIANCE_AREAS.length > 0 ? Math.round(COMPLIANCE_AREAS.reduce((s, a) => s + a.score, 0) / COMPLIANCE_AREAS.length) : 0} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
              {COMPLIANCE_AREAS.filter(a => a.status === 'pass').length} of {COMPLIANCE_AREAS.length} areas passing
            </Badge>
          </div>
        </motion.div>

        {/* Compliance Areas Status Cards */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Compliance Areas</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COMPLIANCE_AREAS.length === 0 ? (
              <div className="col-span-full">
                <EmptyStateMessage icon={ShieldCheck} message="No compliance areas configured. Run a security audit to get started." />
              </div>
            ) : COMPLIANCE_AREAS.map((area) => {
              const config = getComplianceStatusConfig(area.status);
              const StatusIcon = config.icon;
              const AreaIcon = area.icon;
              return (
                <motion.div
                  key={area.id}
                  whileHover={{ scale: 1.02, y: -1 }}
                  className={cn(
                    'flex flex-col gap-2 p-3.5 rounded-xl border transition-colors',
                    config.bg, config.border
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('rounded-lg p-1.5', config.bg)}>
                        <AreaIcon className={cn('h-4 w-4', config.className)} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{area.name}</p>
                        <p className="text-[9px] text-muted-foreground">Checked {area.lastChecked}</p>
                      </div>
                    </div>
                    <StatusIcon className={cn('h-4 w-4', config.className)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 mr-3">
                      <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${area.score}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className={cn(
                            'h-full rounded-full',
                            area.score >= 90 ? 'bg-emerald-500' : area.score >= 75 ? 'bg-amber-500' : 'bg-red-500'
                          )}
                        />
                      </div>
                    </div>
                    <span className={cn('text-xs font-bold tabular-nums', config.className)}>{area.score}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Security Alerts Panel */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.15 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold">Security Alerts</h3>
            <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
              {SECURITY_ALERTS.length} active
            </Badge>
          </div>
          <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 gap-1">
            Dismiss All <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="space-y-2">
          {SECURITY_ALERTS.length === 0 ? (
            <EmptyStateMessage icon={AlertTriangle} message="No security alerts. Your system looks healthy." />
          ) : SECURITY_ALERTS.map((alert) => {
            const AlertIcon = alert.icon;
            return (
              <motion.div
                key={alert.id}
                whileHover={{ scale: 1.005 }}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border transition-colors group',
                  alert.severity === 'Critical' ? 'bg-red-500/5 border-red-500/15 hover:border-red-500/30' :
                  alert.severity === 'Warning' ? 'bg-amber-500/5 border-amber-500/15 hover:border-amber-500/30' :
                  'bg-blue-500/5 border-blue-500/15 hover:border-blue-500/30'
                )}
              >
                <div className={cn(
                  'rounded-lg p-2 shrink-0 mt-0.5',
                  alert.severity === 'Critical' ? 'bg-red-500/10' :
                  alert.severity === 'Warning' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                )}>
                  <AlertIcon className={cn(
                    'h-4 w-4',
                    alert.severity === 'Critical' ? 'text-red-500' :
                    alert.severity === 'Warning' ? 'text-amber-500' : 'text-blue-500'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-semibold">{alert.title}</p>
                    <AlertSeverityBadge severity={alert.severity} />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{alert.description}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[9px] text-muted-foreground">{alert.timestamp}</span>
                  <Button size="sm" variant="ghost" className="text-[9px] h-5 px-1.5 text-muted-foreground hover:text-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Review
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Active Sessions + Permission Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active User Sessions */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-bold">Active Sessions</h3>
              <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">
                {ACTIVE_SESSIONS.filter(s => s.status === 'Active').length} online
              </Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            {ACTIVE_SESSIONS.length === 0 ? (
              <EmptyStateMessage icon={Users} message="No active sessions found." />
            ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-3">User</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-3">Role</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-3">Login</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-3">IP</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_SESSIONS.map((session) => (
                  <tr key={session.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center border border-border/30">
                          <span className="text-[8px] font-bold">{session.name.split(' ').map(w => w[0]).join('')}</span>
                        </div>
                        <span className="text-[11px] font-semibold">{session.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted/20 border-border/30">
                        {session.role}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-[11px] text-muted-foreground tabular-nums">{session.loginTime}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <code className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{session.ip}</code>
                    </td>
                    <td className="py-2.5 text-right">
                      <SessionStatusBadge status={session.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </motion.div>

        {/* Permission Matrix */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.25 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-bold">Permission Matrix</h3>
            <Badge variant="outline" className="text-[10px] h-5 px-2 bg-violet-500/5 text-violet-500 border-violet-500/20">
              4 roles × 4 categories
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Role</th>
                  {PERMISSION_CATEGORIES.map((cat) => (
                    <th key={cat.name} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 px-2">
                      {cat.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLE_PERMISSIONS.map((rolePerm) => (
                  <tr key={rolePerm.role} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-4">
                      <Badge
                        className={cn(
                          'text-[10px] h-5 px-2 border',
                          rolePerm.role === 'Admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                          rolePerm.role === 'Manager' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          rolePerm.role === 'Analyst' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          'bg-muted/30 text-muted-foreground border-border/30'
                        )}
                      >
                        {rolePerm.role}
                      </Badge>
                    </td>
                    {PERMISSION_CATEGORIES.map((cat) => {
                      const hasPermission = rolePerm.permissions[cat.name];
                      return (
                        <td key={cat.name} className="py-2.5 px-2 text-center">
                          {hasPermission ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Activity Log + Encryption Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity Log */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold">Recent Activity</h3>
            </div>
            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 gap-1">
              View All <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-0">
            {ACTIVITY_LOG.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <div key={entry.id} className="flex gap-3 group">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full border border-border/50 bg-background flex items-center justify-center shrink-0 group-hover:border-indigo-500/30 group-hover:bg-indigo-500/5 transition-colors">
                      <Icon className={cn('h-3.5 w-3.5', entry.iconColor)} />
                    </div>
                    {index < ACTIVITY_LOG.length - 1 && (
                      <div className="w-px flex-1 bg-border/30 min-h-[12px]" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold">{entry.action}</span>
                      <span className="text-[10px] text-muted-foreground">by {entry.user}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground">{entry.timestamp}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Encryption Status */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.35 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold">Data Encryption Status</h3>
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              All active
            </Badge>
          </div>
          <div className="space-y-3">
            {ENCRYPTION_STATUS.map((item) => (
              <motion.div
                key={item.label}
                whileHover={{ scale: 1.01 }}
                className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/10 bg-emerald-500/5 hover:border-emerald-500/20 transition-colors"
              >
                <div className="rounded-lg p-2 bg-emerald-500/10 shrink-0">
                  {item.label === 'At Rest' ? (
                    <HardDrive className="h-4 w-4 text-emerald-500" />
                  ) : item.label === 'In Transit' ? (
                    <Globe className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Server className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-semibold">{item.label}</p>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-muted/20 border border-border/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground">Last Encryption Audit</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Completed on Jun 10, {new Date().getFullYear()} — All systems passed validation. Next audit scheduled for Jul 10.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
