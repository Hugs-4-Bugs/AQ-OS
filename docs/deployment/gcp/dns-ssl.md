# GCP DNS + TLS — Cloud DNS, Cloud Run Domain Mapping, and Managed Certificates

This page connects `app.yourdomain.com` to your Cloud Run service and gets a Google-managed TLS certificate working. It covers the DNS side of both paths described in [`networking.md`](./networking.md):

- **Path A — Cloud Run custom domain mapping** (simplest; good for first deployments and staging).
- **Path B — global external Application LB + serverless NEG + Certificate Manager** (recommended for production: fixed IPs, raised SSE timeouts, optional Cloud Armor).

Everything here assumes you own a domain (any registrar) and completed the Cloud Run deploy in [`manual-deployment.md`](./manual-deployment.md). Placeholders: `YOUR_PROJECT_ID`, `REGION` (e.g. `us-central1`), `APP_DOMAIN` (`app.yourdomain.com`).

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="us-central1"
export APP_DOMAIN="app.yourdomain.com"
```

---

## 1. Create the Cloud DNS managed zone — `REQUIRED` if Cloud DNS hosts your domain

**What:** a managed zone is the container Cloud DNS serves your records from. **Why:** one API-managed home for `app.yourdomain.com` records (works for the LB path and the domain-mapping path), and it pairs naturally with the rest of the GCP setup.

```bash
# What: create the zone for your domain
# Why: records you create here are served by Google's name servers once the registrar points at them
gcloud dns managed-zones create acquisitionos \
  --dns-name="yourdomain.com." \
  --description="AcquisitionOS production"
# Expected output: created [https://dns.googleapis.com/dns/v1/projects/YOUR_PROJECT_ID/managedZones/acquisitionos].

# What: get the four name servers to register at your registrar
gcloud dns managed-zones describe acquisitionos --format='value(nameServers)'
# Expected output: ns-cloud-a1.googledomains.com. ... (4 hostnames)
```

**Verify:** at your registrar, replace the name servers with those four (a one-time delegation step). Delegation can take up to 24–48 h; usually under an hour.

```bash
dig +short NS yourdomain.com
# Expected: the four ns-cloud-*.googledomains.com servers. Empty/wrong → delegation not done yet.
```

> If you keep DNS at your registrar (or Cloudflare, etc.) instead: everything below still works — you just create the records in that provider's dashboard. Cloud DNS is `REQUIRED FOR CURRENT ACQUISITIONOS` only in the sense that *some* DNS must point `app.yourdomain.com` at your edge; *whose* DNS is your choice (see [`../../06-dns-and-domains.md`](../06-dns-and-domains.md)).

---

## 2. Path A — Cloud Run custom domain mapping (simple)

**What:** Cloud Run maps `app.yourdomain.com` directly to the service and provisions a Google-managed certificate for it. No load balancer objects.

**Why:** three commands total; ideal for a first production deploy or a staging service. Trade-offs vs Path B: no fixed IPs, no WAF, default platform timeout behavior (SSE needs the LB path — [`networking.md`](./networking.md) §5).

```bash
# What: map the domain to the service (interactive prompts show exact DNS records to add)
gcloud beta run domain-mappings create --service="acquisitionos" --domain="$APP_DOMAIN" --region="$REGION"
# Expected output: a table of CNAME (subdomains) or A/AAAA (apex) records to create.

# Add the exact records shown, in Cloud DNS:
gcloud dns record-sets create "app.yourdomain.com." \
  --zone=acquisitionos --type=CNAME --ttl=300 \
  --rrdatas="ghs.googlehosted.com."
# (Use the record type and target the mapping output actually printed — targets differ per domain.)
```

**Verify (allow 15 min – 24 h for the certificate):**

```bash
gcloud beta run domain-mappings describe --domain="$APP_DOMAIN" --region="$REGION" \
  --format='yaml(status.resourceRecords, status.certificateStatus)'
