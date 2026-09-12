# Task 5: UI Positioning Fix Agent

## Summary
Fixed two issues: broken `cn` function in QuickActionsFAB and floating element overlap between AI Chat Bubble and QuickActionsFAB.

## Changes Made

### 1. QuickActionsFAB (`src/components/dashboard/quick-actions-fab.tsx`)
- **Removed** local `cn` function (lines 140-142) that only did `classes.filter(Boolean).join(' ')`
- **Added** `import { cn } from '@/lib/utils'` for proper clsx + tailwind-merge class merging
- **Repositioned** from `fixed bottom-36 right-6 z-50` → `fixed bottom-20 right-20 z-[400]`

### 2. AI Chat Bubble (`src/components/dashboard/ai-chat-bubble.tsx`)
- **Bubble button**: Changed from `bottom-[4.5rem] right-4 sm:bottom-6 sm:right-6` → `bottom-16 right-4 sm:bottom-20 sm:right-6`
- **Panel mobile**: Changed from `bottom-0 max-h-[90vh]` → `bottom-16 max-h-[calc(90vh-4rem)]`
- **Panel desktop**: Changed from `lg:bottom-6` → `lg:bottom-20`

## Z-Index Coordination
- QuickActionsFAB: z-[400]
- AI Chat Bubble/Button: z-[450]
- AI Chat Panel: z-[450]
- Chat backdrop: z-[449]
