# DNS + TLS on Azure — Azure DNS, Custom Domains, Managed Certificates

This page gets `https://app.yourdomain.com` resolving to your Container App with a valid certificate, and walks the after-cutover chores (OAuth redirect URIs, webhook URLs) that beginners forget. Concepts common to all four clouds are in [`../06-dns-and-domains.md`](../06-dns-and-domains.md) — read that first; this page is the Azure mechanics. Domain-related commands assume the variables from [`manual-deployment.md`](./manual-deployment.md) §0.

---

## 1. The plan in one picture

```text
  yourdomain.com  (registrar)
      |  NS records -> Azure DNS nameservers
      v
  Azure DNS zone: yourdomain.com
      |- app     CNAME -> <APP>.azurecontainerapps.io        (direct path, REQUIRED baseline)
      |           or   -> <endpoint>.z01.azurefd.net          (if Front Door, OPTIONAL)
      |- asuid.app TXT  -> customDomainVerificationId         (one-time, proves ownership)
      |- @       A     -> Front Door anycast IP                (OPTIONAL apex support)
      v
  Container Apps managed certificate (or Front Door TLS) - auto-renews
```

**One host, `app.yourdomain.com`, serves UI + API** — this keeps the app same-origin (no CORS) and the `app-url.ts` header contract intact ([`networking.md`](./networking.md) §8).

---

## 2. Create the Azure DNS zone + delegate from your registrar

**What:** the zone holds all records for `yourdomain.com`; the registrar's NS records hand lookups to Azure's nameservers.

