/**
 * NAVBAR-SAFE MODAL POSITIONING - responsive fix (2026-09-20)
 *
 * The shared DialogContent vertically centers dialogs, which made the
 * Choose Your Plan and Create API Key modals start BEHIND the sticky
 * navbar (z-[100] above the z-50 dialog) whenever the dialog was taller
 * than the viewport, clipping the title/close button at the top and the
 * content at the bottom.
 *
 * Instead of hardcoding a top offset, the two modals measure the REAL
 * chrome at open time and expose two CSS custom properties on the dialog
 * node itself:
 *
 *   --aos-modal-top   top edge  = visible header bottom + 12px safe gap
 *   --aos-modal-maxh  max height = (bottom chrome top - 12px gap) - top
 *
 * The app header is pushed down by any full-width banner above it (e.g.
 * the trial banner), so measuring the header's rect covers every banner
 * state. The mobile/tablet bottom nav (below lg) and the desktop footer
 * are both treated as bottom chrome. Re-applied on window resize so the
 * dialog follows breakpoint changes while it stays open.
 *
 * Presentation-only: no dialog data, logic, or other components change.
 * Consumed via:
 *   top-[var(--aos-modal-top,60px)]!
 *   max-h-[var(--aos-modal-maxh,calc(100dvh-145px))]
 */
export function applyModalSafeArea(node: HTMLElement): () => void {
  const apply = () => {
    const vis = (el: Element | null): el is HTMLElement =>
      !!el && (el as HTMLElement).offsetHeight > 0;
    // Top chrome: first VISIBLE header (the mobile one is display:none on
    // desktop and vice versa). Its bottom edge already includes any banner
    // rendered above it in the flex column.
    const header =
      Array.from(document.querySelectorAll('[role="banner"]')).find(vis) ??
      null;
    const bottomNav = document.querySelector('[aria-label="Mobile navigation"]');
    const footer = document.querySelector('[role="contentinfo"]');
    const TOP_GAP = 12;
    const BOTTOM_GAP = 12;
    const top = header
      ? Math.round(header.getBoundingClientRect().bottom) + TOP_GAP
      : TOP_GAP + 56;
    const bn = vis(bottomNav) ? bottomNav.getBoundingClientRect() : null;
    const fr = vis(footer) ? footer.getBoundingClientRect() : null;
    // Bottom chrome = whichever of (bottom nav, footer, viewport edge) is
    // highest. The viewport edge hard-cap keeps the dialog inside the
    // screen even if a bottom bar were misdetected (or on odd window
    // shapes), so the dialog can never spill past the visible area.
    const hardBottom = Math.min(
      bn ? bn.top : Number.POSITIVE_INFINITY,
      fr ? fr.top : Number.POSITIVE_INFINITY,
      window.innerHeight - 4,
    );
    const bottomLimit = Number.isFinite(hardBottom)
      ? Math.round(hardBottom) - BOTTOM_GAP
      : window.innerHeight - BOTTOM_GAP;
    // No 240px floor: a floor larger than the real available space
    // (landscape phones, short desktop windows) re-introduces exactly the
    // bottom-clipping / bottom-nav overlap this helper exists to prevent.
    // 96px is a last-resort usability floor that only engages below real
    // device minimums; on every actual viewport the dialog is bounded by
    // the measured space instead.
    const maxH = Math.max(96, bottomLimit - top);
    node.style.setProperty('--aos-modal-top', `${top}px`);
    node.style.setProperty('--aos-modal-maxh', `${maxH}px`);
  };
  apply();
  // The trial banner animates its height in (framer-motion); re-measure
  // once it has settled so a dialog opened during the animation is still
  // positioned correctly.
  const settleTimer = window.setTimeout(apply, 400);
  window.addEventListener('resize', apply);
  return () => {
    window.clearTimeout(settleTimer);
    window.removeEventListener('resize', apply);
  };
}
