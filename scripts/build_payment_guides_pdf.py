#!/usr/bin/env python3
"""build_payment_guides_pdf.py — Convert the 3 payment-guide Markdown files into
polished HTML (Creative-Flow brief) ready for html2pdf-next.js.

Rules honored (pdf skill / creative-flow):
- @page concrete px (794x1123 = A4 @96dpi), margin 0
- html,body background = darkest color (dark cover + light body rule)
- cover/ending fixed height + break-after/before page; overflow hidden ONLY there
- single .main-content flow container, no fixed height, no overflow:hidden
- h2/h3 break-after avoid; tables: thead header-group, tr break-inside avoid
- fonts with generic fallback; overflow-wrap on text elements
"""
import markdown
import re
import os

BASE = "/home/z/my-project/PAYMENT-CONFIGURATION"
OUT = BASE  # html next to md

DOCS = {
    "STRIPE-SETUP-GUIDE.md": {
        "title": "Stripe Setup Guide", "t1": "Stripe Setup", "t2": "Guide",
        "subtitle": "Complete beginner-to-production walkthrough for Stripe in AcquisitionOS — account, products, recurring prices, GST-inclusive amounts, checkout, webhooks, verification, and Test → Live migration.",
        "accent": "#4f46e5",
        "accent2": "#818cf8",
        "series": "ACQUISITIONOS · PAYMENT CONFIGURATION",
        "docid": "GUIDE 1 / 3",
        "companions": "Companion guides: Razorpay Setup Guide · Payment Configuration Master",
        "tags": ["Hosted Checkout", "Recurring Prices", "Webhooks", "GST-inclusive amounts", "Billing Portal"],
    },
    "RAZORPAY-SETUP-GUIDE.md": {
        "title": "Razorpay Setup Guide", "t1": "Razorpay Setup", "t2": "Guide",
        "subtitle": "Complete step-by-step walkthrough for Razorpay in AcquisitionOS — activation, API keys, one-time orders vs recurring subscriptions, GST server-side math, signature verification, webhooks, and Test → Live migration.",
        "accent": "#0284c7",
        "accent2": "#38bdf8",
        "series": "ACQUISITIONOS · PAYMENT CONFIGURATION",
        "docid": "GUIDE 2 / 3",
        "companions": "Companion guides: Stripe Setup Guide · Payment Configuration Master",
        "tags": ["Orders & Subscriptions", "UPI · Cards · NetBanking", "HMAC verification", "Webhooks", "INR + 18% GST"],
    },
    "PAYMENT-CONFIGURATION-MASTER.md": {
        "title": "Payment Configuration Master", "t1": "Payment Configuration", "t2": "Master",
        "subtitle": "Cross-provider reference for AcquisitionOS payments — category tables, Stripe Price ID master table, Razorpay Plan ID master table, webhook master tables, environment-variable inventory, and the single end-to-end setup checklist.",
        "accent": "#334155",
        "accent2": "#64748b",
        "series": "ACQUISITIONOS · PAYMENT CONFIGURATION",
        "docid": "GUIDE 3 / 3",
        "companions": "Companion guides: Stripe Setup Guide · Razorpay Setup Guide",
        "tags": ["Master tables", "TO_BE_CREATED policy", "Env inventory", "Webhook maps", "Setup flow"],
    },
}

