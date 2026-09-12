'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/lib/auth-store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseWebSocketOptions {
  autoConnect?: boolean
  channels?: string[]
  onNotification?: (event: any) => void
  onMessage?: (event: any) => void
  onPayment?: (event: any) => void
  onLead?: (event: any) => void
  onAI?: (event: any) => void
  onWorkflow?: (event: any) => void
}

interface UseWebSocketReturn {
  isConnected: boolean
  connectionCount: number
  subscribe: (channels: string[]) => void
  unsubscribe: (channels: string[]) => void
  reconnect: () => void
  replay: (lastEventId?: string, channels?: string[]) => Promise<any[]>
  lastEvent: any | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const MAX_RECONNECT_ATTEMPTS = 10
const INITIAL_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000

// ─── Singleton Manager ──────────────────────────────────────────────────────
// Prevents duplicate connections for the same user across hook instances

const socketInstances = new Map<string, Socket>()
const socketRefCount = new Map<string, number>()

function getSocketKey(userId: string): string {
  return `ws:${userId}`
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    channels: initialChannels = [],
    onNotification,
    onMessage,
    onPayment,
    onLead,
    onAI,
    onWorkflow,
  } = options

  const { user, isAuthenticated } = useAuthStore()

  const [isConnected, setIsConnected] = useState(false)
  const [connectionCount, setConnectionCount] = useState(0)
  const [lastEvent, setLastEvent] = useState<any>(null)

  const socketRef = useRef<Socket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const subscribedChannelsRef = useRef<Set<string>>(new Set(initialChannels))
  const lastEventIdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const scheduleReconnectFnRef = useRef<(socket: Socket) => void>(() => {})

  // ── Calculate exponential backoff delay ──────────────────────────────────

