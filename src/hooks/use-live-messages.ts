'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeToChannel } from '@/hooks/use-live-updates'
import { toast } from 'sonner'
import type { LiveEvent } from '@/hooks/use-live-updates'

// ─── Event Types ─────────────────────────────────────────────────────────────

type MessageEventType =
  | 'gmail_sync_complete'
  | 'gmail_thread_update'
  | 'telegram_delivery_status'
  | 'telegram_incoming_message'
  | 'whatsapp_sent'
  | 'whatsapp_delivered'
  | 'whatsapp_read'
  | 'whatsapp_failed'

// ─── Payload Shapes ──────────────────────────────────────────────────────────

interface GmailSyncCompletePayload {
  accountId: string
  email: string
  newThreads: number
  totalThreads: number
  duration?: number
}

interface GmailThreadUpdatePayload {
  threadId: string
  accountId: string
  subject?: string
  from?: string
  snippet?: string
  isRead?: boolean
  leadId?: string
  leadName?: string
}

interface TelegramDeliveryStatusPayload {
  messageId: string
  conversationId: string
  leadId?: string
  leadName?: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  error?: string
}

interface TelegramIncomingMessagePayload {
  messageId: string
  conversationId: string
  leadId?: string
  leadName?: string
  content: string
  from?: string
}

interface WhatsAppSentPayload {
  messageId: string
  conversationId: string
  leadId?: string
  leadName?: string
  phone: string
}

interface WhatsAppDeliveredPayload {
  messageId: string
  conversationId: string
  leadId?: string
  leadName?: string
  deliveredAt: string
}

interface WhatsAppReadPayload {
  messageId: string
  conversationId: string
  leadId?: string
  leadName?: string
  readAt: string
}

interface WhatsAppFailedPayload {
  messageId: string
  conversationId: string
  leadId?: string
  leadName?: string
  phone: string
  error: string
  errorCode?: string
}

// ─── Hook Options ────────────────────────────────────────────────────────────

interface UseLiveMessagesOptions {
  onGmailSyncComplete?: (payload: GmailSyncCompletePayload) => void
  onGmailThreadUpdate?: (payload: GmailThreadUpdatePayload) => void
  onTelegramDeliveryStatus?: (payload: TelegramDeliveryStatusPayload) => void
  onTelegramIncomingMessage?: (payload: TelegramIncomingMessagePayload) => void
  onWhatsAppSent?: (payload: WhatsAppSentPayload) => void
  onWhatsAppDelivered?: (payload: WhatsAppDeliveredPayload) => void
  onWhatsAppRead?: (payload: WhatsAppReadPayload) => void
  onWhatsAppFailed?: (payload: WhatsAppFailedPayload) => void
}

type UseLiveMessagesReturn = void

// ─── Helper: map delivery status to display label ────────────────────────────

