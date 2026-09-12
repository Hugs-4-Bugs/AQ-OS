'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Users,
  GitBranch,
  Network,
  Plus,
  Calendar,
  ArrowRight,
  Clock,
  Phone,
  Mail,
  Handshake,
  Swords,
  Truck,
  ShoppingBag,
  TrendingUp,
  ChevronRight,
  UserPlus,
  MapPin,
  Building2,
  Filter,
} from 'lucide-react';

/* ===== Types ===== */
type RelationshipStrength = 'Strong' | 'Good' | 'Developing' | 'New';
type RelationshipType = 'Partnership' | 'Competitor' | 'Supplier' | 'Customer';

interface CompanyNode {
  id: string;
  name: string;
  industry: string;
  strength: RelationshipStrength;
  x: number;
  y: number;
}

interface Connection {
  id: string;
  from: string;
  to: string;
  type: RelationshipType;
}

interface TopRelationship {
  id: string;
  company: string;
  contactPerson: string;
  lastInteraction: string;
  strength: RelationshipStrength;
  nextAction: string;
}

interface TimelineEvent {
  id: string;
  date: string;
  company: string;
  event: string;
  type: 'meeting' | 'contract' | 'call' | 'email' | 'milestone';
}

interface ContactRelationshipData {
  companies: CompanyNode[];
  connections: Connection[];
  strengthDistribution: { label: string; value: number; color: string }[];
  topRelationships: TopRelationship[];
  timelineEvents: TimelineEvent[];
  quickStats: { label: string; value: string; icon: string; color: string; shadow: string }[];
}

/* ===== Animation Variants ===== */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

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

/* ===== Helper: Relationship Type Config ===== */
function getRelationshipTypeConfig(type: RelationshipType) {
  const configs: Record<RelationshipType, { color: string; dashArray: string; label: string; icon: React.ElementType }> = {
    Partnership: { color: '#10b981', dashArray: 'none', label: 'Partnership', icon: Handshake },
    Competitor: { color: '#ef4444', dashArray: '6,4', label: 'Competitor', icon: Swords },
    Supplier: { color: '#3b82f6', dashArray: 'none', label: 'Supplier', icon: Truck },
    Customer: { color: '#f59e0b', dashArray: 'none', label: 'Customer', icon: ShoppingBag },
  };
  return configs[type];
}

/* ===== Helper: Strength Config ===== */
function getStrengthConfig(strength: RelationshipStrength) {
  const configs: Record<RelationshipStrength, { className: string; dotColor: string }> = {
    Strong: { className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dotColor: 'bg-emerald-500' },
    Good: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dotColor: 'bg-blue-500' },
    Developing: { className: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dotColor: 'bg-amber-500' },
    New: { className: 'bg-violet-500/10 text-violet-500 border-violet-500/20', dotColor: 'bg-violet-500' },
  };
  return configs[strength];
}

/* ===== Loading Skeleton ===== */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-5 w-48 mb-1" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

