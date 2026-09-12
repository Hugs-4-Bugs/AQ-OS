'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseSSEOptions {
  url: string
  lastEventId?: string
  onEvent?: (event: any) => void
  onError?: (error: any) => void
  enabled?: boolean
}

interface UseSSEReturn {
  isConnected: boolean
  lastEvent: any | null
  lastEventId: string | null
  reconnect: () => void
  eventCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_SSE_RETRIES = 5
const INITIAL_SSE_RETRY_DELAY_MS = 1_000
const MAX_SSE_RETRY_DELAY_MS = 30_000

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const { url, lastEventId: initialLastEventId, onEvent, onError, enabled = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<any>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(initialLastEventId ?? null)
  const [eventCount, setEventCount] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const currentLastEventIdRef = useRef<string | null>(initialLastEventId ?? null)
  const connectFnRef = useRef<() => void>(() => {})

  // ── Calculate exponential backoff delay ──────────────────────────────────

  const getRetryDelay = useCallback((attempt: number): number => {
    const delay = INITIAL_SSE_RETRY_DELAY_MS * Math.pow(2, attempt)
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 500
    return Math.min(delay + jitter, MAX_SSE_RETRY_DELAY_MS)
  }, [])

  // ── Close existing EventSource ───────────────────────────────────────────

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  // ── Schedule reconnect with exponential backoff ──────────────────────────

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return

    // Check if we should retry
    if (retryCountRef.current >= MAX_SSE_RETRIES) {
      return
    }

    // Check if browser is offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const handleOnline = () => {
        window.removeEventListener('online', handleOnline)
        retryCountRef.current = 0
        connectFnRef.current()
      }
      window.addEventListener('online', handleOnline)
      return
    }

    // Schedule reconnect with exponential backoff
    retryCountRef.current += 1
    const delay = getRetryDelay(retryCountRef.current - 1)

    retryTimerRef.current = setTimeout(() => {
      if (mountedRef.current && enabled) {
        connectFnRef.current()
      }
    }, delay)
  }, [enabled, getRetryDelay])

  // ── Connect to SSE ──────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return

    // Close any existing connection
    closeEventSource()

    // Build URL with Last-Event-ID for resume
    let sseUrl = url
    const eid = currentLastEventIdRef.current
    if (eid) {
      // EventSource doesn't support headers, so we pass Last-Event-ID as query param
      // The server should check both the header and the query param
      const separator = sseUrl.includes('?') ? '&' : '?'
      sseUrl = `${sseUrl}${separator}lastEventId=${encodeURIComponent(eid)}`
    }

    try {
      const eventSource = new EventSource(sseUrl, {
        withCredentials: true, // Send cookies for auth
      })
      eventSourceRef.current = eventSource

      // ── Connection opened ────────────────────────────────────────────

      eventSource.onopen = () => {
        if (!mountedRef.current) return

        retryCountRef.current = 0
        setIsConnected(true)
      }

      // ── Generic message handler ──────────────────────────────────────

      eventSource.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return

        // Track event ID for resume
        if (event.lastEventId) {
          currentLastEventIdRef.current = event.lastEventId
          setLastEventId(event.lastEventId)
        }

        let data: any
        try {
          data = JSON.parse(event.data)
        } catch {
          data = event.data
        }

        setLastEvent(data)
        setEventCount((c) => c + 1)
        onEvent?.(data)
      }

      // ── Error handler ────────────────────────────────────────────────

      eventSource.onerror = () => {
        if (!mountedRef.current) return

        setIsConnected(false)
        onError?.(new Error('SSE connection error'))

        // Close the current connection
        eventSource.close()
        eventSourceRef.current = null

        // Schedule reconnect via ref (avoids self-reference issue)
        scheduleReconnect()
      }

      // ── Named event handlers ─────────────────────────────────────────
      // Support common SSE event types for AcquisitionOS

      const namedEvents = [
        'notification',
        'payment',
        'lead',
        'ai',
        'workflow',
        'credit',
        'system',
      ]

      for (const eventName of namedEvents) {
        eventSource.addEventListener(eventName, (event: MessageEvent) => {
          if (!mountedRef.current) return

          if (event.lastEventId) {
            currentLastEventIdRef.current = event.lastEventId
            setLastEventId(event.lastEventId)
          }

          let data: any
          try {
            data = JSON.parse(event.data)
          } catch {
            data = event.data
          }

          const payload = { type: eventName, ...data }
          setLastEvent(payload)
          setEventCount((c) => c + 1)
          onEvent?.(payload)
        })
      }
    } catch (err) {
      if (!mountedRef.current) return
      onError?.(err)
    }
  }, [url, enabled, onEvent, onError, closeEventSource, scheduleReconnect])

  // Keep the ref updated so scheduleReconnect always calls the latest version
  useEffect(() => {
    connectFnRef.current = connect
  }, [connect])

  // ── Manual reconnect ─────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    retryCountRef.current = 0
    connect()
  }, [connect])

  // ── Connection lifecycle ─────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true

    if (!enabled) {
      closeEventSource()
      queueMicrotask(() => {
        if (mountedRef.current) {
          setIsConnected(false)
        }
      })
      return
    }

    connect()

    return () => {
      mountedRef.current = false
      closeEventSource()
    }
  }, [enabled, connect, closeEventSource])

  // ── Update lastEventId from prop ─────────────────────────────────────────
  // Use ref-only tracking to avoid synchronous setState in effect

  useEffect(() => {
    if (initialLastEventId && !currentLastEventIdRef.current) {
      currentLastEventIdRef.current = initialLastEventId
    }
  }, [initialLastEventId])

  return {
    isConnected,
    lastEvent,
    lastEventId,
    reconnect,
    eventCount,
  }
}
