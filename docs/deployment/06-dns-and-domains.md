# DNS & Custom Domains — Beginner Guide

Everything about pointing a real domain at AcquisitionOS, independent of which cloud you chose. The cloud guides (`*/dns-ssl.md`) give the exact console steps.

---

## 1. How DNS fits the deployment

```text
You buy  yourdomain.com  at a registrar (Namecheap, GoDaddy, Cloudflare Registrar, …)
   │
   │  (either keep the registrar's DNS, or delegate to your cloud's DNS)
   ▼
DNS zone holds records:      app.yourdomain.com  →  your cloud endpoint
   │
   ▼
Browser resolves the name → connects to the cloud LB/edge → TLS → AcquisitionOS
```

**Nameserver delegation:** if your cloud manages DNS (Route 53 / Cloud DNS / Azure DNS / Cloudflare), you set the registrar's *nameservers* to the cloud's assigned NS servers once; everything after that is managed in the cloud.

---

## 2. Records you will actually create

| Record | Example | When AcquisitionOS needs it |
| --- | --- | --- |
| `A` / `AAAA` | `app.yourdomain.com → 203.0.113.10` | Fixed LB/edge IPs (GCLB, some Front Door setups) |
| `CNAME` | `app.yourdomain.com → aos-xxxx.run.app` | Cloud-assigned hostnames (Cloud Run URL, ECS target, CF Workers domain) |
| `ALIAS`/flattened `CNAME` (apex) | `yourdomain.com → LB DNS name` | If you serve the app on the bare apex |
| `TXT` | verification strings, SPF | Domain verification + email deliverability |
| `MX` | mail routing | Only if you receive mail on this domain — unrelated to the app |

**TTL:** start at **300 s** while wiring things up (fast corrections); raise to 3600 s once stable. **Propagation:** usually minutes; allow up to 24–48 h worst case. Check worldwide progress with https://whatsmydns.net or repeated `dig` from different networks.

---

## 3. The recommended production pattern

```text
app.yourdomain.com        → AcquisitionOS (UI + API together)
www.yourdomain.com        → redirect/alias to app.yourdomain.com   (optional)
api.yourdomain.com        → NOT required by default               (optional split)
```

**Why one host by default:** AcquisitionOS is a single Next.js unit where the UI calls `/api/**` on the **same origin**. Same-origin means:

- **No CORS configuration** to get wrong (the app ships CORS tooling in `src/lib/security/cors-config.ts`, but you avoid needing it).
- Cookies (auth JWTs) are first-party and simpler; no cross-site cookie rules.
- Webhooks land on `https://app.yourdomain.com/api/payments/webhook/stripe` (Stripe) and `/api/payments/webhook/razorpay` (Razorpay) — one domain for everything.

**When splitting `api.` makes sense:** separate scaling/security policies per tier, or a future architecture with a distinct backend. If you split, configure CORS + cookies properly and update `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL` reasoning accordingly — see [`01-architecture.md`](./01-architecture.md) §2.2 (the app builds auth links from its public URL; both hosts must be consistent).

**Apex vs `www`:** serving on the bare apex (`yourdomain.com`) requires ALIAS/flattening support (offered by all four clouds). A common safe pattern: apex redirects → `app.yourdomain.com` serves the product.

---

## 4. Domain-verification & certificate records

- **Cloud domain verification** (e.g. Azure Front Door, Google Search-related verifications, Cloudflare zone add) usually asks for a **TXT** record with a provider-supplied value — copy it exactly.
- **TLS certificates** are issued via:
  - **HTTP-01**: the cloud serves a challenge file on your domain once DNS points at it (most common with managed certs), or
  - **DNS-01**: you add a provider-supplied `TXT`/`CNAME` challenge record.
- Managed certificates then **auto-renew**. If a guide asks you to "add the validation record", it is DNS-01.

**SPF for outbound email (OTP/magic links):** if you send as `notifications@yourdomain.com`, publish:

```text
yourdomain.com.  TXT  "v=spf1 include:_spf.google.com include:amazonses.com include:_spf.resend.com ~all"
```

(Compose includes **only** for the providers you actually use — ask your email provider for its include string. Wrong SPF = OTP emails silently landing in spam.)

---

## 5. Step-by-step: pointing the domain at your deployment

1. **Finish the app deployment first** and note the platform URL (e.g. `https://aos-xxxx.a.run.app`, `https://aos.alb.us-east-1.amazonaws.com`, `https://aos-xxx.azurecontainerapps.io`, `workers.dev` preview).
2. In the cloud guide's `dns-ssl.md`, register the custom domain with the platform (each platform "claims" the hostname before DNS goes live).
3. Create the record it instructs (usually a `CNAME` from `app` → platform hostname, or `A/AAAA` for LB IPs).
4. Wait for the managed certificate to change state **Active/Issued**.
5. Set `APP_PUBLIC_URL=https://app.yourdomain.com` (+ rebuild with `NEXT_PUBLIC_APP_URL` for client code) and redeploy/restart.
6. Verify (below), then lower TTLs back up and delete stale records.

**Verify:**

```bash
dig app.yourdomain.com +short              # returns the expected target
curl -I https://app.yourdomain.com         # 200/307 + valid certificate
curl -s https://app.yourdomain.com/api/health | head -c 300
```

Also update: Google OAuth redirect URIs, Stripe/Razorpay webhook endpoints, Gmail Pub/Sub push endpoint — all to the new hostname (checklists in each cloud `README.md`).

---

## 6. Troubleshooting quick reference

| Symptom | Likely cause | Check |
| --- | --- | --- |
| `dig` returns nothing | record missing / wrong zone | record exists in the *authoritative* zone; nameservers delegated |
| `ERR_SSL_...` in browser | cert not issued yet | platform shows cert `Pending` → wait for DNS to resolve first |
| Old site still showing | cached record / low TTL not set | `dig @8.8.8.8` bypasses local cache; wait TTL out |
| Works on 4G, not office Wi-Fi | corporate resolver cache | verify via whatsmydns.net |
| OAuth `redirect_uri_mismatch` | redirect list still has old host | update Google Console to exact `https://app.yourdomain.com/...` |
| Emails go to spam | missing/incorrect SPF | `dig TXT yourdomain.com` |