/* ===== Relationship Network Visualization ===== */
function RelationshipNetwork({ companies, connections }: { companies: CompanyNode[]; connections: Connection[] }) {
  const svgWidth = 600;
  const svgHeight = 460;
  const nodeRadius = 38;

  const companyMap = useMemo(() => {
    const map: Record<string, CompanyNode> = {};
    companies.forEach((c) => { map[c.id] = c; });
    return map;
  }, [companies]);

  return (
    <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="overflow-visible">
      <defs>
        <filter id="nodeShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.15)" />
        </filter>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {companies.map((c) => {
          return (
            <radialGradient key={`grad-${c.id}`} id={`nodeGrad-${c.id}`} cx="50%" cy="30%">
              <stop offset="0%" stopColor="white" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </radialGradient>
          );
        })}
      </defs>

      {/* Connection lines */}
      {connections.map((conn) => {
        const from = companyMap[conn.from];
        const to = companyMap[conn.to];
        if (!from || !to) return null;
        const config = getRelationshipTypeConfig(conn.type);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        return (
          <g key={conn.id}>
            <motion.line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={config.color}
              strokeWidth={2}
              strokeDasharray={config.dashArray}
              strokeOpacity={0.5}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.5 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            <text x={midX} y={midY - 6} textAnchor="middle" className="fill-muted-foreground text-[8px] font-medium" opacity={0.7}>
              {config.label}
            </text>
          </g>
        );
      })}

      {/* Company nodes */}
      {companies.map((company, index) => {
        const strengthConfig = getStrengthConfig(company.strength);
        return (
          <motion.g
            key={company.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 + index * 0.08 }}
            className="cursor-pointer"
          >
            {/* Outer ring */}
            <circle
              cx={company.x}
              cy={company.y}
              r={nodeRadius + 3}
              fill="none"
              stroke={strengthConfig.dotColor}
              strokeWidth="2"
              strokeOpacity={0.3}
            />
            {/* Node circle */}
            <circle
              cx={company.x}
              cy={company.y}
              r={nodeRadius}
              fill={`url(#nodeGrad-${company.id})`}
              stroke={strengthConfig.dotColor}
              strokeWidth="2"
              filter="url(#nodeShadow)"
            />
            {/* Company initial */}
            <text
              x={company.x}
              y={company.y - 4}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-bold"
            >
              {company.name.split(' ').map(w => w[0]).join('')}
            </text>
            {/* Industry badge area */}
            <rect
              x={company.x - 22}
              y={company.y + 8}
              width={44}
              height={16}
              rx={4}
              fill={strengthConfig.dotColor}
              fillOpacity={0.12}
            />
            <text
              x={company.x}
              y={company.y + 19}
              textAnchor="middle"
              className="fill-foreground text-[7px] font-semibold"
            >
              {company.industry}
            </text>
            {/* Strength indicator dot */}
            <circle
              cx={company.x + nodeRadius - 4}
              cy={company.y - nodeRadius + 4}
              r={5}
              fill={strengthConfig.dotColor}
              filter="url(#nodeGlow)"
            />
          </motion.g>
        );
      })}
    </svg>
  );
}

