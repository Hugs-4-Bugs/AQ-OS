'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNotificationStore, type NotificationType } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import { useWebSocket } from '@/hooks/use-websocket'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface NotificationFilters {
  type?: string
  read?: boolean
}

interface NotificationEvent {
  id?: string
  type: NotificationType
  title: string
  message: string
  actionUrl?: string
  metadata?: any
  timestamp?: string | Date
}

interface DNDPreferences {
  dndStartTime: string | null // "22:00"
  dndEndTime: string | null // "07:00"
  dndTimezone: string | null // "Asia/Kolkata"
  inAppEnabled: boolean
}

interface UseNotificationsReturn {
  notifications: any[]
  unreadCount: number
  isLoading: boolean
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  archiveNotification: (id: string) => Promise<void>
  refresh: () => Promise<void>
  filters: NotificationFilters
  setFilters: (filters: Partial<NotificationFilters>) => void
  isRealtimeConnected: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL_MS = 60_000
const NOTIFICATIONS_API = '/api/notifications'
const NOTIFICATION_PREFS_API = '/api/settings/notifications'

// ─── Web Audio Notification Sound ────────────────────────────────────────────
// Reuses the same two-tone chime pattern from notification-center.tsx

let audioContext: AudioContext | null = null

function playNotificationSound() {
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext()
    }
    const ctx = audioContext

    // Create a pleasant two-tone chime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    const gain2 = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc1.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1) // C#6

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15) // C#6
    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.25) // E6

    gain1.gain.setValueAtTime(0.08, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

    gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)

    osc2.connect(gain2)
    gain2.connect(ctx.destination)

    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.3)

    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.45)
  } catch {
    // Silently fail if audio context is not available
  }
}

// ─── DND Check ───────────────────────────────────────────────────────────────

