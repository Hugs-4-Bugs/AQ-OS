'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeToChannel } from '@/hooks/use-live-updates'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import type { LiveEvent } from '@/hooks/use-live-updates'
import type { Lead, LeadStage } from '@/lib/types'

// ─── Event Types ─────────────────────────────────────────────────────────────

type LeadEventType =
  | 'lead_discovered'
  | 'lead_stage_changed'
  | 'lead_analysis_complete'
  | 'lead_score_updated'
  | 'lead_import_progress'
  | 'lead_export_progress'

// ─── Payload Shapes ──────────────────────────────────────────────────────────

interface LeadDiscoveredPayload {
  lead: Lead
  source?: string
  jobId?: string
}

interface LeadStageChangedPayload {
  leadId: string
  businessName?: string
  previousStage: LeadStage
  newStage: LeadStage
  changedBy?: string
}

interface LeadAnalysisCompletePayload {
  leadId: string
  businessName?: string
  analysisId?: string
  summary?: string
}

interface LeadScoreUpdatedPayload {
  leadId: string
  conversionScore?: number
  replyScore?: number
  urgencyScore?: number
  revenuePotentialScore?: number
  scoreReasoning?: string
}

interface LeadImportProgressPayload {
  jobId: string
  total: number
  processed: number
  imported: number
  duplicates: number
  failed: number
  status: 'running' | 'completed' | 'failed'
}

interface LeadExportProgressPayload {
  jobId: string
  total: number
  processed: number
  status: 'running' | 'completed' | 'failed'
  downloadUrl?: string
}

// ─── Hook Options ────────────────────────────────────────────────────────────

interface UseLiveLeadsOptions {
  /** Called when a new lead is discovered (useful for prepending to lists) */
  onLeadDiscovered?: (payload: LeadDiscoveredPayload) => void
  /** Called when a lead's stage changes (useful for pipeline animations) */
  onStageChanged?: (payload: LeadStageChangedPayload) => void
  /** Called when analysis completes for a lead */
  onAnalysisComplete?: (payload: LeadAnalysisCompletePayload) => void
  /** Called when a lead's score is updated */
  onScoreUpdated?: (payload: LeadScoreUpdatedPayload) => void
  /** Called with import progress updates */
  onImportProgress?: (payload: LeadImportProgressPayload) => void
  /** Called with export progress updates */
  onExportProgress?: (payload: LeadExportProgressPayload) => void
}