CSS_TEMPLATE = """
@page { size: 794px 1123px; margin: 0; }
:root {
  --accent: %(accent)s;
  --accent2: %(accent2)s;
  --ink: #17233b;
  --muted: #55677d;
  --line: #dbe3ee;
  --soft: #f3f6fb;
  --code-bg: #eef2f8;
}
html, body {
  margin: 0; padding: 0; width: 794px;
  background: #0b1220; /* darkest page color — prevents sub-pixel white edges on dark pages */
  color: var(--ink);
  font-family: 'Carlito', 'Liberation Sans', 'DejaVu Sans', sans-serif;
  font-size: 12.5px; line-height: 1.62;
}
@media screen {
  html { height: auto; display: flex; justify-content: center; background: #0b1220; }
  body { transform-origin: top center; margin: 20px auto; box-shadow: 0 8px 40px rgba(0,0,0,.5); }
}
p, td, li { overflow-wrap: break-word; }
p { margin: 0 0 9px 0; text-align: left; }

/* ── Cover ─────────────────────────────────────────── */
.hero-page {
  width: 794px; height: 1123px; box-sizing: border-box;
  break-after: page; overflow: hidden; position: relative;
  background: linear-gradient(160deg, #0b1220 0%%, #101b33 58%%, #0d1730 100%%);
  color: #eef2fa; display: flex; flex-direction: column; justify-content: center;
  padding: 64px 62px;
}
.hero-page .blob { position: absolute; border-radius: 50%%; }
.hero-page .b1 { width: 330px; height: 330px; right: 30px; top: 40px; background: radial-gradient(circle at 38%% 38%%, rgba(255,255,255,.10), rgba(255,255,255,0) 66%%); }
.hero-page .b2 { width: 220px; height: 220px; right: 120px; top: 180px; background: radial-gradient(circle at 40%% 40%%, rgba(255,255,255,.06), rgba(0,0,0,0) 64%%); }
.hero-page .b3 { width: 260px; height: 260px; left: 40px; bottom: 60px; background: radial-gradient(circle at 45%% 45%%, rgba(255,255,255,.07), rgba(255,255,255,0) 62%%); }
.hero-page .series { font-size: 11.5px; letter-spacing: 3.5px; color: %(accent2)s; font-weight: 700; margin-bottom: 22px; }
.hero-page .docid { position: absolute; top: 58px; right: 62px; font-size: 10.5px; letter-spacing: 2.5px; color: #93a3bd; }
.hero-page .title { font-size: 51px; line-height: 1.06; font-weight: 700; letter-spacing: -0.5px; margin: 0 0 24px 0; max-width: 620px; }
.hero-page .title .t2 { color: %(accent2)s; display: block; }
.hero-page .subtitle { font-size: 14.5px; line-height: 1.65; color: #b9c6dc; max-width: 600px; margin-bottom: 32px; }
.hero-page .chips { display: flex; flex-wrap: wrap; gap: 8px; max-width: 640px; margin-bottom: 34px; }
.hero-page .chip { border: 1px solid rgba(255,255,255,.22); color: #d7e0f0; border-radius: 999px; padding: 4px 13px; font-size: 11px; letter-spacing: .3px; }
.hero-page .meta-row { font-size: 11.5px; color: #8fa0bb; letter-spacing: .6px; }
.hero-page .meta-row b { color: #d7e0f0; font-weight: 700; }
.hero-page .foot { position: absolute; left: 62px; right: 62px; bottom: 54px; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #93a3bd; letter-spacing: 1.2px; }

/* ── Flowing content ───────────────────────────────── */
.main-content {
  background: #ffffff; width: 794px; box-sizing: border-box;
  padding: 54px 58px 46px 58px; /* no fixed height, no overflow hidden */
}
h1, h2, h3, h4 { break-after: avoid; break-inside: avoid; color: var(--ink); }
h2 {
  font-size: 21px; line-height: 1.25; margin: 26px 0 12px 0; padding-top: 12px;
  border-top: 1px solid var(--line); letter-spacing: -0.2px;
}
h2:first-of-type { margin-top: 4px; border-top: none; padding-top: 0; }
h3 { font-size: 15px; margin: 18px 0 8px 0; color: #1d2b47; }
h4 { font-size: 13px; margin: 14px 0 6px 0; }
strong { color: #0f1a30; }
hr { border: none; border-top: 1px solid var(--line); margin: 16px 0; }

/* tables */
table {
  width: 100%%; border-collapse: collapse; margin: 10px 0 14px 0;
  font-size: 10.6px; line-height: 1.45;
}
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th {
  background: var(--accent); color: #ffffff; text-align: left;
  padding: 6px 7px; font-weight: 700; border: 1px solid var(--accent);
  font-size: 10.2px;
}
td { border: 1px solid var(--line); padding: 5.5px 6px; vertical-align: top; overflow-wrap: anywhere; }
td code, th code { font-size: 9.5px; }
tbody tr:nth-child(even) td { background: var(--soft); }

/* code */
code {
  font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-size: 10.3px; background: var(--code-bg); border: 1px solid #e2e8f2;
  border-radius: 3px; padding: 0.5px 4px; color: #1f2d4d;
}
pre {
  background: #0f1726; color: #dce6f5; border-radius: 8px;
  padding: 14px 16px; margin: 10px 0 14px 0;
  font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-size: 10.4px; line-height: 1.5;
  white-space: pre-wrap; overflow-wrap: break-word;
  break-inside: avoid;
}
pre code { background: transparent; border: none; color: inherit; padding: 0; font-size: inherit; }

/* blockquote = callout */
blockquote {
  margin: 10px 0 14px 0; padding: 10px 14px;
  background: var(--soft); border-left: 3.5px solid var(--accent);
  border-radius: 0 6px 6px 0; color: #33455f;
}
blockquote p { margin: 0; }
blockquote p + p { margin-top: 7px; }

ul, ol { margin: 6px 0 10px 0; padding-left: 22px; }
li { margin-bottom: 4px; text-align: left; }
li > p { margin-bottom: 4px; }

/* ── Ending ────────────────────────────────────────── */
.ending {
  width: 794px; height: 1123px; box-sizing: border-box;
  break-before: page; overflow: hidden; position: relative;
  background: linear-gradient(200deg, #101b33 0%%, #0b1220 70%%);
  color: #eef2fa; display: flex; flex-direction: column; justify-content: center;
  padding: 64px; text-align: center;
}
.ending .big { font-size: 30px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 16px; }
.ending .small { font-size: 13px; color: #b9c6dc; max-width: 520px; margin: 0 auto 34px auto; line-height: 1.7; }
.ending .companions { display: inline-block; border: 1px solid rgba(255,255,255,.22); color: #d7e0f0; border-radius: 999px; padding: 6px 18px; font-size: 11.5px; letter-spacing: .4px; }
.ending .foot { position: absolute; left: 64px; right: 64px; bottom: 54px; font-size: 10.5px; color: #93a3bd; letter-spacing: 1.2px; }
"""

