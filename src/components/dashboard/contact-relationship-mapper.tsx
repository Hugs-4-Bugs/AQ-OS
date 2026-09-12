'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Network,
  UserCircle,
  Building2,
  Calendar,
  Star,
  Clock,
  MessageSquare,
  Filter,
  Handshake,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────
type RelationshipStrength = 'strong' | 'medium' | 'new' | 'cold';
type FilterType = 'all' | RelationshipStrength;

interface ContactNode {
  id: string;
  name: string;
  role: string;
  company: string;
  lastContact: string;
  score: number;
  strength: RelationshipStrength;
  dealValue: number;
  sparkline: number[];
  angle: number;
  distance: number;
  size: number;
}

// ── Constants ──────────────────────────────────────────────────────
const STRENGTH_CONFIG: Record<RelationshipStrength, { color: string; ringColor: string; bgColor: string; label: string; distanceRange: [number, number] }> = {
  strong: { color: 'text-emerald-500', ringColor: '#10b981', bgColor: 'bg-emerald-500/15', label: 'Strong', distanceRange: [70, 95] },
  medium: { color: 'text-sky-500', ringColor: '#3b82f6', bgColor: 'bg-sky-500/15', label: 'Medium', distanceRange: [105, 125] },
  new: { color: 'text-amber-500', ringColor: '#f59e0b', bgColor: 'bg-amber-500/15', label: 'New', distanceRange: [130, 150] },
  cold: { color: 'text-gray-400', ringColor: '#94a3b8', bgColor: 'bg-gray-400/15', label: 'Cold', distanceRange: [155, 170] },
};

