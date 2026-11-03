'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Inactivity Timer (Client Component)
//
// Shows a countdown of remaining admin session time. When the timer
// reaches 0, the admin is automatically logged out and redirected to
// the login page.
//
// The server-side check in getSuperAdminSession() is the authoritative
// enforcement. This client component provides the visible countdown
// and proactive logout before the server-side check triggers.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, AlertTriangle } from 'lucide-react';

interface AdminInactivityTimerProps {
  secondsLeft: number;
}

export default function AdminInactivityTimer({ secondsLeft }: AdminInactivityTimerProps) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(secondsLeft);
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    setRemaining(secondsLeft);
  }, [secondsLeft]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          // Timer expired — redirect to logout
          clearInterval(interval);
          fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
            .finally(() => router.push('/'));
          return 0;
        }
        setWarning(prev <= 60); // Warning state when <1 min left
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [router]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  if (remaining > 120) {
    // More than 2 minutes left — subtle indicator
    return (
      <div className="flex items-center justify-end gap-1.5 px-4 py-1 text-[11px] text-muted-foreground border-b border-border bg-muted/30">
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">{display}</span>
      </div>
    );
  }

  // Less than 2 minutes — warning state
  return (
    <div className={`flex items-center justify-end gap-1.5 px-4 py-1 text-[11px] border-b ${
      warning ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
    }`}>
      {warning ? <AlertTriangle className="h-3 w-3 animate-pulse" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
      <span className="tabular-nums font-medium">{display}</span>
      {warning && <span className="hidden sm:inline">— session expiring</span>}
    </div>
  );
}
