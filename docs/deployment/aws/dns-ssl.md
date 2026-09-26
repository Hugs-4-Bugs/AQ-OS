# DNS + SSL — Route 53 and ACM for `app.yourdomain.com`

This page gives the app its public name and its TLS certificate: a Route 53 record pointing `app.yourdomain.com` at the ALB, and an ACM certificate the ALB uses to terminate HTTPS. Both are REQUIRED FOR CURRENT ACQUISITIONOS — auth cookies are `secure` in production, magic links and OAuth redirects use the public URL, and every webhook provider registers an `https://` endpoint ([`backend.md`](./backend.md) §11). Domain fundamentals live in [`../06-dns-and-domains.md`](../06-dns-and-domains.md); this page is the AWS-specific execution.

Placeholders used below (with where-to-get notes):

- `YOUR_ACCOUNT_ID` — `aws sts get-caller-identity --query Account --output text`
- `${APP_HOST}` = `app.yourdomain.com` — the domain you own (bought or delegated per [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §2)
- `${ALB_DNS}` and zone id — printed by the ALB creation step in [`manual-deployment.md`](./manual-deployment.md) §8.1, or fetch: `aws elbv2 describe-load-balancers --names acquisitionos-prod --query "LoadBalancers[0].[DNSName,CanonicalHostedZoneId]" --output text`

---

## 1. Hosted zone in Route 53

**What:** the authoritative DNS zone for `yourdomain.com`. **Why:** Route 53 lets you create ALIAS records (AWS's CNAME-that-works-at-the-apex) and gets you one-click ACM validation.

```bash
aws route53 create-hosted-zone --name yourdomain.com \
  --caller-reference "acquisitionos-$(date +%s)" \
  --query "DelegationSet.NameServers" --output text --region ${AWS_REGION}
```

**Expected output:** four name servers like `ns-123.awsdns-45.com ...`.

**Verify / delegate:** if the domain was bought at another registrar, set those four NS values there (registrar's DNS settings page). Confirm delegation:

```bash
dig NS yourdomain.com +short     # → the same four awsdns name servers
```

Already using another DNS provider (Cloudflare, registrar DNS)? That is fine — the ALB CNAME/ALIAS works there too (see §4, "external DNS" column). Route 53 just makes §2 and §5 easier. If the zone is public-facing through another provider, ACM validation still works: you create the CNAME they print (§2.3).

---

## 2. ACM public certificate (DNS-validated)

**What:** a free, auto-renewing TLS certificate for `${APP_HOST}`. **Why:** the ALB terminates TLS with it; DNS validation means no email round-trips.

> Region matters: the certificate **must be requested in the same region as the ALB** (`us-east-1` throughout this guide). A cert in another region simply will not appear in the listener dropdown — this is the #1 "SSL not working" cause (see [`troubleshooting.md`](./troubleshooting.md) §3).

```bash
CERT_ARN=$(aws acm request-certificate --domain-name ${APP_HOST} \
  --validation-method DNS --region ${AWS_REGION} --query CertificateArn --output text)
echo "CERT_ARN=${CERT_ARN}"
```

**Expected output:** an ARN like `arn:aws:acm:us-east-1:YOUR_ACCOUNT_ID:certificate/uuid`; status `PENDING_VALIDATION`.

**Validation record — two ways:**

1. **Console one-click (easiest):** ACM → Certificate → "Create records in Route 53". Adds the CNAME for you.
2. **CLI:** fetch the record and add it to the zone yourself:

```bash
aws acm describe-certificate --certificate-arn ${CERT_ARN} --region ${AWS_REGION} \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord"
# → {"Name":"_xxxx.app.yourdomain.com.","Type":"CNAME","Value":"_yyyy.acm-validations.aws."}

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name yourdomain.com \
  --query "HostedZones[0].Id" --output text --region ${AWS_REGION} | cut -d/ -f3)

aws route53 change-resource-record-sets --hosted-zone-id ${ZONE_ID} --change-batch '{
  "Changes": [{"Action": "UPSERT", "ResourceRecordSet": {
    "Name": "_xxxx.app.yourdomain.com", "Type": "CNAME", "TTL": 300,
    "ResourceRecords": [{"Value": "_yyyy.acm-validations.aws"}]}}]}' --region ${AWS_REGION}
```

Wait for issuance (minutes, sometimes ~30 min):

```bash
aws acm wait certificate-validated --certificate-arn ${CERT_ARN} --region ${AWS_REGION}
aws acm describe-certificate --certificate-arn ${CERT_ARN} \
  --query "Certificate.Status" --output text      # → ISSUED
```

**Auto-renew:** DNS-validated ACM certificates renew themselves as long as the validation CNAME stays in the zone. Do not delete it — it is not disposable.

---

## 3. HTTPS listener + HTTP→HTTPS redirect

**What/Why:** the ALB answers 443 with the certificate and answers 80 with a permanent redirect. The redirect step is REQUIRED — auth cookies are secure-only, so an accidental `http://` visit that does not redirect breaks login confusingly.

This is step 11.3 of [`manual-deployment.md`](./manual-deployment.md) §11; repeated for completeness:

```bash
aws elbv2 create-listener --load-balancer-arn ${ALB_ARN} --protocol HTTPS --port 443 \
  --certificates CertificateArn=${CERT_ARN} \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=${TG_ARN}

HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn ${ALB_ARN} \
  --query "Listeners[?Port=='80'].ListenerArn" --output text)
aws elbv2 modify-listener --listener-arn ${HTTP_LISTENER_ARN} \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

**Verify:**

```bash
curl -sI http://${ALB_DNS}/api/health  | head -1    # → HTTP/1.1 301 Moved Permanently
curl -sI https://${ALB_DNS}/api/health | head -1    # → HTTP/1.1 200 OK
```

---

## 4. Route 53 records: A/AAAA ALIAS to the ALB

**What:** `app.yourdomain.com` → the ALB, using an **ALIAS** record (A for IPv4 + AAAA for IPv6 — point both at `dualstack.${ALB_DNS}`). **Why ALIAS and not CNAME:** CNAMEs are illegal on a zone apex, ALIAS records are not, and Route 53 resolves them for free (no query charge).

```bash
cat > r53-alias.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${APP_HOST}",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "ALB_CANONICAL_ZONE_ID",
        "DNSName": "dualstack.${ALB_DNS}",
        "EvaluateTargetHealth": true
      }
    }
  },
  {
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${APP_HOST}",
      "Type": "AAAA",
      "AliasTarget": {
        "HostedZoneId": "ALB_CANONICAL_ZONE_ID",
        "DNSName": "dualstack.${ALB_DNS}",
        "EvaluateTargetHealth": true
      }
    }
  }]
}
EOF
aws route53 change-resource-record-sets --hosted-zone-id ${ZONE_ID} \
  --change-batch file://r53-alias.json --region ${AWS_REGION}
