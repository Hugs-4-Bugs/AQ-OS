// Reads window.__REACH = { texts: [...] }, scrolls each target into view inside the
// modal body and reports whether it fits within the dialog box
() => {
  const d = document.querySelector('[data-slot=dialog-content]');
  if (!d) return JSON.stringify({ open: false });
  const sv = d.querySelector('[data-slot=scroll-area-viewport]') ||
    [...d.querySelectorAll('div')].find(x => {
      const s = getComputedStyle(x);
      return s.overflowY === 'auto' && x.scrollHeight > x.clientHeight;
    });
  if (!sv) return JSON.stringify({ scrollable: false });
  const cfg = window.__REACH || {};
  const texts = cfg.texts || [];
  const dr = d.getBoundingClientRect();
  const out = [];
  const collect = () => new Promise(res => setTimeout(() => {
    for (const t of texts) {
      const el = [...d.querySelectorAll('button, a, h3, h4, label, span')].find(e => e.innerText && e.innerText.trim().startsWith(t) && e.offsetHeight > 0);
      if (!el) { out.push({ t: t.slice(0, 28), found: false }); continue; }
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      out.push({ t: t.slice(0, 28), tag: el.tagName, reachable: r.top >= dr.top - 2 && r.bottom <= dr.bottom + 2 });
    }
    sv.scrollTop = sv.scrollHeight;
    setTimeout(() => res(JSON.stringify({ dialogTop: Math.round(dr.top), dialogBottom: Math.round(dr.bottom), elements: out })), 150);
  }, 150));
  return collect();
}
