# DNS & SSL — Cloudflare DNS, Universal SSL, Custom Domains

How `app.yourdomain.com` becomes a real, trusted HTTPS endpoint for the Worker. The DNS concepts (records, propagation, apex vs `www`) are taught once in [`../06-dns-and-domains.md`](../06-dns-and-domains.md); this page is the Cloudflare-specific execution. Zone setup was done in [`prerequisites.md`](./prerequisites.md) §2.

**The one-paragraph summary:** because your zone lives on Cloudflare, serving the app on your own domain is a *Custom Domain attached to the Worker* — Cloudflare creates the DNS record (proxied) and issues the **Universal SSL** certificate automatically. There is no certificate ordering step and no origin to point records at.

---

## 1. How a request reaches the Worker (the model to keep in your head)

```text
Browser asks for app.yourdomain.com
        │
        ▼
Cloudflare DNS (authoritative — zone is on Cloudflare)
        │  record created BY the Custom Domain, proxied (orange cloud)
        ▼
Cloudflare edge — TLS terminates (Universal SSL cert) → WAF → Cache Rules
        │  hostname is a Worker Custom Domain
        ▼
Your Worker (acquisitionos) — OpenNext Next.js app, UI + /api/**
```

**Why this matters:** there is no "origin server IP" to point DNS at. The Custom Domain *is* the DNS record, the routing rule, and the certificate request in one operation. Hand-creating a DNS record for the same hostname will fail (Cloudflare refuses the duplicate) — [`networking.md`](./networking.md) §4.

---

## 2. Universal SSL — the certificate you do not manage

**Label:** `REQUIRED` — included and automatic.

**What:** Cloudflare issues a certificate covering the zone apex (`yourdomain.com`) and first-level subdomains (`app.yourdomain.com`, `staging.yourdomain.com`) as soon as the zone is **Active**. It renews automatically. Nothing to buy, nothing to upload.

**What it does NOT cover:** deeper subdomains like `api.staging.yourdomain.com`. If you ever need those, that is what **Advanced Certificate Manager** is for (§5) — not needed for the default single-host pattern (`app.` prod, `staging.` staging).

**Verify (after the Custom Domain exists, §3):**

```bash
curl -sI https://app.yourdomain.com/api/health | head -3
```

**Expected output:** `HTTP/2 200` (or `HTTP/1.1 200`) with valid TLS — the browser padlock shows a Cloudflare-partner CA (e.g. "Google Trust Services"). If TLS fails while DNS resolves, see §7 and [`./troubleshooting.md`](./troubleshooting.md) "SSL not working".

---

## 3. Attach the Custom Domain to the Worker

**Label:** `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** bind `app.yourdomain.com` to the `acquisitionos` Worker. Cloudflare then creates the proxied DNS record, requests the certificate, and routes all traffic for that hostname to your Worker.

**Command (Option A — dashboard):** Workers & Pages → `acquisitionos` → Settings → Domains & Routes → **Add** → Custom Domain → `app.yourdomain.com` → Add.

**Command (Option B — declarative in `wrangler.jsonc`, per [`manual-deployment.md`](./manual-deployment.md) §5/§10):**

```jsonc
{
  "name": "acquisitionos",
  // ... existing config ...
  "routes": [
    { "pattern": "app.yourdomain.com", "custom_domain": true }
  ]
}
```

then redeploy:

```bash
npx opennextjs-cloudflare deploy
```

**Expected output:** the deploy summary shows the custom domain; the dashboard lists the domain with status **Active** (issuance usually takes seconds to a few minutes on an Active zone).

**How to verify:**

```bash
dig app.yourdomain.com +short          # returns Cloudflare-proxied addresses (not your provider's IP)
curl -s https://app.yourdomain.com/api/health
```

**Staging:** repeat for `staging.yourdomain.com` bound to the `acquisitionos-staging` Worker ([`frontend.md`](./frontend.md) §7). One Custom Domain per hostname per account — a hostname can point at only one Worker.

---

## 4. Apex vs `www` (and the redirect rule)

**What:** the app serves on `app.yourdomain.com`. Two other hostnames usually exist: the bare apex (`yourdomain.com`) and `www.yourdomain.com`. Visitors type both; both should end up at the app (or at your marketing site — pick a convention and keep it).

**Why it is easy here:** Cloudflare supports **CNAME flattening** at the apex (an "ALIAS-like" behavior — the zone answers the apex query with the resolved A/AAAA values), and Custom Domains can claim the apex hostname directly if you want the app there. The recommended safe pattern from [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §3:

| Hostname | Setup | Behavior |
| --- | --- | --- |
| `app.yourdomain.com` | Worker Custom Domain (§3) | Serves AcquisitionOS |
| `www.yourdomain.com` | DNS record (any placeholder value, proxied) + **Redirect Rule** | 301 → `https://app.yourdomain.com` |
| `yourdomain.com` (apex) | Same as `www`, or a Custom Domain if you want the app on the apex | 301 → `https://app.yourdomain.com` (or serves the app) |

