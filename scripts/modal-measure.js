() => {
  const vis = e => e && e.offsetHeight > 0;
  const d = document.querySelector('[data-slot=dialog-content]');
  if (!d) return JSON.stringify({ open: false });
  const r = d.getBoundingClientRect();
  const header = [...document.querySelectorAll('[role=banner]')].find(vis);
  const bnav = [...document.querySelectorAll('[aria-label="Mobile navigation"]')].find(vis);
  const footer = [...document.querySelectorAll('[role=contentinfo]')].find(vis);
  const hr = header ? header.getBoundingClientRect() : null;
  const br = bnav ? bnav.getBoundingClientRect() : null;
  const fr = footer ? footer.getBoundingClientRect() : null;
  const closeBtn = d.querySelector('[data-slot=dialog-close]');
  const cr = closeBtn ? closeBtn.getBoundingClientRect() : null;
  const bottomBarTop = Math.min(
    br ? br.top : Infinity,
    fr ? fr.top : Infinity,
    innerHeight
  );
  // find the scrollable body (Radix ScrollArea viewport OR a div with overflow-y auto)
  const sv = d.querySelector('[data-slot=scroll-area-viewport]') ||
    [...d.querySelectorAll('div')].find(x => {
      const s = getComputedStyle(x);
      return s.overflowY === 'auto' && x.scrollHeight > x.clientHeight;
    });
  const svInfo = sv ? { sh: sv.scrollHeight, ch: sv.clientHeight } : null;
  const title = d.querySelector('[data-slot=dialog-title]');
  const tr = title ? title.getBoundingClientRect() : null;
  return JSON.stringify({
    open: true,
    title: title ? title.innerText.trim().slice(0, 30) : null,
    vw: innerWidth, vh: innerHeight,
    dialog: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) },
    checks: {
      belowNavbar: hr ? r.top >= hr.bottom : true,
      navbarGap: hr ? Math.round(r.top - hr.bottom) : null,
      aboveBottomBar: r.bottom <= bottomBarTop,
      bottomGap: Math.round(bottomBarTop - r.bottom),
      withinViewportY: r.top >= 0 && r.bottom <= innerHeight,
      withinViewportX: r.left >= 0 && r.right <= innerWidth,
      pageHOverflow: document.documentElement.scrollWidth > innerWidth,
      closeVisible: !!closeBtn && closeBtn.offsetHeight > 0 && cr.top >= 0 && cr.bottom <= innerHeight && cr.left >= 0 && cr.right <= innerWidth,
      titleVisible: !!title && title.offsetHeight > 0 && tr.top >= (hr ? hr.bottom : 0),
      bodyScrollable: sv ? sv.scrollHeight > sv.clientHeight : false
    },
    scroll: svInfo
  });
}