/* ===== Relationship Strength Donut Chart ===== */
function StrengthDonut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const centerX = 60;
  const centerY = 60;
  const radius = 42;
  const innerRadius = 28;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const segments = useMemo(() => {
    let angle = 0;
    return data.map((segment) => {
      const startAngle = angle;
      const segmentAngle = (segment.value / 100) * 360;
      angle += segmentAngle;
      return { ...segment, startAngle, segmentAngle };
    });
  }, [data]);

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {segments.map((segment, index) => {
          const { startAngle, segmentAngle } = segment;

          const startRad = ((startAngle - 90) * Math.PI) / 180;
          const endRad = ((startAngle + segmentAngle - 90) * Math.PI) / 180;

          const outerStartX = centerX + radius * Math.cos(startRad);
          const outerStartY = centerY + radius * Math.sin(startRad);
          const outerEndX = centerX + radius * Math.cos(endRad);
          const outerEndY = centerY + radius * Math.sin(endRad);
          const innerEndX = centerX + innerRadius * Math.cos(endRad);
          const innerEndY = centerY + innerRadius * Math.sin(endRad);
          const innerStartX = centerX + innerRadius * Math.cos(startRad);
          const innerStartY = centerY + innerRadius * Math.sin(startRad);

          const largeArc = segmentAngle > 180 ? 1 : 0;

          const pathData = [
            `M ${outerStartX} ${outerStartY}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`,
            `L ${innerEndX} ${innerEndY}`,
            `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}`,
            'Z',
          ].join(' ');

          return (
            <motion.path
              key={segment.label}
              d={pathData}
              fill={segment.color}
              opacity={0.85}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.85, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            />
          );
        })}
        <text x={centerX} y={centerY - 4} textAnchor="middle" className="fill-foreground text-sm font-bold">
          {total}
        </text>
        <text x={centerX} y={centerY + 10} textAnchor="middle" className="fill-muted-foreground text-[8px]">
          total
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="text-[10px] text-muted-foreground w-20">{segment.label}</span>
            <span className="text-[10px] font-bold tabular-nums">{segment.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Timeline Event Icon ===== */
function TimelineIcon({ type }: { type: TimelineEvent['type'] }) {
  switch (type) {
    case 'meeting':
      return <Calendar className="h-3.5 w-3.5 text-blue-500" />;
    case 'contract':
      return <Handshake className="h-3.5 w-3.5 text-emerald-500" />;
    case 'call':
      return <Phone className="h-3.5 w-3.5 text-violet-500" />;
    case 'email':
      return <Mail className="h-3.5 w-3.5 text-amber-500" />;
    case 'milestone':
      return <TrendingUp className="h-3.5 w-3.5 text-cyan-500" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

/* ===== Legend Component ===== */
function ConnectionLegend() {
  const types: RelationshipType[] = ['Partnership', 'Competitor', 'Supplier', 'Customer'];
  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {types.map((type) => {
        const config = getRelationshipTypeConfig(type);
        const Icon = config.icon;
        return (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded" style={{ backgroundColor: config.color }} />
            <Icon className="h-3 w-3" style={{ color: config.color }} />
            <span className="text-[10px] text-muted-foreground">{type}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Quick Stats Icon Map ===== */
const QUICK_STAT_ICONS: Record<string, React.ElementType> = {
  Users,
  Clock,
  ArrowRight,
  UserPlus,
};

/* ===== Main Component ===== */
export default function ContactRelationshipIntelligence() {
  const [data, setData] = useState<ContactRelationshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'quarter' | 'year'>('quarter');
  const [isMapping, setIsMapping] = useState(false);

  useEffect(() => {
    fetch('/api/leads')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMapRelationship = () => {
    setIsMapping(true);
    setTimeout(() => setIsMapping(false), 2000);
  };

  if (loading) return <DashboardSkeleton />;

  const COMPANIES = data?.companies ?? [];
  const CONNECTIONS = data?.connections ?? [];
  const STRENGTH_DISTRIBUTION = data?.strengthDistribution ?? [];
  const TOP_RELATIONSHIPS = data?.topRelationships ?? [];
  const TIMELINE_EVENTS = data?.timelineEvents ?? [];
  const quickStats = data?.quickStats ?? [];

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
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
              <Network className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Contact Relationship Intelligence</h2>
              <p className="text-xs text-muted-foreground">Visualize and manage your business relationships</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Period Toggle */}
            <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30">
              <button
                onClick={() => setPeriod('quarter')}
                className={cn(
                  'text-[10px] font-medium px-3 py-1.5 rounded-md transition-all',
                  period === 'quarter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                This Quarter
              </button>
              <button
                onClick={() => setPeriod('year')}
                className={cn(
                  'text-[10px] font-medium px-3 py-1.5 rounded-md transition-all',
                  period === 'year' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                This Year
              </button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={handleMapRelationship}
              disabled={isMapping}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {isMapping ? 'Mapping...' : 'Map New Relationship'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Network Visualization + Strength Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Relationship Network */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="lg:col-span-2 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold">Relationship Network</h3>
              <Badge variant="outline" className="text-[10px] h-5 px-2 bg-indigo-500/5 text-indigo-500 border-indigo-500/20">
                {COMPANIES.length} companies
              </Badge>
            </div>
          </div>
          {COMPANIES.length === 0 ? (
            <EmptyStateMessage icon={GitBranch} message="No company relationships mapped yet. Add companies to visualize your network." />
          ) : (
            <RelationshipNetwork companies={COMPANIES} connections={CONNECTIONS} />
          )}
          <ConnectionLegend />
        </motion.div>

        {/* Strength Distribution Donut */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Strength Distribution</h3>
          </div>
          {STRENGTH_DISTRIBUTION.length === 0 ? (
            <EmptyStateMessage icon={Users} message="No strength distribution data available." />
          ) : (
            <div className="flex justify-center">
              <StrengthDonut data={STRENGTH_DISTRIBUTION} />
            </div>
          )}
          <div className="mt-4 space-y-2">
            {COMPANIES.length === 0 ? (
              <EmptyStateMessage icon={Users} message="No companies in your network yet." />
            ) : COMPANIES.map((company) => {
              const config = getStrengthConfig(company.strength);
              return (
                <div key={company.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
                    <span className="text-[11px] font-medium">{company.name}</span>
                  </div>
                  <Badge className={cn('text-[9px] h-4 px-1.5 border', config.className)}>
                    {company.strength}
                  </Badge>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Top Relationships Table */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.15 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Top Relationships</h3>
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              {TOP_RELATIONSHIPS.length} active
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Filter className="h-3 w-3" />
            Sorted by strength
          </div>
        </div>
        <div className="overflow-x-auto">
            {TOP_RELATIONSHIPS.length === 0 ? (
              <EmptyStateMessage icon={Handshake} message="No top relationships yet. Start building connections to see them here." />
            ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Company</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Contact Person</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Last Interaction</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 pr-4">Strength</th>
                <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {TOP_RELATIONSHIPS.map((rel) => {
                const config = getStrengthConfig(rel.strength);
                return (
                  <tr key={rel.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors group">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold">{rel.company}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center">
                          <span className="text-[8px] font-bold">{rel.contactPerson.split(' ').map(w => w[0]).join('')}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{rel.contactPerson}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-[11px] text-muted-foreground">{rel.lastInteraction}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge className={cn('text-[9px] h-4 px-1.5 border', config.className)}>
                        {rel.strength}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">{rel.nextAction}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-violet-500 transition-colors" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            )}
        </div>
      </motion.div>

      {/* Relationship Timeline */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.2 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold">Relationship Timeline</h3>
            <Badge variant="outline" className="text-[10px] h-5 px-2 bg-blue-500/5 text-blue-500 border-blue-500/20">
              Recent activity
            </Badge>
          </div>
          <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 gap-1">
            View All <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        {TIMELINE_EVENTS.length === 0 ? (
          <EmptyStateMessage icon={Calendar} message="No timeline events available." />
        ) : (
          <div className="space-y-0">
            {TIMELINE_EVENTS.map((event, index) => (
              <div key={event.id} className="flex gap-3 group">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border border-border/50 bg-background flex items-center justify-center shrink-0 group-hover:border-violet-500/30 group-hover:bg-violet-500/5 transition-colors">
                    <TimelineIcon type={event.type} />
                  </div>
                  {index < TIMELINE_EVENTS.length - 1 && (
                    <div className="w-px flex-1 bg-border/30 min-h-[16px]" />
                  )}
                </div>
                {/* Content */}
                <div className="pb-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-foreground">{event.company}</span>
                    <span className="text-[10px] text-muted-foreground">· {event.date}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{event.event}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick Stats Footer */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.25 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {(quickStats.length > 0 ? quickStats : [
          { label: 'Total Relationships', value: '0', icon: 'Users', color: 'from-violet-500 to-indigo-600', shadow: 'shadow-violet-500/20' },
          { label: 'Avg. Interaction', value: 'N/A', icon: 'Clock', color: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/20' },
          { label: 'Pending Actions', value: '0', icon: 'ArrowRight', color: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/20' },
          { label: 'New This Quarter', value: '0', icon: 'UserPlus', color: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/20' },
        ]).map((stat) => {
          const Icon = QUICK_STAT_ICONS[stat.icon] ?? Users;
          return (
            <div
              key={stat.label}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-lg p-3.5 flex items-center gap-3"
            >
              <div className={cn('rounded-lg p-2 bg-gradient-to-br shadow-lg', stat.color, stat.shadow)}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-bold tabular-nums">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