function statusLabel(status: string): string {
  switch (status) {
    case 'sent': return 'Sent'
    case 'delivered': return 'Delivered'
    case 'read': return 'Read'
    case 'failed': return 'Failed'
    default: return status
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLiveMessages(options: UseLiveMessagesOptions = {}): UseLiveMessagesReturn {
  const queryClient = useQueryClient()
  const optionsRef = useRef(options)

  // Keep ref in sync without triggering re-renders in the event handler
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  // ── Event handler ──

  const handleMessageEvent = useCallback(
    (event: LiveEvent) => {
      const { type, payload } = event

      queueMicrotask(() => {
        switch (type as MessageEventType) {
          // ─── Gmail Sync Complete ──────────────────────────────────────
          case 'gmail_sync_complete': {
            const data = payload as unknown as GmailSyncCompletePayload

            // Refresh Gmail threads and status
            queryClient.invalidateQueries({ queryKey: ['gmail-threads'] })
            queryClient.invalidateQueries({ queryKey: ['gmail-status'] })
            queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] })

            toast.success('Gmail sync complete', {
              description: `${data.newThreads} new email${data.newThreads !== 1 ? 's' : ''} found`,
            })

            optionsRef.current.onGmailSyncComplete?.(data)
            break
          }

          // ─── Gmail Thread Update ──────────────────────────────────────
          case 'gmail_thread_update': {
            const data = payload as unknown as GmailThreadUpdatePayload

            // Refresh threads list so the new thread appears
            queryClient.invalidateQueries({ queryKey: ['gmail-threads'] })

            // If the updated thread is currently open, refresh it
            queryClient.invalidateQueries({ queryKey: ['gmail-thread', data.threadId] })

            // Show toast for new emails
            const fromLabel = data.from ?? 'Unknown sender'
            const subjectLabel = data.subject ?? 'No subject'
            toast.info('New email', {
              description: `${fromLabel}: ${subjectLabel}`,
            })

            optionsRef.current.onGmailThreadUpdate?.(data)
            break
          }

          // ─── Telegram Delivery Status ────────────────────────────────
          case 'telegram_delivery_status': {
            const data = payload as unknown as TelegramDeliveryStatusPayload

            // Refresh conversations to update status badge
            queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] })
            queryClient.invalidateQueries({ queryKey: ['messaging-messages', data.conversationId] })

            if (data.status === 'failed') {
              toast.error('Telegram message failed', {
                description: data.error ?? 'Delivery failed',
              })
            }

            optionsRef.current.onTelegramDeliveryStatus?.(data)
            break
          }

          // ─── Telegram Incoming Message ────────────────────────────────
          case 'telegram_incoming_message': {
            const data = payload as unknown as TelegramIncomingMessagePayload

            // Refresh conversation lists and messages
            queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] })
            queryClient.invalidateQueries({ queryKey: ['messaging-messages', data.conversationId] })

            const name = data.leadName ?? data.from ?? 'Telegram'
            toast.info('New Telegram message', {
              description: `From ${name}: ${data.content.slice(0, 60)}${data.content.length > 60 ? '...' : ''}`,
            })

            optionsRef.current.onTelegramIncomingMessage?.(data)
            break
          }

          // ─── WhatsApp Sent ────────────────────────────────────────────
          case 'whatsapp_sent': {
            const data = payload as unknown as WhatsAppSentPayload

            queryClient.invalidateQueries({ queryKey: ['messaging-conversations'] })
            queryClient.invalidateQueries({ queryKey: ['messaging-messages', data.conversationId] })

            optionsRef.current.onWhatsAppSent?.(data)
            break
          }

          // ─── WhatsApp Delivered ───────────────────────────────────────
          case 'whatsapp_delivered': {
            const data = payload as unknown as WhatsAppDeliveredPayload

            // Update message status badge
            queryClient.invalidateQueries({ queryKey: ['messaging-messages', data.conversationId] })

            optionsRef.current.onWhatsAppDelivered?.(data)
            break
          }

          // ─── WhatsApp Read ────────────────────────────────────────────
          case 'whatsapp_read': {
            const data = payload as unknown as WhatsAppReadPayload

            queryClient.invalidateQueries({ queryKey: ['messaging-messages', data.conversationId] })

            const name = data.leadName ?? 'Recipient'
            toast.success(`${name} read your message`)

            optionsRef.current.onWhatsAppRead?.(data)
            break
          }

          // ─── WhatsApp Failed ──────────────────────────────────────────
          case 'whatsapp_failed': {
            const data = payload as unknown as WhatsAppFailedPayload

            queryClient.invalidateQueries({ queryKey: ['messaging-messages', data.conversationId] })

            toast.error('WhatsApp message failed', {
              description: data.error ?? `Failed to deliver to ${data.phone}`,
            })

            optionsRef.current.onWhatsAppFailed?.(data)
            break
          }
        }
      })
    },
    [queryClient],
  )

  // ── Subscribe to message events ──

  useEffect(() => {
    const unsub = subscribeToChannel('message', { handler: handleMessageEvent })
    return unsub
  }, [handleMessageEvent])

  return {}
}

export type {
  UseLiveMessagesOptions,
  UseLiveMessagesReturn,
  MessageEventType,
  GmailSyncCompletePayload,
  GmailThreadUpdatePayload,
  TelegramDeliveryStatusPayload,
  TelegramIncomingMessagePayload,
  WhatsAppSentPayload,
  WhatsAppDeliveredPayload,
  WhatsAppReadPayload,
  WhatsAppFailedPayload,
}
