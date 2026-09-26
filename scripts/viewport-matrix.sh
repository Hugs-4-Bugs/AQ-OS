#!/bin/bash
# Responsive verification matrix for the Choose Your Plan modal +
# pricing/billing surfaces. Measures real layout via agent-browser eval.
set -u
SIZES="320 800|360 800|390 844|414 896|430 932|600 900|768 1024|820 1180|1024 768|1280 800|1366 768|1440 900|1920 1080"

IFS='|' read -ra PAIRS <<< "$SIZES"
for pair in "${PAIRS[@]}"; do
  W=$(echo "$pair" | cut -d' ' -f1)
  H=$(echo "$pair" | cut -d' ' -f2)
  agent-browser set viewport "$W" "$H" > /dev/null
  agent-browser wait 700 > /dev/null
  RESULT=$(agent-browser eval "(() => {
    const d = document.querySelector('[role=dialog]');
    const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
    let dialogW = null, dialogOverflow = null, cols = null, dialogRight = null, dialogBottom = null;
    if (d) {
      const r = d.getBoundingClientRect();
      dialogW = Math.round(r.width);
      dialogOverflow = d.scrollWidth - d.clientWidth;
      dialogRight = Math.round(r.right);
      dialogBottom = Math.round(r.bottom);
      const grids = d.querySelectorAll('div.grid');
      for (const g of grids) {
        const t = getComputedStyle(g).gridTemplateColumns;
        const n = t.split(' ').filter(Boolean).length;
        if (n > 1) { cols = n; break; }
        if (cols === null) cols = n;
      }
      // pick the grid that contains the plan cards (has Get Started or Coming Soon button)
      const all = Array.from(d.querySelectorAll('div.grid'));
      const planGrid = all.find(g => g.textContent.includes('Starter') && g.querySelector('button'));
      if (planGrid) cols = getComputedStyle(planGrid).gridTemplateColumns.split(' ').filter(Boolean).length;
    }
    // Starter card CTA state
    const starterBtn = d ? Array.from(d.querySelectorAll('button')).find(b => b.textContent.includes('Get Started')) : null;
    const notice = d ? Array.from(d.querySelectorAll('[role=note], p')).find(p => p.textContent.includes('Stripe Price ID configuration required')) : null;
    const comingSoon = d ? Array.from(d.querySelectorAll('button')).filter(b => b.textContent.includes('Coming Soon')).length : null;
    return JSON.stringify({
      vp: window.innerWidth + 'x' + window.innerHeight,
      pageOverflowPx: pageOverflow,
      dialogW, dialogOverflowPx: dialogOverflow, cols,
      dialogInsideViewport: d ? (dialogRight <= window.innerWidth && dialogBottom <= window.innerHeight + 1) : null,
      starterBtn: starterBtn ? { text: starterBtn.textContent.trim(), disabled: starterBtn.disabled } : null,
      configNotice: notice ? notice.textContent.includes('Starter checkout implemented') : false,
      comingSoonButtons: comingSoon
    });
  })()" --json 2>/dev/null | rg -o '\{.*\}' | head -1)
  echo "=== ${W}x${H} ==="
  echo "$RESULT" | head -c 500
  echo ""
done
