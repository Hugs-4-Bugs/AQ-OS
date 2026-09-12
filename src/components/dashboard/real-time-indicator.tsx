'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Real-Time Connection Indicator
// Phase 7: Shows SSE/WebSocket connection status in the header
//
// Features:
// - Animated status dot (green/amber/red)
// - Connected duration counter (updates every second)
// - Click to reconnect when disconnected
// - Tooltip with connection details
// - Framer-motion status transitions
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRealTime } from '@/lib/websocket';

export default function RealTimeIndicator() {
  const {
    status,
    connectedDuration,
    connect,
    disconnect,
    reconnectAttempts,
  } = useRealTime();

  const [duration, setDuration] = useState(connectedDuration);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Update connected duration every second
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setDuration(connectedDuration);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connectedDuration]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
    };
  }, [connect, disconnect]);

  const handleReconnect = useCallback(() => {
    disconnect();
    // Small delay before reconnecting to ensure clean state
    reconnectTimerRef.current = setTimeout(() => connect(), 300);
  }, [connect, disconnect]);

  // Status styling
  const statusConfig = {
    connected: {
      dotClass: 'status-dot-connected',
      icon: Wifi,
      label: 'Live',
      color: 'text-emerald-500',
      tooltipText: `Connected for ${duration}`,
    },
    connecting: {
      dotClass: 'status-dot-reconnecting',
      icon: Loader2,
      label: 'Connecting',
      color: 'text-amber-500',
      tooltipText: 'Establishing real-time connection...',
    },
    reconnecting: {
      dotClass: 'status-dot-reconnecting',
      icon: RefreshCw,
      label: 'Reconnecting',
      color: 'text-amber-500',
      tooltipText: `Reconnecting... (attempt ${reconnectAttempts})`,
    },
    disconnected: {
      dotClass: 'status-dot-disconnected',
      icon: WifiOff,
      label: 'Offline',
      color: 'text-red-500',
      tooltipText: 'Disconnected — click to reconnect',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          className={`
            relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg
            transition-colors duration-150
            hover:bg-muted/50
            ${status === 'disconnected' ? 'cursor-pointer' : 'cursor-default'}
          `}
          onClick={status === 'disconnected' ? handleReconnect : undefined}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          whileHover={status === 'disconnected' ? { scale: 1.05 } : {}}
          whileTap={status === 'disconnected' ? { scale: 0.95 } : {}}
          aria-label={`Real-time status: ${config.label}`}
        >
          {/* Status Dot */}
          <AnimatePresence mode="wait">
            <motion.span
              key={status}
              className={config.dotClass}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          </AnimatePresence>

          {/* Icon (hidden on small screens) */}
          <span className={`hidden sm:inline-flex ${config.color}`}>
            <StatusIcon
              className={`h-3 w-3 ${
                status === 'connecting' || status === 'reconnecting'
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </span>

          {/* Label (hidden on very small screens) */}
          <span
            className={`
              hidden md:inline-flex text-[10px] font-medium
              ${config.color}
              transition-colors duration-150
            `}
          >
            {config.label}
          </span>

          {/* Reconnect animation on hover when disconnected */}
          <AnimatePresence>
            {status === 'disconnected' && isHovered && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                className="text-[9px] text-muted-foreground"
              >
                Retry
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {config.tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
