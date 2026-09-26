#!/bin/bash
# Pricing modal responsive audit across the full width matrix.
# For each width: open the modal, measure page-level horizontal overflow,
# and check that no plan card content spills outside its card bounds.
set -e
TOKEN=$(cat /tmp/tokA.txt)
agent-browser cookies clear > /dev/null
agent-browser cookies set access_token "$TOKEN" > /dev/null
agent-browser open http://localhost:3000/ > /dev/null
sleep 1.2

for W in 320 360 390 414 430 640 768 820 1024 1280 1366 1440 1920; do
  agent-browser set viewport $W 900 > /dev/null
  sleep 0.4
  # open the pricing modal via the app's own event bus
  agent-browser eval "window.dispatchEvent(new CustomEvent('open-upgrade-modal')); 'evt'" > /dev/null
  sleep 1.4
  RESULT=$(agent-browser eval "
    (() => {
      const de=document.documentElement;
      const pageOverflow = de.scrollWidth > de.clientWidth + 1;
      // find the dialog
      const dialog=document.querySelector('[role=dialog]');
      if(!dialog) return JSON.stringify({modal:false, pageOverflow});
      const dlgOverflow = dialog.scrollWidth > dialog.clientWidth + 1;
      // plan cards inside the dialog
      const cards=[...dialog.querySelectorAll('[class*=rounded-2xl]')].filter(el=>el.offsetHeight>120);
      let cardIssues=0; const details=[];
      for (const c of cards) {
        const cb=c.getBoundingClientRect();
        // any descendant extending beyond the card's right edge?
        for (const el of c.querySelectorAll('*')) {
          const eb=el.getBoundingClientRect();
          if (eb.width>0 && (eb.right > cb.right + 2 || eb.left < cb.left - 2)) {
            cardIssues++;
            details.push(el.tagName + ':' + (el.textContent||'').slice(0,26));
            break;
          }
        }
      }
      // close button reachable
      const closeBtn = !!dialog.querySelector('button[aria-label*=lose], button[class*=lose]');
      return JSON.stringify({modal:true, pageOverflow, dlgOverflow, cardCount:cards.length, cardIssues, sample:details.slice(0,3), closeBtn});
    })()
  " --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['result'])" 2>/dev/null || echo "eval-failed")
  echo "width=$W $RESULT"
  # close modal for next iteration
  agent-browser eval "
    (() => {
      const dialog=document.querySelector('[role=dialog]');
      if (!dialog) return 'no-dialog';
      const x=dialog.querySelector('button[aria-label*=lose]') || [...dialog.querySelectorAll('button')].find(b=>b.querySelector('svg.lucide-x'));
      if (x) x.click();
      return 'closed';
    })()
  " > /dev/null
  sleep 0.5
done
