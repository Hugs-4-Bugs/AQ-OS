'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useWebSocket } from '@/hooks/use-websocket'
import { useAuthStore } from '@/lib/auth-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveEvent {
  channel: string
  type: string
  payload: Record<string, unknown>
  timestamp: number
  id?: string
}

interface ChannelStatus {
  connected: boolean
  eventCount: number
}

interface UseLiveUpdatesReturn {
  isConnected: boolean
  lastEvent: LiveEvent | null
  notifications: ChannelStatus
  messages: ChannelStatus
  payments: ChannelStatus
  leads: ChannelStatus
  ai: ChannelStatus
  workflows: ChannelStatus
  /** Subscribe to all events on a specific channel */
  on: (channel: string, handler: EventHandler) => () => void
  /** Subscribe to specific event types on a channel */
  onType: (channel: string, type: string, handler: EventHandler) => () => void
}

type EventHandler = (event: LiveEvent) => void

// ─── Module-level Event Emitter ──────────────────────────────────────────────
// Allows other hooks to subscribe without being directly coupled to the
// useLiveUpdates component lifecycle.

type ListenerEntry = { handler: EventHandler; type?: string }

const globalListeners = new Map<string, Set<ListenerEntry>>()

function emitToChannel(channel: string, event: LiveEvent): void {
  const listeners = globalListeners.get(channel)
  if (!listeners) return
  for (const entry of listeners) {
    // If entry has a specific type filter, only fire when it matches
    if (entry.type && entry.type !== event.type) continue
    try {
      entry.handler(event)
    } catch {
      // Swallow handler errors so one bad subscriber doesn't break others
    }
  }
}

function addListener(channel: string, entry: ListenerEntry): () => void {
  if (!globalListeners.has(channel)) {
    globalListeners.set(channel, new Set())
  }
  const set = globalListeners.get(channel)!
  set.add(entry)
  return () => {
    set.delete(entry)
    if (set.size === 0) {
      globalListeners.delete(channel)
    }
  }
}

// ─── Singleton Connection State ──────────────────────────────────────────────
// Only one WebSocket connection should be active at a time. Multiple hook
// instances share the same event stream through the global emitter.

let connectionActive = false
const connectionListeners = new Set<(connected: boolean) => void>()

function setConnectionActive(active: boolean): void {
  connectionActive = active
  for (const fn of connectionListeners) {
    try { fn(active) } catch { /* noop */ }
  }
}

function onConnectionChange(fn: (connected: boolean) => void): () => void {
  connectionListeners.add(fn)
  // Immediately report current state
  fn(connectionActive)
  return () => { connectionListeners.delete(fn) }
}

// ─── Per-channel event counters (module-level for cross-hook sharing) ────────

const channelEventCounts = new Map<string, number>()
const channelCountListeners = new Map<string, Set<(count: number) => void>>()

function incrementChannelCount(channel: string): void {
  const current = channelEventCounts.get(channel) ?? 0
  const next = current + 1
  channelEventCounts.set(channel, next)
  const listeners = channelCountListeners.get(channel)
  if (listeners) {
    for (const fn of listeners) {
      try { fn(next) } catch { /* noop */ }
    }
  }
}

function getChannelCount(channel: string): number {
  return channelEventCounts.get(channel) ?? 0
}

function onChannelCountChange(channel: string, fn: (count: number) => void): () => void {
  if (!channelCountListeners.has(channel)) {
    channelCountListeners.set(channel, new Set())
  }
  const set = channelCountListeners.get(channel)!
  set.add(fn)
  // Report current value
  fn(getChannelCount(channel))
  return () => {
    set.delete(fn)
    if (set.size === 0) channelCountListeners.delete(channel)
  }
}

// ─── Channel Keys ────────────────────────────────────────────────────────────