type UseLiveLeadsReturn = void

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLiveLeads(options: UseLiveLeadsOptions = {}): UseLiveLeadsReturn {
  const queryClient = useQueryClient()
  const { selectedLeadId, setSelectedLeadId } = useAppStore()

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

  const handleLeadEvent = useCallback(
    (event: LiveEvent) => {
      const { type, payload } = event

      // Don't block UI — run handler asynchronously
      queueMicrotask(() => {
        switch (type as LeadEventType) {
          // ─── Lead Discovered ──────────────────────────────────────────
          case 'lead_discovered': {
            const data = payload as unknown as LeadDiscoveredPayload
            const businessName = data.lead?.businessName ?? 'New Lead'

            // Prepend to leads list via TanStack Query cache update
            queryClient.setQueryData<{ leads: Lead[] } | undefined>(
              ['leads'],
              (old) => {
                if (!old?.leads) return old
                // Avoid duplicates
                if (old.leads.some((l) => l.id === data.lead.id)) return old
                return { ...old, leads: [data.lead, ...old.leads] }
              },
            )

            // Also invalidate pipeline queries so the kanban updates
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })

            // Show toast notification
            toast.success('New lead discovered', {
              description: businessName,
            })

            optionsRef.current.onLeadDiscovered?.(data)
            break
          }

          // ─── Lead Stage Changed ───────────────────────────────────────
          case 'lead_stage_changed': {
            const data = payload as unknown as LeadStageChangedPayload

            // Update the lead in cached lists
            queryClient.setQueryData<{ leads: Lead[] } | undefined>(
              ['leads'],
              (old) => {
                if (!old?.leads) return old
                return {
                  ...old,
                  leads: old.leads.map((l) =>
                    l.id === data.leadId
                      ? { ...l, stage: data.newStage }
                      : l,
                  ),
                }
              },
            )

            // Invalidate the individual lead detail if viewing that lead
            if (selectedLeadIdRef.current === data.leadId) {
              queryClient.invalidateQueries({ queryKey: ['leads', data.leadId] })
            }

            // Invalidate pipeline
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })

            // Show toast
            const name = data.businessName ?? 'Lead'
            toast.info(`${name} moved to ${data.newStage}`, {
              description: `From ${data.previousStage} → ${data.newStage}`,
            })

            optionsRef.current.onStageChanged?.(data)
            break
          }

          // ─── Lead Analysis Complete ───────────────────────────────────
          case 'lead_analysis_complete': {
            const data = payload as unknown as LeadAnalysisCompletePayload

            // Refresh lead detail if viewing that lead
            if (selectedLeadIdRef.current === data.leadId) {
              queryClient.invalidateQueries({ queryKey: ['leads', data.leadId] })
            }

            // Also refresh the leads list to update any analysis indicators
            queryClient.invalidateQueries({ queryKey: ['leads'] })

            const name = data.businessName ?? 'Lead'
            toast.success('Analysis complete', {
              description: `AI analysis finished for ${name}`,
            })

            optionsRef.current.onAnalysisComplete?.(data)
            break
          }

          // ─── Lead Score Updated ───────────────────────────────────────
          case 'lead_score_updated': {
            const data = payload as unknown as LeadScoreUpdatedPayload

            // Update score in cached leads list
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
                          ...(data.urgencyScore != null && { urgencyScore: data.urgencyScore }),
                          ...(data.revenuePotentialScore != null && { revenuePotentialScore: data.revenuePotentialScore }),
                          ...(data.scoreReasoning != null && { scoreReasoning: data.scoreReasoning }),
                        }
                      : l,
                  ),
                }
              },
            )

            // Refresh detail if viewing that lead
            if (selectedLeadIdRef.current === data.leadId) {
              queryClient.invalidateQueries({ queryKey: ['leads', data.leadId] })
            }

            optionsRef.current.onScoreUpdated?.(data)
            break
          }

          // ─── Import Progress ──────────────────────────────────────────
          case 'lead_import_progress': {
            const data = payload as unknown as LeadImportProgressPayload

            // When import completes, refresh leads list
            if (data.status === 'completed' || data.status === 'failed') {
              queryClient.invalidateQueries({ queryKey: ['leads'] })
              queryClient.invalidateQueries({ queryKey: ['pipeline'] })

              if (data.status === 'completed') {
                toast.success('Import complete', {
                  description: `${data.imported} leads imported, ${data.duplicates} duplicates skipped`,
                })
              } else {
                toast.error('Import failed', {
                  description: `Processed ${data.processed} of ${data.total} rows`,
                })
              }
            }

            optionsRef.current.onImportProgress?.(data)
            break
          }

          // ─── Export Progress ──────────────────────────────────────────
          case 'lead_export_progress': {
            const data = payload as unknown as LeadExportProgressPayload

            if (data.status === 'completed') {
              toast.success('Export complete', {
                description: `${data.total} leads exported`,
              })

              // Auto-download if URL provided
              if (data.downloadUrl && typeof window !== 'undefined') {
                window.open(data.downloadUrl, '_blank')
              }
            } else if (data.status === 'failed') {
              toast.error('Export failed')
            }

            optionsRef.current.onExportProgress?.(data)
            break
          }
        }
      })
    },
    [queryClient],
  )

  // ── Subscribe to lead events ──

  useEffect(() => {
    const unsub = subscribeToChannel('lead', { handler: handleLeadEvent })
    return unsub
  }, [handleLeadEvent])

  return {}
}

export type {
  UseLiveLeadsOptions,
  UseLiveLeadsReturn,
  LeadEventType,
  LeadDiscoveredPayload,
  LeadStageChangedPayload,
  LeadAnalysisCompletePayload,
  LeadScoreUpdatedPayload,
  LeadImportProgressPayload,
  LeadExportProgressPayload,
}