```

`ALB_CANONICAL_ZONE_ID` is the ALB's `CanonicalHostedZoneId` from §0's fetch command (not your hosted zone id). `EvaluateTargetHealth: true` makes the alias follow target health.

**Apex vs `www`:**

- **Apex (`yourdomain.com`) works with ALIAS** — that is the point of the record type. If you want the apex to serve the app, repeat the two records with `"Name": "yourdomain.com"`.
- **`www.yourdomain.com`:** either another ALIAS pair to the same ALB, or redirect `www` → `app` at the ALB with a listener rule (OPTIONAL; the app itself does not care which host serves it, but Google OAuth and webhooks must use exactly one canonical host — pick `${APP_HOST}` and stay with it, [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §5).

**External DNS instead of Route 53 (OPTIONAL path):** create a plain `CNAME app → ${ALB_DNS}` at your provider (apex cannot CNAME there — most providers offer an "ALIAS/ANAME" flat record; if not, keep the apex parked and serve only from `app.`).

**Verify:**

```bash
dig ${APP_HOST} +short          # → ALB IP addresses (or the ALB DNS via CNAME)
curl -i https://${APP_HOST}/api/health   # → 200, "database":{"status":"healthy"}
```

Propagation: new records in Route 53 typically resolve globally within a couple of minutes; records you *changed* may serve old answers until prior TTLs expire (next section).

---

## 5. TTL guidance

- **ALB ALIAS records:** TTL is managed by Route 53 (60 s) and you do not set it — ALB IPs can change, so never pin them.
- **ACM validation CNAME:** leave at the default (300 s) and keep it forever (auto-renewal depends on it).
- **Any CNAMEs you create at an external provider:** 300 s (5 min) for the app record — short enough to fix a mistake quickly, long enough to be cache-friendly. Raise to 3600 only once the setup is stable and you never plan to move it.
- **Migrations from an old host:** lower the old record's TTL to 300 a day *before* the cutover (see [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §6), then switch and watch.

---

## 6. After the cutover — update everything that embeds the hostname

**What/Why:** URLs registered elsewhere still point at the old host or at `localhost`. Do this once the record resolves:

1. **Google OAuth redirect URIs** — Google Cloud Console → Credentials → your OAuth client → Authorized redirect URIs. The app's callback path is `/api/auth/google/callback` (verified in `src/app/api/auth/google/`); whitelist exactly `https://app.yourdomain.com/api/auth/google/callback` (the app also exposes `/api/auth/google/redirect-uri` to print the correct URI). Then confirm the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` pair is already in Secrets Manager ([`secrets.md`](./secrets.md) §2).
2. **Stripe / Razorpay webhook URLs** — re-register or edit to `https://app.yourdomain.com/api/payments/webhook/stripe` (Stripe) / `https://app.yourdomain.com/api/payments/webhook/razorpay` (Razorpay) and re-copy the signing secret if a new endpoint was created ([`backend.md`](./backend.md) §11).
3. **Gmail Pub/Sub subscription push endpoint** (OPTIONAL) — set `GMAIL_PUBSUB_WEBHOOK_URL` to `https://app.yourdomain.com/api/gmail/pubsub/webhook`.
4. **Telegram webhook** (OPTIONAL) — set the bot's webhook to `https://app.yourdomain.com/telegram-webhook-path`-equivalent per the app's config UI; the route is `POST /api/telegram/webhook`.
5. **`APP_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL`** — must already equal `https://app.yourdomain.com` ([`backend.md`](./backend.md) §5). If you deployed with a placeholder, fix `APP_PUBLIC_URL` (runtime) and **rebuild the image** for `NEXT_PUBLIC_APP_URL` (build-time) — otherwise magic links carry the wrong host ([`troubleshooting.md`](./troubleshooting.md) §11).
6. **EventBridge API destinations** — they target `https://${APP_HOST}/api/cron/**`; if you created them before the DNS cutover with a placeholder host, re-point them ([`cicd.md`](./cicd.md) §8).