const CHANNELS = ['notification', 'message', 'payment', 'lead', 'ai', 'workflow'] as const
type ChannelKey = (typeof CHANNELS)[number]

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLiveUpdates(): UseLiveUpdatesReturn {
  const { isAuthenticated } = useAuthStore()

  // ── Local state ──
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Per-channel event counts (reactive)
  const [notifCount, setNotifCount] = useState(0)
  const [msgCount, setMsgCount] = useState(0)
  const [payCount, setPayCount] = useState(0)
  const [leadCount, setLeadCount] = useState(0)
  const [aiCount, setAiCount] = useState(0)
  const [wfCount, setWfCount] = useState(0)

  const mountedRef = useRef(true)

  // ── Stable callback refs for the WebSocket handlers ──
  // These must be stable so the useWebSocket dependency array doesn't change
  // on every render (which would cause reconnection loops).

  const handleNotification = useCallback((data: unknown) => {
    if (!mountedRef.current) return
    const event: LiveEvent = {
      channel: 'notification',
      type: (data as Record<string, unknown>)?.type as string ?? 'unknown',
      payload: (data as Record<string, unknown>) ?? {},
      timestamp: Date.now(),
      id: (data as Record<string, unknown>)?.id as string | undefined,
    }
    setLastEvent(event)
    incrementChannelCount('notification')
    emitToChannel('notification', event)
  }, [])

  const handleMessage = useCallback((data: unknown) => {
    if (!mountedRef.current) return
    const event: LiveEvent = {
      channel: 'message',
      type: (data as Record<string, unknown>)?.type as string ?? 'unknown',
      payload: (data as Record<string, unknown>) ?? {},
      timestamp: Date.now(),
      id: (data as Record<string, unknown>)?.id as string | undefined,
    }
    setLastEvent(event)
    incrementChannelCount('message')
    emitToChannel('message', event)
  }, [])

  const handlePayment = useCallback((data: unknown) => {
    if (!mountedRef.current) return
    const event: LiveEvent = {
      channel: 'payment',
      type: (data as Record<string, unknown>)?.type as string ?? 'unknown',
      payload: (data as Record<string, unknown>) ?? {},
      timestamp: Date.now(),
      id: (data as Record<string, unknown>)?.id as string | undefined,
    }
    setLastEvent(event)
    incrementChannelCount('payment')
    emitToChannel('payment', event)
  }, [])

  const handleLead = useCallback((data: unknown) => {
    if (!mountedRef.current) return
    const event: LiveEvent = {
      channel: 'lead',
      type: (data as Record<string, unknown>)?.type as string ?? 'unknown',
      payload: (data as Record<string, unknown>) ?? {},
      timestamp: Date.now(),
      id: (data as Record<string, unknown>)?.id as string | undefined,
    }
    setLastEvent(event)
    incrementChannelCount('lead')
    emitToChannel('lead', event)
  }, [])

  const handleAI = useCallback((data: unknown) => {
    if (!mountedRef.current) return
    const event: LiveEvent = {
      channel: 'ai',
      type: (data as Record<string, unknown>)?.type as string ?? 'unknown',
      payload: (data as Record<string, unknown>) ?? {},
      timestamp: Date.now(),
      id: (data as Record<string, unknown>)?.id as string | undefined,
    }
    setLastEvent(event)
    incrementChannelCount('ai')
    emitToChannel('ai', event)
  }, [])

  const handleWorkflow = useCallback((data: unknown) => {
    if (!mountedRef.current) return
    const event: LiveEvent = {
      channel: 'workflow',
      type: (data as Record<string, unknown>)?.type as string ?? 'unknown',
      payload: (data as Record<string, unknown>) ?? {},
      timestamp: Date.now(),
      id: (data as Record<string, unknown>)?.id as string | undefined,
    }
    setLastEvent(event)
    incrementChannelCount('workflow')
    emitToChannel('workflow', event)
  }, [])

  // ── Connect WebSocket ──
  const { isConnected: wsConnected } = useWebSocket({
    autoConnect: true,
    channels: [...CHANNELS],
    onNotification: handleNotification,
    onMessage: handleMessage,
    onPayment: handlePayment,
    onLead: handleLead,
    onAI: handleAI,
    onWorkflow: handleWorkflow,
  })

  // ── Sync connection status ──
  useEffect(() => {
    setIsConnected(wsConnected)
    setConnectionActive(wsConnected)
  }, [wsConnected])

  // ── Subscribe to per-channel counts reactively ──
  useEffect(() => {
    mountedRef.current = true

    const unsubs = [
      onChannelCountChange('notification', setNotifCount),
      onChannelCountChange('message', setMsgCount),
      onChannelCountChange('payment', setPayCount),
      onChannelCountChange('lead', setLeadCount),
      onChannelCountChange('ai', setAiCount),
      onChannelCountChange('workflow', setWfCount),
    ]

    return () => {
      mountedRef.current = false
      for (const unsub of unsubs) unsub()
    }
  }, [])

  // ── Event subscription API ──

  const on = useCallback((channel: string, handler: EventHandler): (() => void) => {
    return addListener(channel, { handler })
  }, [])

  const onType = useCallback((channel: string, type: string, handler: EventHandler): (() => void) => {
    return addListener(channel, { handler, type })
  }, [])

  // ── Memoized channel statuses ──

  const notifications = useMemo<ChannelStatus>(
    () => ({ connected: isConnected, eventCount: notifCount }),
    [isConnected, notifCount],
  )
  const messages = useMemo<ChannelStatus>(
    () => ({ connected: isConnected, eventCount: msgCount }),
    [isConnected, msgCount],
  )
  const payments = useMemo<ChannelStatus>(
    () => ({ connected: isConnected, eventCount: payCount }),
    [isConnected, payCount],
  )
  const leads = useMemo<ChannelStatus>(
    () => ({ connected: isConnected, eventCount: leadCount }),
    [isConnected, leadCount],
  )
  const ai = useMemo<ChannelStatus>(
    () => ({ connected: isConnected, eventCount: aiCount }),
    [isConnected, aiCount],
  )
  const workflows = useMemo<ChannelStatus>(
    () => ({ connected: isConnected, eventCount: wfCount }),
    [isConnected, wfCount],
  )

  // Only return live data when authenticated
  if (!isAuthenticated) {
    return {
      isConnected: false,
      lastEvent: null,
      notifications: { connected: false, eventCount: 0 },
      messages: { connected: false, eventCount: 0 },
      payments: { connected: false, eventCount: 0 },
      leads: { connected: false, eventCount: 0 },
      ai: { connected: false, eventCount: 0 },
      workflows: { connected: false, eventCount: 0 },
      on,
      onType,
    }
  }

  return {
    isConnected,
    lastEvent,
    notifications,
    messages,
    payments,
    leads,
    ai,
    workflows,
    on,
    onType,
  }
}

// ─── Exported Helpers ────────────────────────────────────────────────────────
// Other hooks can use these to subscribe without mounting useLiveUpdates.

export { addListener as subscribeToChannel, onConnectionChange, getChannelCount }
