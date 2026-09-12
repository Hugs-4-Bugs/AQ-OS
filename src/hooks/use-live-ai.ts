'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeToChannel } from '@/hooks/use-live-updates'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import type { LiveEvent } from '@/hooks/use-live-updates'
import type { Lead } from '@/lib/types'

// ─── Event Types ─────────────────────────────────────────────────────────────

type AIEventType =
  | 'ai_analysis_complete'
  | 'ai_scoring_complete'
  | 'ai_outreach_generated'

// ─── Payload Shapes ──────────────────────────────────────────────────────────

interface AIAnalysisCompletePayload {
  leadId: string
  businessName?: string
  analysisId?: string
  /** Key findings from the analysis */
  summary?: string
  /** Overall opportunity score (0-100) */
  opportunityScore?: number
  /** Identified strengths */
  strengths?: string[]
  /** Identified weaknesses / pain points */
  weaknesses?: string[]
  /** Recommended outreach approach */
  bestApproach?: string
  /** Credits consumed for this analysis */
  creditsUsed?: number
  /** Remaining credit balance */
  creditBalance?: number
}

interface AIScoringCompletePayload {
  leadId: string
  businessName?: string
  /** Lead quality score (0-100) */
  leadQuality?: number
  /** Purchase probability score (0-100) */
  purchaseProbability?: number
  /** Outreach priority score (0-100) */
  outreachPriority?: number
  /** Website quality score (0-100) */
  websiteQuality?: number
  /** Digital maturity score (0-100) */
  digitalMaturity?: number
  /** AI confidence level (0-100) */
  aiConfidence?: number
  /** Positive scoring factors */
  positiveFactors?: string[]
  /** Negative scoring factors */
  negativeFactors?: string[]
  /** Updated conversion score */
  conversionScore?: number
  /** Updated reply score */
  replyScore?: number
  /** Credits consumed */
  creditsUsed?: number
  /** Remaining credit balance */
  creditBalance?: number
}

interface AIOutreachGeneratedPayload {
  leadId: string
  businessName?: string
  outreachId?: string
  /** Channel the outreach is for */
  channel: 'email' | 'whatsapp' | 'linkedin' | 'telegram' | 'instagram'
  /** Tone of the generated message */
  tone?: string
  /** Subject line (for email) */
  subject?: string
  /** Main message body */
  message: string
  /** Personalization points used */
  personalizationPoints?: string[]
  /** Estimated reply rate */
  estimatedReplyRate?: number
  /** Credits consumed */
  creditsUsed?: number
  /** Remaining credit balance */
  creditBalance?: number
}

// ─── Hook Options ────────────────────────────────────────────────────────────

interface UseLiveAIOptions {
  onAnalysisComplete?: (payload: AIAnalysisCompletePayload) => void
  onScoringComplete?: (payload: AIScoringCompletePayload) => void
  onOutreachGenerated?: (payload: AIOutreachGeneratedPayload) => void
}

type UseLiveAIReturn = void

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLiveAI(options: UseLiveAIOptions = {}): UseLiveAIReturn {
  const queryClient = useQueryClient()
  const { selectedLeadId } = useAppStore()

  const optionsRef = useRef(options)
  const selectedLeadIdRef = useRef(selectedLeadId)

  // Keep refs in sync without triggering re-renders in the event handler
  useEffect(() => {
    optionsRef.current = options
  }, [options])
  useEffect(() => {
    selectedLeadIdRef.current = selectedLeadId
  }, [selectedLeadId])

  // ── Event handler ──

  const handleAIEvent = useCallback(
    (event: LiveEvent) => {
      const { type, payload } = event

      queueMicrotask(() => {
        switch (type as AIEventType) {
          // ─── AI Analysis Complete ─────────────────────────────────────
          case 'ai_analysis_complete': {
            const data = payload as unknown as AIAnalysisCompletePayload

            // Refresh lead detail if currently viewing this lead
            if (selectedLeadIdRef.current === data.leadId) {
              queryClient.invalidateQueries({ queryKey: ['leads', data.leadId] })
            }

            // Refresh the leads list to show updated analysis indicators
            queryClient.invalidateQueries({ queryKey: ['leads'] })

            const name = data.businessName ?? 'Lead'
            toast.success('AI analysis complete', {
              description: `Analysis finished for ${name}`,
            })

            // Show credit usage if available
            if (data.creditBalance != null && data.creditBalance <= 5 && data.creditBalance > 0) {
              toast.warning('Credits running low', {
                description: `${data.creditBalance} credits remaining`,
              })
            }

            optionsRef.current.onAnalysisComplete?.(data)
            break
          }

          // ─── AI Scoring Complete ──────────────────────────────────────
          case 'ai_scoring_complete': {
            const data = payload as unknown as AIScoringCompletePayload

            // Update the lead's scores in the cached leads list
            queryClient.setQueryData<{ leads: Lead[] } | undefined>(
              ['leads'],
              (old) => {
                if (!old?.leads) return old
                return {
                  ...old,
                  leads: old.leads.map((l) =>
                    l.id === data.leadId
                      ? {
                          ...l,
                          ...(data.conversionScore != null && { conversionScore: data.conversionScore }),
                          ...(data.replyScore != null && { replyScore: data.replyScore }),
                        }
                      : l,
                  ),
                }
              },
            )

            // Refresh lead detail if viewing this lead
            if (selectedLeadIdRef.current === data.leadId) {
              queryClient.invalidateQueries({ queryKey: ['leads', data.leadId] })
            }

            const name = data.businessName ?? 'Lead'
            toast.success('Scoring complete', {
              description: `AI scores updated for ${name}`,
            })

            optionsRef.current.onScoringComplete?.(data)
            break
          }

          // ─── AI Outreach Generated ────────────────────────────────────
          case 'ai_outreach_generated': {
            const data = payload as unknown as AIOutreachGeneratedPayload

            // Refresh lead detail to show the new outreach in the activity
            if (selectedLeadIdRef.current === data.leadId) {
              queryClient.invalidateQueries({ queryKey: ['leads', data.leadId] })
            }

            // Refresh leads list (outreach activity might affect display)
            queryClient.invalidateQueries({ queryKey: ['leads'] })

            const name = data.businessName ?? 'Lead'
            const channelLabel = data.channel.charAt(0).toUpperCase() + data.channel.slice(1)
            toast.success('Outreach ready', {
              description: `${channelLabel} message generated for ${name}`,
            })

            optionsRef.current.onOutreachGenerated?.(data)
            break
          }
        }
      })
    },
    [queryClient],
  )

  // ── Subscribe to AI events ──

  useEffect(() => {
    const unsub = subscribeToChannel('ai', { handler: handleAIEvent })
    return unsub
  }, [handleAIEvent])

  return {}
}

export type {
  UseLiveAIOptions,
  UseLiveAIReturn,
  AIEventType,
  AIAnalysisCompletePayload,
  AIScoringCompletePayload,
  AIOutreachGeneratedPayload,
}