HTML_SHELL = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>%(title)s — AcquisitionOS</title>
<style>%(css)s</style>
</head>
<body>

<div class="hero-page">
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="docid">%(docid)s</div>
  <div class="series">%(series)s</div>
  <div class="title">%(t1)s<span class="t2">%(t2)s</span></div>
  <div class="subtitle">%(subtitle)s</div>
  <div class="chips">%(chips)s</div>
  <div class="meta-row"><b>Version 1.0</b> &nbsp;·&nbsp; September 23, 2026 &nbsp;·&nbsp; Documentation only — verified against the current codebase</div>
  <div class="foot"><span>ACQUISITIONOS</span><span>PAYMENT CONFIGURATION · %(docid_word)s</span></div>
</div>

<div class="main-content">
%(body)s
</div>

<div class="ending">
  <div class="big">Configuration complete.</div>
  <div class="small">Every environment variable name, endpoint, webhook event, and amount in this guide was verified against the current AcquisitionOS source code. Configure objects in Test Mode first, verify the full checklist, then repeat in Live Mode.</div>
  <div class="companions">%(companions)s</div>
  <div class="foot">ACQUISITIONOS · PAYMENT CONFIGURATION · 2026</div>
</div>

</body>
</html>
"""


def md_to_body(md_text: str) -> str:
    body = markdown.markdown(md_text, extensions=["tables", "fenced_code"])
    # Wrap the first <h1> out (MD files begin with "# Title") — drop it, cover carries the title.
    body = re.sub(r"<h1>.*?</h1>\s*", "", body, count=1)
    # Remove <hr> separators — h2 border-top styling is the divider (and hr near text
    # would trip line-collision checks designed for cover-only pages)
    body = re.sub(r"<hr\s*/?>", "", body)
    # Mark table columns that contain long env-var/code strings: nothing to do — CSS handles.
    # Shade TO_BE_CREATED cells for scannability.
    body = body.replace("<code>TO_BE_CREATED</code>", '<code class="tbc">TO_BE_CREATED</code>')

    # Table-cell micro-typography: prevent em-dash / ellipsis from starting a line
    # (bind to the previous word with NBSP / WORD JOINER — QA punctuation rule)
    def _fix_cell(m):
        inner = m.group(1)
        inner = inner.replace(" \u2014 ", "\u00a0\u2014 ").replace("_\u2026", "_\u2060\u2026")
        return "<td>" + inner + "</td>"
    body = re.sub(r"<td>(.*?)</td>", _fix_cell, body, flags=re.S)
    return body


TBC_CSS = """
code.tbc { background: #fbf1dd; border: none; color: #6e4306; font-weight: 700; }
"""


def build(md_file: str, spec: dict) -> str:
    md_text = open(os.path.join(BASE, md_file), encoding="utf-8").read()
    body = md_to_body(md_text)
    chips = "".join(f'<span class="chip">{t}</span>' for t in spec["tags"])
    css = CSS_TEMPLATE % {
        "accent": spec["accent"],
        "accent2": spec["accent2"],
    } + TBC_CSS
    html = HTML_SHELL % {
        "title": spec["title"],
        "t1": spec["t1"],
        "t2": spec["t2"],
        "subtitle": spec["subtitle"],
        "accent": spec["accent"],
        "accent2": spec["accent2"],
        "series": spec["series"],
        "docid": spec["docid"],
        "docid_word": spec["docid"],
        "companions": spec["companions"],
        "tags_chips": chips,
        "chips": chips,
        "css": css,
        "body": body,
    }
    out_path = os.path.join(OUT, md_file.replace(".md", ".html"))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    # Cover-only HTML (intended input for cover_validate.js — cover-only tool)
    cover_only = HTML_SHELL % {
        "title": spec["title"], "t1": spec["t1"], "t2": spec["t2"], "subtitle": spec["subtitle"],
        "accent": spec["accent"], "accent2": spec["accent2"], "series": spec["series"],
        "docid": spec["docid"], "docid_word": spec["docid"], "companions": spec["companions"],
        "tags_chips": chips, "chips": chips, "css": css, "body": "",
    }
    cover_only = cover_only.replace('<div class="main-content">\n</div>', '')
    cover_path = os.path.join(OUT, md_file.replace(".md", ".cover.html"))
    with open(cover_path, "w", encoding="utf-8") as f:
        f.write(cover_only)
    return out_path


for md_file, spec in DOCS.items():
    path = build(md_file, spec)
    size = os.path.getsize(path)
    print(f"built {path} ({size/1024:.1f} KB)")