**Command (Redirect Rule):** zone → Rules → Redirect Rules → Create rule:

| Field | Value |
| --- | --- |
| Match | `(http.host eq "www.yourdomain.com") or (http.host eq "yourdomain.com")` |
| Action | Dynamic redirect, expression: `concat("https://app.yourdomain.com", http.request.uri.path)` |
| Status code | 301 (keep path — visitors land on the same page) |

**Expected output:** `curl -sI https://www.yourdomain.com/pricing | head -3` → `301`, `location: https://app.yourdomain.com/pricing`.

**Verify:** open `https://yourdomain.com` and `https://www.yourdomain.com` in a browser; both land on the app with a valid padlock. Note: a redirect requires the source hostname to be a *proxied* DNS record (orange cloud) even if it points nowhere — that is the one case where you hand-create a record.

**Cookies/domain note:** redirects are safe for the auth flows because the *final* origin is always `app.yourdomain.com` — JWT cookies are scoped to that host and never exist on `www`.

---

## 5. Advanced Certificate Manager — `OPTIONAL`

**What:** a zone add-on that unlocks custom SANs (multi-level subdomains like `api.staging.yourdomain.com`), minimum-TLS-version control, and certificate pack ordering.

**Why you probably skip it:** Universal SSL already covers `app.yourdomain.com` and `staging.yourdomain.com`. Only add ACM if your hostname scheme goes deeper than first-level subdomains or you need zone-wide TLS policy enforcement. Feature matrix: https://developers.cloudflare.com/ssl/ — current capabilities `NEEDS VERIFICATION` (they change with plans).

**Verify if used:** the dashboard SSL/TLS → Advanced Certificate Manager shows the active pack; the deeper subdomain serves a valid certificate.

---

## 6. Propagation: what is instant and what is not

**What:** two different "propagation" clocks exist — do not confuse them:

| Step | Time | Why |
| --- | --- | --- |
| **Registrar nameserver delegation → Cloudflare** | minutes to 24–48 h | You set `*.ns.cloudflare.com` nameservers at your registrar (done in [`prerequisites.md`](./prerequisites.md) §2); resolvers worldwide must pick them up |
| **Anything after the zone is Active** | effectively instant | The Custom Domain's DNS record is created inside Cloudflare's authoritative DNS; the certificate issues in seconds-to-minutes |

**Practical meaning:** the first zone bring-up is the only slow part. Adding `staging.yourdomain.com` a week later is near-instant. If `dig` still returns your *registrar parking* nameservers, the delegation has not propagated — nothing Cloudflare-side is broken; wait and re-check with:

```bash
dig NS yourdomain.com +short          # expect: *.ns.cloudflare.com
dig app.yourdomain.com +short         # expect: Cloudflare-proxied addresses once the Custom Domain exists
```

**TTL note:** Cloudflare's own records use short TTLs; changes you make later (e.g. moving a hostname between Workers) take effect quickly. Long TTLs you see are on records imported from your old DNS provider — shorten them *before* a planned cutover ([`../06-dns-and-domains.md`](../06-dns-and-domains.md) §5).

---

## 7. Orange-cloud proxy: what it means for this app

**What:** the Custom Domain's record is **proxied** (orange cloud). Traffic is terminated at the edge, then routed to the Worker.

**Implications (mostly good, one gotcha):**