---

## 7. Troubleshooting pointers

Full runbook: [`troubleshooting.md`](./troubleshooting.md). The two DNS/SSL classics:

| Symptom | Most likely cause | First check |
| --- | --- | --- |
| `dig app.yourdomain.com` empty | Delegation not done, or record created in the wrong zone | `dig NS yourdomain.com +short` — do the four `awsdns` servers answer? |
| Cert stays `PENDING_VALIDATION` | Validation CNAME missing/typo'd, or created in a different zone than the record ACM checked | Compare ACM's `ResourceRecord` with `dig _xxxx.app.yourdomain.com CNAME +short` |
| `SSL handshake failure` via domain, fine via ALB DNS | Listener has no/`wrong-region` certificate | `aws elbv2 describe-listeners --load-balancer-arn ${ALB_ARN}` — certificate ARN region must be `us-east-1` |
| Browser warning "certificate is for another domain" | Cert requested for apex only, app served from `app.` (or vice versa) | `openssl s_client -connect ${APP_HOST}:443 -servername ${APP_HOST} </dev/null 2>/dev/null | openssl x509 -noout -subject` |

---

## 8. Checklist

```text
[ ] Hosted zone created; registrar points at the four Route 53 name servers
[ ] ACM cert ISSUED in us-east-1 (same region as the ALB); validation CNAME still present
[ ] HTTPS :443 listener with ELBSecurityPolicy-TLS13-1-2-2021-06; HTTP :80 returns 301
[ ] A + AAAA ALIAS records for ${APP_HOST} → dualstack.${ALB_DNS}, EvaluateTargetHealth=true
[ ] curl https://${APP_HOST}/api/health → 200 over TLS
[ ] Google OAuth redirect URI updated to https://app.yourdomain.com/api/auth/google/callback
[ ] Stripe/Razorpay (and optional Gmail/Telegram) webhook URLs use the live domain
[ ] APP_PUBLIC_URL / NEXT_PUBLIC_APP_URL match the live domain
```

---

## 9. Official Documentation

- Route 53 hosted zones — https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-working-with.html
- Route 53 ALIAS/alias target — https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html
- ACM DNS validation — https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html
- ACM auto-renewal — https://docs.aws.amazon.com/acm/latest/userguide/renewal.html
- ALB listeners + HTTPS redirect — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html
- ALB DNS name & canonical hosted zone — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#load-balancer-attributes
