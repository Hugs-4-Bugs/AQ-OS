#!/usr/bin/env python3
"""stamp_payment_guides.py — Post-process the 3 payment-guide PDFs:
1. Stamp page numbers: cover (page 1) hidden; body pages numbered 1..N centered footer.
2. Set clean metadata (Title / Author / Subject / Creator).
3. Verify extracted text has no encoding corruption (U+FFFD).
Standard scheme per typesetting/pagination.md §6 (no 'Page X of Y').
"""
import fitz  # pymupdf

BASE = "/home/z/my-project/PAYMENT-CONFIGURATION"
DOCS = {
    "STRIPE-SETUP-GUIDE.pdf": "AcquisitionOS — Stripe Setup Guide",
    "RAZORPAY-SETUP-GUIDE.pdf": "AcquisitionOS — Razorpay Setup Guide",
    "PAYMENT-CONFIGURATION-MASTER.pdf": "AcquisitionOS — Payment Configuration Master Guide",
}

for fname, title in DOCS.items():
    path = f"{BASE}/{fname}"
    doc = fitz.open(path)
    n = doc.page_count
    for i in range(1, n):  # skip cover (page index 0)
        page = doc[i]
        num = str(i)  # body numbering starts at 1 on the second physical page
        w = page.rect.width
        page.insert_text(
            fitz.Point(w / 2 - 4 * len(num), page.rect.height - 24),
            num, fontsize=9, fontname="helv", color=(0.42, 0.48, 0.56),
        )
    doc.set_metadata({
        "title": title,
        "author": "AcquisitionOS",
        "subject": "Payment provider configuration guide (documentation only, codebase-verified)",
        "creator": "Z.ai",
        "producer": "Z.ai PDF pipeline",
    })
    doc.saveIncr()
    doc.close()

    # Corruption check
    doc = fitz.open(path)
    bad = 0
    for p in doc:
        t = p.get_text()
        bad += t.count("\ufffd")
    doc.close()
    print(f"{fname}: stamped pages 2..{n} (body 1..{n-1}), metadata set, U+FFFD count = {bad}")