| Aspect | Behavior | Consequence for AcquisitionOS |
| --- | --- | --- |
| TLS | Universal SSL at the edge | Secure cookies, OAuth, webhooks all work — keep TLS mode **Full (strict)** if any non-Worker origin ever appears ([`security.md`](./security.md) §5) |
| WAF / Cache Rules / Rate limiting | Apply to every request | Your rate-limit and health-endpoint protections work automatically ([`security.md`](./security.md) §3) |
| Host header | The Worker receives the original host (`app.yourdomain.com`) + standard `X-Forwarded-Proto` | `src/lib/app-url.ts` resolves correctly without transform rules ([`networking.md`](./networking.md) §5) |
| Client IP | `CF-Connecting-IP` header at the Worker | If the app rate-limits or logs IPs, it must read this header, not a socket IP |
| Grey-cloud (unproxied) record | **Bypasses everything** — the Worker would not receive traffic | Never grey-cloud the app hostname; if you ever see the app "unreachable" after DNS edits, check the orange cloud first |
| Email records (MX/SPF/DKIM) | Unrelated to the app hostname; must be left intact | OTP emails depend on them ([`networking.md`](./networking.md) §2) |

**Verify:** `curl -sD - -o /dev/null https://app.yourdomain.com/api/health | rg -i "server|cf-|HTTP/"` — you will see Cloudflare's edge headers; that proves you are on the proxy path.

---

## 8. After the cutover: update external references

**What:** the domain is live — now update every provider that stores a URL. Checklist (exact values from [`../01-architecture.md`](../01-architecture.md) §2.2 and [`backend.md`](./backend.md) §10):

1. **Google OAuth redirect URIs** (Google Cloud Console → Credentials → OAuth client): `https://app.yourdomain.com/api/auth/google/callback` — plus any additional callback routes your flows use (`/api/auth/callback/google`, `/api/integrations/google/callback` exist in the code; add the ones you exercise). Exact-match required ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §5).
2. **Webhook URLs:** Stripe → `/api/payments/webhook/stripe` (or the path your build answers — see the path note in [`backend.md`](./backend.md) §10), Razorpay → `/api/payments/webhook/razorpay`, Gmail Pub/Sub subscription → `/api/gmail/pubsub/webhook`, Telegram → `/api/telegram/webhook`.
3. **Env vars:** `APP_PUBLIC_URL` (runtime, `wrangler.jsonc` `vars`) and `NEXT_PUBLIC_APP_URL` (**build-time**) both `https://app.yourdomain.com`; changing the build-time one requires **rebuild + redeploy** ([`secrets.md`](./secrets.md) §5).
4. **Cron dispatcher:** `APP_BASE_URL` var on `acquisitionos-cron` points at the new domain ([`manual-deployment.md`](./manual-deployment.md) §9).
5. **Uptime monitor:** point it at `https://app.yourdomain.com/api/health` ([`backend.md`](./backend.md) §1).

**Verify (end-to-end after cutover):** one password login, one OTP email (link host must be `https://app.yourdomain.com`), one Google OAuth round-trip, one Stripe test event with `200` — the same checklist as [`manual-deployment.md`](./manual-deployment.md) §12.

---

## 9. Troubleshooting pointers

| Symptom | Likely cause | Where |
| --- | --- | --- |
| `dig` returns parking/registrar NS | Nameserver delegation not yet propagated | §6; [`prerequisites.md`](./prerequisites.md) §2 |
| DNS resolves but certificate errors / 526 | Zone not fully Active, or Universal SSL still issuing; custom domain not actually attached to the Worker | [`./troubleshooting.md`](./troubleshooting.md) "SSL not working" |
| `Error 1000` / "DNS points to prohibited IP" | A/AAAA record where a Custom Domain should be, or grey-cloud record | §7; recreate via the Worker's Custom Domain |
| Duplicate record refused | Custom Domains own the hostname; delete the manual record | [`networking.md`](./networking.md) §2 |
| `www` does not redirect | Redirect Rule mis-ordered, or record unproxied | §4 |
| OAuth `redirect_uri_mismatch` | Google console URIs not updated or not exact-match | §8.1; [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §5 |
| Magic links go to the wrong host | `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL` stale | §8.3; [`secrets.md`](./secrets.md) §5 |

---

## 10. Official Documentation

- Cloudflare DNS — https://developers.cloudflare.com/dns/
- DNS records & proxy status (orange cloud) — https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/
- Universal SSL — https://developers.cloudflare.com/ssl/ssl-tls/certificate-types/ (and Advanced Certificate Manager — https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/)
- Workers Custom Domains — https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Redirect Rules — https://developers.cloudflare.com/rules/url-forwarding/
- SSL/TLS modes (Full strict) — https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Shared DNS fundamentals — [`../06-dns-and-domains.md`](../06-dns-and-domains.md)