**Why:** Azure-managed DNS gives you `az network dns` commands, fast record changes, and clean integration with the Container Apps domain flow. (Keeping DNS at your registrar is fine too — every record below can be created in any provider's panel; [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §2.)

```bash
az network dns zone create --resource-group "$RG" --name yourdomain.com
# Expected: JSON with "nameServers": [ ... 4 azure NS names ... ]
```

At your **registrar**, replace the domain's nameservers with those four names (registrar UI; takes 1–48 h to delegate).

**Verify:**

```bash
dig NS yourdomain.com +short        # returns the Azure nameservers once delegated
```

If `dig` is unfamiliar: DNS propagation tools in [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §6 do the same check in a browser.

---

## 3. The records you will actually create

### 3.1 `app` → the Container App (REQUIRED, direct path)

**What/Why:** a CNAME pointing `app.yourdomain.com` at the app's default domain, plus the one-time ownership TXT record the managed-certificate flow requires.

```bash
# 1) read the verification id the platform generated
az containerapp hostname add --name "$APP" --resource-group "$RG" --hostname "$APP_FQDN"
az containerapp show -n "$APP" -g "$RG" \
  --query properties.configuration.ingress.customDomainVerificationId -o tsv

# 2) TXT record  asuid.app  = <verification id>          (ownership proof)
az network dns record-set txt add-record -g "$RG" -z yourdomain.com \
  -n "asuid.app" -v "PASTE_VERIFICATION_ID"

# 3) CNAME  app -> <APP>.azurecontainerapps.io           (traffic)
az network dns record-set cname create -g "$RG" -z yourdomain.com -n app --ttl 300
az network dns record-set cname set-record -g "$RG" -z yourdomain.com \
  -n app --cname "$APP.azurecontainerapps.io"
```

**Expected output:** `null`-free JSON record-set objects for each command.

**Why the TXT record:** `asuid.<hostname>` proves to Container Apps that you control the DNS zone before it issues a certificate for the name. Whether the portal demands it for every flow, or only in some cases (e.g. apex names), is NEEDS VERIFICATION — create it if the portal's *Custom domains* pane asks for a validation record; it is harmless if present ([`manual-deployment.md`](./manual-deployment.md) §8.2 flags the same uncertainty for the CLI-cert step).

**Verify:** `dig app.yourdomain.com CNAME +short` → `$APP.azurecontainerapps.io`.

### 3.2 Apex (`yourdomain.com` without a subdomain)

**What/Why:** CNAME records are not allowed at the zone apex by DNS rules, so the apex needs an A record — which points at an **IP**. Container Apps' default domain is a name, not a stable IP, so the practical Azure pattern is:

- **Apex via Front Door (OPTIONAL path that works):** an A record to the Front Door endpoint's anycast IP (Front Door explicitly supports apex domains this way):
  ```bash
  az afd endpoint show -g "$RG" --profile-name fd-acquisitionos -n fde-acquisitionos \
    --query "{host: hostName}" -o tsv     # then A record @ -> that anycast IP (az afd ... or portal)
  ```
- **Direct apex on Container Apps with a managed certificate:** support for apex/A-record bindings is limited (the flow is CNAME-oriented) — NEEDS VERIFICATION for the current behavior; if the portal rejects the apex hostname, route it through Front Door or park the apex with a redirect at your registrar.
- **Simplest beginner answer:** use only `app.yourdomain.com` everywhere and skip the apex until a real requirement appears. Add a registrar-level redirect `yourdomain.com → https://app.yourdomain.com` if you already bought visitors' typing habits.

### 3.3 Front Door path (if you chose the OPTIONAL edge)

Point the **CNAME at the Front Door endpoint** instead of the app: `app → <endpoint>.z01.azurefd.net` (exact endpoint hash from `az afd endpoint show`). Certificate issuance then happens on Front Door (its own managed certificate + its own `asuid` TXT flow; portal-driven). Route/caching rules stay per [`manual-deployment.md`](./manual-deployment.md) §8.3 and [`networking.md`](./networking.md) §6 — caching disabled, SSE-safe.

---

## 4. Bind the managed certificate

**What:** the free certificate Azure issues and auto-renews for your custom hostname, terminated at the Container Apps ingress (or at Front Door on the edge path).

**Why:** TLS is non-negotiable — production cookies are `secure`, webhooks arrive over HTTPS, `sslmode=require` protects the DB hop; a plaintext origin would undermine all of it ([`networking.md`](./networking.md) §7).

Portal steps (the reliable path; the exact CLI command for certificate issuance varies by az version — NEEDS VERIFICATION, same flag as [`manual-deployment.md`](./manual-deployment.md) §8.2):

1. Portal → Container App `acquisitionos-api` → **Custom domains** → the added hostname.
2. Confirm the **CNAME is already resolving** — certificate issuance validates via DNS and fails otherwise (this is why §3.1 creates the CNAME first).
3. Certificate type: **Managed certificate** → **Validate** → wait for state **Issued** (minutes to a couple of hours).
4. The bound hostname replaces the default `azurecontainerapps.io` host in every public URL.

**Verify:**

```bash
curl -sI "https://app.yourdomain.com/api/health" | head -3
# HTTP/2 200 (or 307) with a valid certificate chain - no browser TLS warning
```

Auto-renewal is handled by the platform as long as the DNS records stay in place — do not delete the CNAME/TX​T later.

---

## 5. `www` and the canonical host

**What:** decide once which host is canonical — this handbook uses `app.yourdomain.com` — and make every other hostname a redirect to it.

- `www.yourdomain.com` → CNAME to the same target as `app` (or Front Door endpoint) **and** a redirect rule, so users on `https://www...` land on the canonical host rather than getting a second valid-but-different origin (two origins = two cookie jars = mysterious logouts).
- Redirect mechanics: easiest is a **Front Door rule** (`www → 301 → https://app.yourdomain.com$request_uri`) if you run the OPTIONAL edge; otherwise add a tiny host-check in your own edge/proxy, or simply do not bind `www` at all and let it NXDOMAIN.
- Set `APP_PUBLIC_URL` (runtime) and `NEXT_PUBLIC_APP_URL` (build-time) to the **canonical** host so the app never prints the other one ([`backend.md`](./backend.md) §6).

**Verify:** `curl -sI https://www.yourdomain.com | head -3` → `301/302` with `Location: https://app.yourdomain.com/...` (if you chose to bind `www`).

---

## 6. Propagation checks and TTL guidance

**What/Why:** DNS resolvers cache answers for the record's TTL. Low TTL = changes take hold quickly (good while migrating); high TTL = fewer lookups (good once stable).

| Phase | TTL | Why |
| --- | --- | --- |
| Before/during cutover | **300 s** (5 min) | Mistakes roll back in minutes, not hours |
| Stable after cutover (1–2 weeks) | 3600 s or default | Less resolver load; still same-day changes |

```bash
dig app.yourdomain.com +short          # CNAME chain
dig app.yourdomain.com @1.1.1.1 +short # check a public resolver, not just local cache
nslookup app.yourdomain.com            # Windows equivalent
```

**Expected output:** the CNAME target, then after cert issuance, an A-record answer for the platform edge IP. Propagation: minutes to 48 h for the initial NS delegation; record-level changes respect the TTL (hence 300 s during migration). Public "DNS propagation checkers" are just multi-resolver `dig`s — useful, not magical ([`../06-dns-and-domains.md`](../06-dns-and-domains.md) §6).

---

## 7. After cutover — the chores people forget

**What/Why:** the public URL changed; external systems that reference it must be updated *once*. Redeploys do **not** touch these (same domain afterwards).

1. **Google OAuth redirect URIs** (Google Cloud Console → Credentials → your OAuth client): `https://app.yourdomain.com/api/auth/google/callback` — and any `https://app.yourdomain.com` origins. Wrong URI = `redirect_uri_mismatch` on sign-in.
2. **Stripe webhook endpoint** → `https://app.yourdomain.com/api/payments/webhook/stripe`; copy the (re-generated or existing) signing secret into Key Vault `stripe-webhook-secret` and restart the revision if it changed ([`backend.md`](./backend.md) §14).
3. **Razorpay webhook URL** → same path; `razorpay-webhook-secret`.
4. **Gmail Pub/Sub push URL** (if used) → `GMAIL_PUBSUB_WEBHOOK_URL=https://app.yourdomain.com/api/gmail/pubsub/webhook`.
5. **Telegram** (if used) → re-run `setWebhook` against the new HTTPS URL.
6. **App config** → `APP_PUBLIC_URL=https://app.yourdomain.com` env var; rebuild the image with `NEXT_PUBLIC_APP_URL=https://app.yourdomain.com` baked in (build-time, [`frontend.md`](./frontend.md) §2).
7. **Scheduler base URL** → the Function App's `APP_PUBLIC_URL` setting must point at the custom domain, not the `azurecontainerapps.io` host ([`manual-deployment.md`](./manual-deployment.md) §9.1).

**Verify:** password + OTP + magic-link login all work; magic-link email points at the canonical host; one Stripe test event lands with HTTP 200; one scheduler fire returns 200 in Function logs.

---

## 8. dns-ssl checklist

```text
[ ] Zone created; registrar NS delegated (dig NS yourdomain.com +short -> Azure NS)
[ ] CNAME app -> <APP>.azurecontainerapps.io (or Front Door endpoint), TTL 300 during cutover
[ ] asuid.app TXT verification record present (if the portal requested it)
[ ] Managed certificate state = Issued; https://app.yourdomain.com/api/health over valid TLS
[ ] Apex decision made (skip / registrar redirect / Front Door A record)
[ ] www either unbound or 301-redirecting to the canonical host
[ ] OAuth redirect URIs, Stripe/Razorpay webhooks, Gmail/Telegram URLs, APP_PUBLIC_URL updated
[ ] Scheduler APP_PUBLIC_URL points at the custom domain
[ ] TTLs raised to 3600 after two stable weeks
[ ] Records never deleted (certificate auto-renewal depends on them)
```

## 9. Troubleshooting pointers

| Symptom | First checks |
| --- | --- |
| `dig` returns nothing / NXDOMAIN | NS delegation incomplete; check registrar nameservers (§2) |
| Certificate stuck "Pending" | CNAME not resolving yet, or TXT validation record missing (§4) |
| Browser shows wrong certificate | You hit the app host before the domain was bound; retry after **Issued** |
| OAuth `redirect_uri_mismatch` | §7 item 1; compare the exact URI string |
| Stripe events stop after cutover | §7 item 2; old URL still registered in the dashboard |
| Magic links point at `azurecontainerapps.io` | `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL` not updated (§7 item 6) |

Full symptom → fix runbooks: [`troubleshooting.md`](./troubleshooting.md) (DNS, SSL, webhook sections).

## 10. Official Documentation

- Azure DNS zone + records — https://learn.microsoft.com/azure/dns/
- Container Apps custom domains — https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates
- Front Door custom domain / apex support — https://learn.microsoft.com/azure/frontdoor/
- DNS + TLS cross-cloud background — [`../06-dns-and-domains.md`](../06-dns-and-domains.md)
- Google OAuth redirect URI setup — https://developers.google.com/identity/protocols/oauth2/web-server
- Stripe webhook endpoint management — https://docs.stripe.com/webhooks