# Expected: certificateStatus eventually "Provisioned" / "Active".
curl -sI "https://$APP_DOMAIN/api/health" | head -n1
# Expected: HTTP/2 200
```

---

## 3. Path B — LB + serverless NEG + Certificate Manager (recommended production)

**What:** the LB owns the public edge; DNS points at its reserved anycast IP; Certificate Manager issues the cert via the LB route or DNS authorization.

**Why:** fixed IPs (simple A/AAAA records), backend timeout raised for SSE, Cloud Armor optional, and certificate management that is independent of Cloud Run mappings. The full LB build (NEG → backend service → URL map → proxy → forwarding rule) is [`networking.md`](./networking.md) §3 — here is the DNS/TLS slice.

```bash
# 3a. Point the domain at the reserved LB IP (networking.md §3d created it):
gcloud dns record-sets create "app.yourdomain.com." \
  --zone=acquisitionos --type=A --ttl=300 \
  --rrdatas=YOUR_RESERVED_LB_IP
# Expected: command completes; verify with:
gcloud dns record-sets list --zone=acquisitionos --name="app.yourdomain.com."
```

```bash
# 3b. Certificate issued via the LB route (certificate + map + proxy already in networking.md §3f/§4):
gcloud certificate-manager certificates create acquisitionos-cert --domains="$APP_DOMAIN"
gcloud certificate-manager maps create acquisitionos-certmap
gcloud certificate-manager maps entries create app-entry \
  --map=acquisitionos-certmap --certificates=acquisitionos-cert --hostname="$APP_DOMAIN"
# Google completes the challenge automatically once DNS resolves the domain to the LB IP.
```

**DNS-authorization route (when the domain is not yet on the LB):**

```bash
gcloud certificate-manager dns-authorizations create acquisitionos-auth --domain="$APP_DOMAIN"
gcloud certificate-manager dns-authorizations describe acquisitionos-auth
# Expected output: the TXT/CNAME record Google requires — add it in Cloud DNS exactly as printed,
# then attach the authorization to the certificate (see Certificate Manager docs, §Official links).
```

**Verify:** `gcloud certificate-manager certificates describe acquisitionos-cert --format='value(state)'` → `ACTIVE` (minutes to a few hours after DNS propagates); then `curl -sI https://$APP_DOMAIN | head -n1` shows 200/30x with a Google Trust Services certificate.

---

## 4. Apex vs www — the special case

**Why this needs its own section:** a `CNAME` cannot legally sit on the zone apex (`yourdomain.com`), and some providers fake it with ALIAS/ANAME. On GCP:

- **Apex with Path B is trivial:** the LB has **static anycast IPs**, so the apex gets plain `A`/`AAAA` records — no ALIAS/ANAME trick needed. (This is one more reason the LB path is recommended.)
- **Apex with Path A:** the domain-mapping output prints `A`/`AAAA` records for apex domains (Google-front IPs) — create exactly those; do not invent records.
- Cloud DNS itself has no general ALIAS/ANAME record type — anything claiming otherwise is a provider-specific feature (`NEEDS VERIFICATION` for third-party DNS providers' apex-redirect behavior).

**`www` → apex redirect** (`OPTIONAL`):

- Simplest acceptable behavior: create `www.yourdomain.com` as a `CNAME` to the same target (Path A) or give the LB a second certificate domain and route it ([`OPTIONAL`] URL-map redirect rules — see the Load Balancing docs on `defaultUrlRedirect`).
- Or accept that only `app.yourdomain.com` serves traffic and publish that canonical URL everywhere (`APP_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL` — [`../../01-architecture.md`](../01-architecture.md) §2.2).

---

## 5. TTL guidance

| Phase | TTL | Why |
| --- | --- | --- |
| Initial setup / testing | **300 s (5 min)** | Mistakes propagate out fast. All examples above use 300. |
| Stable production | **3600 s (1 h)** | Fewer DNS lookups, more resilient to resolver hiccups. |
| Planned edge migration (e.g. switching Path A → Path B) | drop to 300 **24 h in advance** | so the old record expires before you flip it. |

```bash
# Update a record's TTL (transactions are the safe way to edit):
gcloud dns record-sets transaction start --zone=acquisitionos
gcloud dns record-sets transaction remove "app.yourdomain.com." \
  --zone=acquisitionos --type=A --ttl=300 --rrdatas=OLD_IP
gcloud dns record-sets transaction add "app.yourdomain.com." \
  --zone=acquisitionos --type=A --ttl=3600 --rrdatas=NEW_IP
gcloud dns record-sets transaction execute --zone=acquisitionos
```

---

## 6. Propagation checks

```bash
# Records as Cloud DNS serves them (authoritative, instant):
gcloud dns record-sets list --zone=acquisitionos

# What the public internet sees (respects TTL caches):
dig +short app.yourdomain.com            # expected: the LB IP (Path B) or Google-front IPs
dig +short app.yourdomain.com CNAME      # expected: ghs.googlehosted.com. (Path A subdomain case)
dig @ns-cloud-a1.googledomains.com app.yourdomain.com   # ask your authoritative server directly

# End-to-end TLS + app:
curl -sI "https://$APP_DOMAIN/api/health" | head -n1
curl -s "https://$APP_DOMAIN/api/health" | head -c 200
```

If `gcloud` shows the right record but `dig` does not, you are inside a resolver's TTL cache — wait it out. If both are right and HTTPS still fails, it is the certificate, not DNS: [`troubleshooting.md`](./troubleshooting.md) §SSL.

---

## 7. After the domain is live — update every consumer of the URL

`REQUIRED FOR CURRENT ACQUISITIONOS` — the URL is now real; everything that was pointed at `run.app` or a placeholder must be updated:

| What | Where | Pointer |
| --- | --- | --- |
| `APP_PUBLIC_URL=https://app.yourdomain.com` | Cloud Run env (`--update-env-vars`) + new revision | [`backend.md`](./backend.md) §5 |
| `NEXT_PUBLIC_APP_URL=https://app.yourdomain.com` | Docker build args → **rebuild the image** | [`frontend.md`](./frontend.md) |
| Google OAuth redirect URI(s) | Google Cloud console → Credentials → replace `run.app` callback with `https://app.yourdomain.com/api/auth/google/callback` (verify exact path in `src/app/api/auth/google/`) | [`manual-deployment.md`](./manual-deployment.md) step 15 |
| Stripe webhook URL | Stripe dashboard → Webhooks → `https://app.yourdomain.com/api/payments/webhook/stripe` | [`backend.md`](./backend.md) §13 |
| Razorpay webhook URL | Razorpay dashboard → same path | [`backend.md`](./backend.md) §13 |
| Gmail Pub/Sub push endpoint (`OPTIONAL`) | Pub/Sub subscription → `https://app.yourdomain.com/api/gmail/pubsub/webhook`; `GMAIL_PUBSUB_WEBHOOK_URL` env | [`backend.md`](./backend.md) §13 |
| Telegram webhook (`OPTIONAL`) | Bot API `setWebhook` → `https://app.yourdomain.com/api/telegram/webhook` | [`backend.md`](./backend.md) §13 |
| Cloud Scheduler job URIs | `gcloud scheduler jobs update http cron-* --uri=https://$APP_DOMAIN/api/cron/...` | [`manual-deployment.md`](./manual-deployment.md) step 13 note |

Checklist trick: search your notes/secret values for `run.app` after go-live — anything still carrying it is not updated.

---

## 8. Troubleshooting pointers

Full Symptom → Cause → Diagnosis → Fix entries live in [`troubleshooting.md`](./troubleshooting.md); the DNS/TLS-relevant ones:

- **DNS not resolving** — delegation, wrong record type (apex CNAME), stale caches.
- **Certificate stuck "Provisioning"** — DNS not yet pointed at the LB, or the DNS-authorization record missing/mis-copied.
- **HTTPS works on `run.app` but not on the custom domain** — cert state not `ACTIVE` yet; do not roll back the app for this.

---

## 9. Official documentation

- Cloud DNS overview + quickstart — https://cloud.google.com/dns/docs and https://cloud.google.com/dns/docs/quickstart
- Cloud DNS records & zones reference — https://cloud.google.com/dns/docs/reference
- Cloud Run custom domain mappings — https://cloud.google.com/run/docs/map-custom-domains
- Certificate Manager (certificates, DNS authorizations) — https://cloud.google.com/certificate-manager/docs
- Global external ALB with serverless NEGs — https://cloud.google.com/load-balancing/docs/https/setup-global-ext-https-serverless
- Cloud Run custom domains + SSL behavior — https://cloud.google.com/run/docs/securing/using-ssl
- Handbook: [`../../06-dns-and-domains.md`](../06-dns-and-domains.md) · [`networking.md`](./networking.md) · [`manual-deployment.md`](./manual-deployment.md)