  const getReconnectDelay = useCallback((attempt: number): number => {
    const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, attempt)
    return Math.min(delay, MAX_RECONNECT_DELAY_MS)
  }, [])

  // ── Heartbeat: send ping, expect pong ────────────────────────────────────

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current)
      heartbeatTimeoutRef.current = null
    }
  }, [])

  const startHeartbeat = useCallback((socket: Socket) => {
    stopHeartbeat()

    heartbeatIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        const sentAt = Date.now()
        socket.emit('ping', { sentAt })

        // Set timeout for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          // No pong received — force disconnect so reconnect kicks in
          if (mountedRef.current && socket.connected) {
            socket.disconnect()
          }
        }, HEARTBEAT_TIMEOUT_MS)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }, [stopHeartbeat])

  // ── Event handlers ───────────────────────────────────────────────────────

  const handleEvent = useCallback(
    (channel: string, data: any) => {
      if (!mountedRef.current) return

      setLastEvent({ channel, data, timestamp: Date.now() })

      // Track event ID for replay
      if (data?.id) {
        lastEventIdRef.current = data.id
      }

      // Route to appropriate callback
      switch (channel) {
        case 'notification':
          onNotification?.(data)
          break
        case 'message':
          onMessage?.(data)
          break
        case 'payment':
          onPayment?.(data)
          break
        case 'lead':
          onLead?.(data)
          break
        case 'ai':
          onAI?.(data)
          break
        case 'workflow':
          onWorkflow?.(data)
          break
      }
    },
    [onNotification, onMessage, onPayment, onLead, onAI, onWorkflow]
  )

  // ── Subscribe / Unsubscribe ──────────────────────────────────────────────

  const subscribe = useCallback(
    (channels: string[]) => {
      const socket = socketRef.current
      if (!socket?.connected) {
        // Queue subscriptions for when we connect
        for (const ch of channels) {
          subscribedChannelsRef.current.add(ch)
        }
        return
      }

      for (const ch of channels) {
        if (!subscribedChannelsRef.current.has(ch)) {
          subscribedChannelsRef.current.add(ch)
          socket.emit('subscribe', { channel: ch })
        }
      }
    },
    []
  )

  const unsubscribe = useCallback(
    (channels: string[]) => {
      const socket = socketRef.current
      if (!socket?.connected) {
        for (const ch of channels) {
          subscribedChannelsRef.current.delete(ch)
        }
        return
      }

      for (const ch of channels) {
        if (subscribedChannelsRef.current.has(ch)) {
          subscribedChannelsRef.current.delete(ch)
          socket.emit('unsubscribe', { channel: ch })
        }
      }
    },
    []
  )

  // ── Manual reconnect ─────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    const socket = socketRef.current
    if (socket) {
      socket.disconnect()
      socket.connect()
    }
  }, [])

  // ── Event replay ─────────────────────────────────────────────────────────

  const replay = useCallback(
    async (lastEventId?: string, channels?: string[]): Promise<any[]> => {
      const socket = socketRef.current
      if (!socket?.connected) return []

      const eid = lastEventId ?? lastEventIdRef.current
      const chs = channels ?? Array.from(subscribedChannelsRef.current)

      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve([]), 10_000)

        socket.emit('replay', { lastEventId: eid, channels: chs }, (response: any) => {
          clearTimeout(timeout)
          const events = Array.isArray(response) ? response : response?.events ?? []
          resolve(events)
        })
      })
    },
    []
  )

  // ── Schedule reconnect with exponential backoff ──────────────────────────
  // Uses a ref to avoid self-reference issues with useCallback

  const scheduleReconnect = useCallback(
    (socket: Socket) => {
      if (!mountedRef.current) return
      if (!isAuthenticated) return

      // Check if browser is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Wait for online event instead
        const handleOnline = () => {
          window.removeEventListener('online', handleOnline)
          reconnectAttemptRef.current = 0
          socket.connect()
        }
        window.addEventListener('online', handleOnline)
        return
      }

      reconnectAttemptRef.current += 1

      if (reconnectAttemptRef.current > MAX_RECONNECT_ATTEMPTS) {
        // Max attempts reached — user must manually reconnect
        return
      }

      const delay = getReconnectDelay(reconnectAttemptRef.current - 1)

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current && isAuthenticated) {
          socket.connect()
        }
      }, delay)
    },
    [isAuthenticated, getReconnectDelay]
  )

  // Keep ref updated for use inside callbacks
  useEffect(() => {
    scheduleReconnectFnRef.current = scheduleReconnect
  }, [scheduleReconnect])

  // ── Disconnect when not authenticated ─────────────────────────────────────

  useEffect(() => {
    if (!autoConnect || !isAuthenticated || !user?.id) {
      // Clean up existing connection
      if (socketRef.current) {
        const key = getSocketKey(user?.id ?? 'anonymous')
        const refCount = (socketRefCount.get(key) ?? 1) - 1
        if (refCount <= 0) {
          socketRef.current.disconnect()
          socketInstances.delete(key)
          socketRefCount.delete(key)
        } else {
          socketRefCount.set(key, refCount)
        }
        socketRef.current = null
      }
      // Schedule state update via microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        if (mountedRef.current) {
          setIsConnected(false)
        }
      })
    }
  }, [autoConnect, isAuthenticated, user?.id])

  // ── Main connection effect ───────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true

    if (!autoConnect || !isAuthenticated || !user?.id) {
      return
    }

    const userId = user.id
    const socketKey = getSocketKey(userId)

    // ── Singleton: reuse existing socket for the same user ───────────────
    let socket: Socket

    if (socketInstances.has(socketKey)) {
      socket = socketInstances.get(socketKey)!
      socketRefCount.set(socketKey, (socketRefCount.get(socketKey) ?? 0) + 1)
    } else {
      socket = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        forceNew: false,
        reconnection: false, // We handle reconnection ourselves
        timeout: 10_000,
        auth: {
          userId,
        },
      })
      socketInstances.set(socketKey, socket)
      socketRefCount.set(socketKey, 1)
    }

    socketRef.current = socket

    // ── Connection events ────────────────────────────────────────────────

    const onConnect = () => {
      if (!mountedRef.current) return

      reconnectAttemptRef.current = 0
      setIsConnected(true)
      setConnectionCount((c) => c + 1)

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      // Start heartbeat
      startHeartbeat(socket)

      // Re-subscribe to channels
      if (subscribedChannelsRef.current.size > 0) {
        for (const ch of subscribedChannelsRef.current) {
          socket.emit('subscribe', { channel: ch })
        }
      }

      // Request event replay if we have a last event ID
      if (lastEventIdRef.current) {
        socket.emit('replay', {
          lastEventId: lastEventIdRef.current,
          channels: Array.from(subscribedChannelsRef.current),
        })
      }
    }

    const onDisconnect = (reason: Socket.DisconnectReason) => {
      if (!mountedRef.current) return

      setIsConnected(false)
      stopHeartbeat()

      // Don't attempt reconnect if we explicitly disconnected or if auth is gone
      if (reason === 'io client disconnect') return
      if (!isAuthenticated) return

      scheduleReconnectFnRef.current(socket)
    }

    const onConnectError = (_err: Error) => {
      if (!mountedRef.current) return

      setIsConnected(false)
      stopHeartbeat()

      scheduleReconnectFnRef.current(socket)
    }

    // ── Channel event handlers ───────────────────────────────────────────

    const onPong = () => {
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current)
        heartbeatTimeoutRef.current = null
      }
    }

    const onChannelEvent = (data: { channel: string; payload: any }) => {
      handleEvent(data.channel, data.payload)
    }

    // Direct channel events
    const onNotificationEvent = (data: any) => handleEvent('notification', data)
    const onMessageEvent = (data: any) => handleEvent('message', data)
    const onPaymentEvent = (data: any) => handleEvent('payment', data)
    const onLeadEvent = (data: any) => handleEvent('lead', data)
    const onAIEvent = (data: any) => handleEvent('ai', data)
    const onWorkflowEvent = (data: any) => handleEvent('workflow', data)

    // ── Attach listeners ─────────────────────────────────────────────────

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('pong', onPong)
    socket.on('channel:event', onChannelEvent)
    socket.on('notification', onNotificationEvent)
    socket.on('message', onMessageEvent)
    socket.on('payment', onPaymentEvent)
    socket.on('lead', onLeadEvent)
    socket.on('ai', onAIEvent)
    socket.on('workflow', onWorkflowEvent)

    // Connect if not already connected
    if (!socket.connected) {
      socket.connect()
    } else {
      // Already connected (singleton reuse) — trigger connect handlers via microtask
      queueMicrotask(() => {
        if (mountedRef.current) {
          onConnect()
        }
      })
    }

    // ── Subscribe to initial channels ────────────────────────────────────

    if (initialChannels.length > 0) {
      subscribe(initialChannels)
    }

    // ── Cleanup ──────────────────────────────────────────────────────────

    return () => {
      mountedRef.current = false

      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('pong', onPong)
      socket.off('channel:event', onChannelEvent)
      socket.off('notification', onNotificationEvent)
      socket.off('message', onMessageEvent)
      socket.off('payment', onPaymentEvent)
      socket.off('lead', onLeadEvent)
      socket.off('ai', onAIEvent)
      socket.off('workflow', onWorkflowEvent)

      stopHeartbeat()

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      // Decrement ref count and potentially disconnect singleton
      const refCount = (socketRefCount.get(socketKey) ?? 1) - 1
      if (refCount <= 0) {
        socket.disconnect()
        socketInstances.delete(socketKey)
        socketRefCount.delete(socketKey)
      } else {
        socketRefCount.set(socketKey, refCount)
      }

      socketRef.current = null
    }
  }, [isAuthenticated, user?.id, autoConnect])

  return {
    isConnected,
    connectionCount,
    subscribe,
    unsubscribe,
    reconnect,
    replay,
    lastEvent,
  }
}