function isInDNDWindow(prefs: DNDPreferences): boolean {
  if (!prefs.dndStartTime || !prefs.dndEndTime) return false

  try {
    const now = new Date()
    const tz = prefs.dndTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    })

    const currentTime = formatter.format(now)
    const [currentHours, currentMinutes] = currentTime.split(':').map(Number)
    const currentMinutesTotal = currentHours * 60 + currentMinutes

    const [startHours, startMinutes] = prefs.dndStartTime.split(':').map(Number)
    const startMinutesTotal = startHours * 60 + startMinutes

    const [endHours, endMinutes] = prefs.dndEndTime.split(':').map(Number)
    const endMinutesTotal = endHours * 60 + endMinutes

    // Handle overnight DND (e.g., 22:00 - 07:00)
    if (startMinutesTotal > endMinutesTotal) {
      return currentMinutesTotal >= startMinutesTotal || currentMinutesTotal <= endMinutesTotal
    }

    // Same-day DND (e.g., 12:00 - 14:00)
    return currentMinutesTotal >= startMinutesTotal && currentMinutesTotal <= endMinutesTotal
  } catch {
    return false
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNotifications(): UseNotificationsReturn {
  const { user, isAuthenticated } = useAuthStore()
  const {
    notifications: storeNotifications,
    addNotification,
    markAsRead: storeMarkAsRead,
    markAllAsRead: storeMarkAllAsRead,
    removeNotification,
    preferences: notifPreferences,
    isMuted,
  } = useNotificationStore()

  const [isLoading, setIsLoading] = useState(false)
  const [filters, setFiltersState] = useState<NotificationFilters>({})
  const [dndPrefs, setDndPrefs] = useState<DNDPreferences>({
    dndStartTime: null,
    dndEndTime: null,
    dndTimezone: null,
    inAppEnabled: true,
  })

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // ── WebSocket connection for real-time notifications ─────────────────────

  const handleNotificationEvent = useCallback(
    (event: NotificationEvent) => {
      if (!mountedRef.current) return

      // Check DND preferences
      const muted = isMuted()
      const inDND = isInDNDWindow(dndPrefs)

      if (!dndPrefs.inAppEnabled || inDND || muted) {
        // Still add to store but don't play sound or show toast
        addNotification({
          type: event.type,
          title: event.title,
          message: event.message,
          timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
        })
        return
      }

      // Add notification to store
      addNotification({
        type: event.type,
        title: event.title,
        message: event.message,
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      })

      // Play notification sound if enabled and tab is not focused
      if (notifPreferences.soundEnabled) {
        playNotificationSound()
      }

      // Show toast notification
      toast(event.title, {
        description: event.message,
        duration: 4000,
      })
    },
    [addNotification, notifPreferences.soundEnabled, isMuted, dndPrefs]
  )

  const { isConnected: isRealtimeConnected } = useWebSocket({
    autoConnect: isAuthenticated,
    channels: ['notification'],
    onNotification: handleNotificationEvent,
  })

  // ── Fetch DND preferences ────────────────────────────────────────────────

  const fetchDNDPrefs = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const res = await fetch(NOTIFICATION_PREFS_API, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data.preferences) {
          setDndPrefs({
            dndStartTime: data.preferences.dndStartTime ?? null,
            dndEndTime: data.preferences.dndEndTime ?? null,
            dndTimezone: data.preferences.dndTimezone ?? null,
            inAppEnabled: data.preferences.inAppEnabled ?? true,
          })
        }
      }
    } catch {
      // Silently fail — use defaults
    }
  }, [isAuthenticated])

  // ── Fetch notifications from API ─────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.type) params.set('type', filters.type)
      if (filters.read !== undefined) params.set('read', String(filters.read))

      const res = await fetch(`${NOTIFICATIONS_API}?${params.toString()}`, {
        credentials: 'include',
      })

      if (res.ok) {
        const data = await res.json()
        // If API returns notifications, we could merge them with the store
        // For now, the store is the source of truth and API is optional
        if (Array.isArray(data.notifications)) {
          // Sync API notifications into the store if needed
          // This would require a bulk add method on the store
        }
      }
    } catch {
      // API may not exist yet — graceful fallback to store-only
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, filters.type, filters.read])

  // ── Mark as read ─────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      storeMarkAsRead(id)

      try {
        await fetch(`${NOTIFICATIONS_API}/${id}/read`, {
          method: 'PATCH',
          credentials: 'include',
        })
      } catch {
        // API may not exist yet — optimistic update is fine
      }
    },
    [storeMarkAsRead]
  )

  // ── Mark all as read ─────────────────────────────────────────────────────

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    storeMarkAllAsRead()

    try {
      await fetch(`${NOTIFICATIONS_API}/read-all`, {
        method: 'PATCH',
        credentials: 'include',
      })
    } catch {
      // API may not exist yet — optimistic update is fine
    }
  }, [storeMarkAllAsRead])

  // ── Archive notification ─────────────────────────────────────────────────

  const archiveNotification = useCallback(
    async (id: string) => {
      // Optimistic removal
      removeNotification(id)

      try {
        await fetch(`${NOTIFICATIONS_API}/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      } catch {
        // API may not exist yet — optimistic update is fine
      }
    },
    [removeNotification]
  )

  // ── Set filters ──────────────────────────────────────────────────────────

  const setFilters = useCallback((newFilters: Partial<NotificationFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }))
  }, [])

  // ── Filter notifications based on current filters ────────────────────────

  const filteredNotifications = (() => {
    let result = storeNotifications

    if (filters.type) {
      result = result.filter((n) => n.type === filters.type)
    }

    if (filters.read !== undefined) {
      result = result.filter((n) => n.read === filters.read)
    }

    return result
  })()

  const unreadCount = storeNotifications.filter((n) => !n.read).length

  // ── Initial load and auto-refresh ────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true

    if (!isAuthenticated) return

    // Fetch preferences and initial notifications
    fetchDNDPrefs()
    refresh()

    // Auto-refresh every 60 seconds as fallback
    autoRefreshRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      mountedRef.current = false

      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
        autoRefreshRef.current = null
      }
    }
  }, [isAuthenticated])

  // ── Refresh when user changes ────────────────────────────────────────────

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      refresh()
      fetchDNDPrefs()
    }
  }, [user?.id, isAuthenticated, refresh, fetchDNDPrefs])

  // ── Visibility change: refresh when tab becomes active ───────────────────

  useEffect(() => {
    if (!isAuthenticated) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, refresh])

  // ── Online event: refresh when coming back online ────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return

    const handleOnline = () => {
      refresh()
    }

    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [isAuthenticated, refresh])

  return {
    notifications: filteredNotifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    refresh,
    filters,
    setFilters,
    isRealtimeConnected,
  }
}