// ── Contacts (fetched from API) ────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────
function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function buildSparklinePath(data: number[], w: number, h: number): string {
  if (data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ── Contact Detail Panel ───────────────────────────────────────────
function ContactDetailPanel({ contact }: { contact: ContactNode }) {
  const cfg = STRENGTH_CONFIG[contact.strength];
  const sparkPath = buildSparklinePath(contact.sparkline, 48, 16);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.2 }}
      className="absolute z-30 w-52 p-3 rounded-xl glass-card border border-border/50 shadow-xl"
      style={{ left: '50%', bottom: 'calc(100% + 10px)', transform: 'translateX(-50%)' }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold truncate">{contact.name}</p>
          <Badge className={cn('text-[9px] h-4 px-1.5', cfg.bgColor, cfg.color)}>{cfg.label}</Badge>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{contact.company}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{contact.lastContact}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs">
            <Star className="h-3 w-3 text-amber-500" />
            <span className="font-medium">{contact.score}</span>
          </div>
          {sparkPath && (
            <svg width="48" height="16" viewBox="0 0 48 16" className="overflow-visible">
              <path d={sparkPath} fill="none" stroke={cfg.ringColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      {/* Tooltip arrow */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 glass-card border-b border-r border-border/50" />
    </motion.div>
  );
}

// ── Central Ring Visualization ─────────────────────────────────────
function RelationshipVisualization({
  contacts,
  hoveredId,
  onHover,
  onClick,
}: {
  contacts: ContactNode[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onClick: (contact: ContactNode) => void;
}) {
  const cx = 200;
  const cy = 180;

  return (
    <svg viewBox="0 0 400 360" className="w-full max-w-[400px] mx-auto" role="img" aria-label="Relationship map visualization">
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.527 0.22 280 / 0.15)" />
          <stop offset="100%" stopColor="oklch(0.527 0.22 280 / 0)" />
        </radialGradient>
      </defs>

      {/* Center glow */}
      <circle cx={cx} cy={cy} r={60} fill="url(#centerGlow)" />

      {/* Connecting lines */}
      {contacts.map((contact) => {
        const pos = polarToCartesian(cx, cy, contact.distance, contact.angle);
        const cfg = STRENGTH_CONFIG[contact.strength];
        const opacity = contact.strength === 'strong' ? 0.4 : contact.strength === 'medium' ? 0.25 : contact.strength === 'new' ? 0.15 : 0.08;
        return (
          <line
            key={`line-${contact.id}`}
            x1={cx}
            y1={cy}
            x2={pos.x}
            y2={pos.y}
            stroke={cfg.ringColor}
            strokeWidth={hoveredId === contact.id ? 2 : 1}
            strokeDasharray={contact.strength === 'cold' ? '4 4' : 'none'}
            opacity={hoveredId === contact.id ? 0.7 : opacity}
          />
        );
      })}

      {/* Center circle */}
      <circle cx={cx} cy={cy} r={38} className="fill-primary/10 stroke-primary/30" strokeWidth={2} />
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground text-xs font-semibold" fontSize="11">
        Your Team
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground" fontSize="9">
        6 members
      </text>

      {/* Contact nodes */}
      {contacts.map((contact) => {
        const pos = polarToCartesian(cx, cy, contact.distance, contact.angle);
        const cfg = STRENGTH_CONFIG[contact.strength];
        const isHovered = hoveredId === contact.id;
        const r = contact.size / 2;

        return (
          <g
            key={contact.id}
            onMouseEnter={() => onHover(contact.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick(contact)}
            className="cursor-pointer"
          >
            {/* Hover ring */}
            {isHovered && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r + 6}
                fill="none"
                stroke={cfg.ringColor}
                strokeWidth={1.5}
                opacity={0.4}
              />
            )}
            {/* Circle */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              fill={cfg.ringColor}
              opacity={isHovered ? 1 : 0.7}
              className="transition-opacity duration-200"
            />
            {/* Initials */}
            <text
              x={pos.x}
              y={pos.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="10"
              fontWeight="600"
            >
              {contact.name.split(' ').map((n) => n[0]).join('')}
            </text>
            {/* Name label below */}
            <text
              x={pos.x}
              y={pos.y + r + 12}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="8"
            >
              {contact.name.split(' ')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-40" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-[260px] rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function ContactRelationshipMapper() {
  const [contacts, setContacts] = useState<ContactNode[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const filteredContacts = useMemo(() => {
    if (filter === 'all') return contacts;
    return contacts.filter((c) => c.strength === filter);
  }, [contacts, filter]);

  const summaryStats = useMemo(() => {
    if (contacts.length === 0) {
      return [
        { label: 'Total Contacts', value: '0', icon: UserCircle, color: 'text-primary' },
        { label: 'Strong Relations', value: '0', icon: Handshake, color: 'text-emerald-500' },
        { label: 'Avg. Response', value: '—', icon: Clock, color: 'text-amber-500' },
        { label: 'Upcoming Touches', value: '0', icon: MessageSquare, color: 'text-sky-500' },
      ];
    }
    const strong = contacts.filter((c) => c.strength === 'strong').length;
    const avgScore = Math.round(contacts.reduce((s, c) => s + c.score, 0) / contacts.length);
    return [
      { label: 'Total Contacts', value: String(contacts.length), icon: UserCircle, color: 'text-primary' },
      { label: 'Strong Relations', value: String(strong), icon: Handshake, color: 'text-emerald-500' },
      { label: 'Avg. Response', value: '1.8d', icon: Clock, color: 'text-amber-500' },
      { label: 'Upcoming Touches', value: '12', icon: MessageSquare, color: 'text-sky-500' },
    ];
  }, [contacts]);

  const handleContactClick = (contact: ContactNode) => {
    setToastMsg(`Follow-up scheduled with ${contact.name}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const hoveredContact = useMemo(
    () => contacts.find((c) => c.id === hoveredId) ?? null,
    [contacts, hoveredId]
  );

  const filterOptions: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'strong', label: 'Strong' },
    { key: 'medium', label: 'Medium' },
    { key: 'new', label: 'New' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card card-glow overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              <span className="gradient-text">Relationship Map</span>
            </CardTitle>

            {/* Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFilter(opt.key)}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200',
                      filter === opt.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Visualization */}
          <div className="relative">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    {filteredContacts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-xs text-muted-foreground">No contacts in your relationship map.</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Import contacts to visualize your network.</p>
                      </div>
                    ) : (
                    <>
                    <RelationshipVisualization
                      contacts={filteredContacts}
                      hoveredId={hoveredId}
                      onHover={setHoveredId}
                      onClick={handleContactClick}
                    />

                    </>
                    )}

                    {/* Hover detail tooltip */}
                    {hoveredContact && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2">
                        <ContactDetailPanel contact={hoveredContact} />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Click a contact to schedule a follow-up
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Toast message */}
            {toastMsg && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-emerald-500/90 text-white text-xs font-medium shadow-lg z-40"
              >
                ✓ {toastMsg}
              </motion.div>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {summaryStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.3 }}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30"
                >
                  <Icon className={cn('h-4 w-4 shrink-0', stat.color)} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight">{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
