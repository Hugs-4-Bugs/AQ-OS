# Task ID: 2 — Rebrand & Design System Agent

## Task
Rebrand from "Vantage" to "AcquisitionOS" and update the design system colors from emerald to purple.

## Summary of Changes

### Files Modified
1. **`/src/app/globals.css`** — Complete rewrite of all CSS custom properties and custom classes
   - All `oklch(... 162.48)` (emerald hue) → `oklch(... 280)` (purple hue)
   - Primary chroma: 0.17 → 0.22
   - Dark mode backgrounds updated to match #0A0A0F, #111118, #16161F specs
   - Added AcquisitionOS Design System custom variables
   - Added `--color-accent-cyan` for cyan accent
   - All custom CSS classes updated from emerald to purple
   - New canonical class names: `primary-accent-line`, `stat-card-gradient-primary`, `badge-gradient-primary`, `row-hover-primary`
   - Old class names kept as aliases for backward compatibility
   - All oklch alpha uses decimal format (not percentage) to avoid lightningcss crash

2. **`/src/app/layout.tsx`** — Brand & meta updates
   - Title, description, keywords, theme-color, OG, Twitter meta all updated
   - "Vantage" → "AcquisitionOS", "AI Market Intelligence" → "AI-Powered Client Acquisition System"

3. **`/src/components/dashboard/dashboard-layout.tsx`** — Brand, icon, version
   - Crosshair → Rocket icon import
   - All "Vantage" text → "AcquisitionOS"
   - "v2.1.0" → "v3.0.0"
   - `emerald-accent-line` → `primary-accent-line`
   - Footer tagline updated

4. **`/src/lib/types.ts`** — File header comment updated

5. **`/src/components/dashboard/settings-panel.tsx`** — Dialog description updated

### Key Color Mappings
| Element | Old (Emerald) | New (Purple) |
|---------|--------------|--------------|
| Primary | oklch(0.527 0.17 162.48) | oklch(0.527 0.22 280) |
| Dark Primary | oklch(0.696 0.17 162.48) | oklch(0.527 0.22 280) |
| Accent Cyan | N/A | oklch(0.75 0.15 210) |
| Success | N/A | oklch(0.72 0.19 155) |
| Warning | N/A | oklch(0.85 0.18 90) |
| Danger | oklch(0.704 0.191 22.216) | oklch(0.6 0.25 15) |
| Dark BG | oklch(0.1 0.012 162.48) | oklch(0.06 0.01 280) |

### Lint Status
- 0 errors, 1 warning (pre-existing TanStack Table warning)

### Notes for Future Agents
- Old CSS class names (`emerald-accent-line`, `stat-card-gradient-emerald`, etc.) still work but render purple — they're aliases for the new primary classes
- Tailwind utility classes like `text-emerald-500` in components still use green (semantic meaning for success/money) and were NOT changed as part of this rebrand
- The `--color-accent-cyan` Tailwind color is now available as `text-accent-cyan`, `bg-accent-cyan`, etc.
