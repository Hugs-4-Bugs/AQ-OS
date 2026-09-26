# Monitoring — CloudWatch, Alarms, Probes, OTel

Monitoring on AWS has four layers, cheap to expensive: **container logs** (awslogs → CloudWatch Logs, already on), **service metrics** (ECS/ALB/RDS publish to CloudWatch automatically), **synthetic probes** (Route 53 health checks hitting `/api/health`), and **traces** (OpenTelemetry OTLP → a collector). This page wires them up with concrete commands and recommended alarms. The alarm philosophy: everything in §4 is a "your users are or will soon be sad" signal — not vanity dashboards.

Placeholders: `YOUR_ACCOUNT_ID`, `${PROJECT}` = `acquisitionos`, `${APP_HOST}` = `app.yourdomain.com`, log group `/acquisitionos/production` (all from [`manual-deployment.md`](./manual-deployment.md) §0/§7).

---

## 1. What you get for free vs what you must create

| Layer | Source | Setup needed |
| --- | --- | --- |
| Container stdout/stderr | awslogs driver → `/acquisitionos/production` | Retention only ([`backend.md`](./backend.md) §6) |
| ECS service metrics (CPUUtilization, MemoryUtilization) | ECS publishes these for Fargate tasks/service out of the box | Alarms only |
| ALB metrics (5XX, TargetResponseTime, UnHealthyHostCount) | ALB publishes automatically | Alarms only |
| RDS metrics (CPU, connections, storage) | RDS publishes automatically | Alarms only |
| Cron outcomes (EventBridge) | `FailedInvocations` per rule | Alarms only |
| External reachability | nothing automatic | Route 53 health checks (§6) |
| Traces | app OTel is wired via `src/instrumentation.ts` | OTLP endpoint/collector (§7) |

Two honest notes: **ALB access logs go to S3** (they are not log-group streams) and querying them needs Athena — OPTIONAL, only if you need per-request forensics beyond app logs (§9). **Memory at container granularity** — service-level `MemoryUtilization` is published by ECS for Fargate without an agent; per-container filesystem/pid metrics would need the CloudWatch agent (FUTURE/ALTERNATIVE — not needed for the current app).

---

## 2. Metric filters: turn log lines into metrics

**What/Why:** count `ERROR`-level app log lines as a CloudWatch metric so you can alarm on it, even when a request still returns 200.

```bash
aws logs put-metric-filter \
  --log-group-name /acquisitionos/production \
  --filter-name app-errors \
  --filter-pattern "ERROR" \
  --metric-transformations \
      MetricName=AppErrors, MetricNamespace=AcquisitionOS, MetricValue=1 \
  --region ${AWS_REGION}
```

Add one more filter for the cron/realtime surface (exact patterns depend on the log lines you see — verify with `aws logs tail` first, then match):

```bash
aws logs put-metric-filter \
  --log-group-name /acquisitionos/production \
  --filter-name sse-disconnects \
  --filter-pattern "\"realtime\" \"disconnect\"" \
  --metric-transformations \
      MetricName=SseDisconnects, MetricNamespace=AcquisitionOS, MetricValue=1 \
  --region ${AWS_REGION}
```

**Verify:** `aws logs describe-metric-filters --log-group-name /acquisitionos/production` lists both; generate an error in staging and `aws cloudwatch get-metric-statistics --metric-name AppErrors --namespace AcquisitionOS ...` shows a datapoint.

---

## 3. The first alarms to create (concrete commands)

**What/Why:** five alarms catch ~90% of real incidents in this architecture: target death, 5xx spike, latency, CPU saturation, and (RDS) connection exhaustion. SNS first, then the alarms:

```bash
aws sns create-topic --name acquisitionos-alerts --region ${AWS_REGION}
aws sns subscribe --topic-arn arn:aws:sns:${AWS_REGION}:YOUR_ACCOUNT_ID:acquisitionos-alerts \
  --protocol email --notification-endpoint you@yourdomain.com --region ${AWS_REGION}
# confirm via the email AWS sends you
```

| Alarm | Metric (namespace) | Threshold (start here) |
| --- | --- | --- |
| Target unhealthy | `UnHealthyHostCount` (AWS/ApplicationELB, per TG) | >= 1 for 2 datapoints of 1 min |
| Server errors | `HTTPCode_Target_5XX` (AWS/ApplicationELB) | Sum >= 5 in 5 min |
| Latency | `TargetResponseTime` p95 (AWS/ApplicationELB) | >= 2 s for 10 min |
| App CPU | `CPUUtilization` (AWS/ECS, per service) | >= 80% for 10 min |
| App memory | `MemoryUtilization` (AWS/ECS) | >= 80% for 10 min |
| DB connections | `DatabaseConnections` (AWS/RDS) | >= 80% of your connection budget ([`../04-database-production.md`](../04-database-production.md) §5) |
| DB CPU | `CPUUtilization` (AWS/RDS) | >= 80% for 10 min |
| DB disk | `FreeStorageSpace` (AWS/RDS) | < 10 GB |
| Cron failures | `FailedInvocations` (AWS/Events, per rule) | >= 1 (§5) |

```bash
# Example: 5XX alarm (repeat the pattern per row above)
aws cloudwatch put-metric-alarm --alarm-name aos-alb-5xx \
  --namespace AWS/ApplicationELB --metric-name HTTPCode_Target_5XX \
  --dimensions Name=LoadBalancer,Value=${ALB_ARN##*/} \
  --statistic Sum --period 300 --evaluation-periods 1 --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions arn:aws:sns:${AWS_REGION}:YOUR_ACCOUNT_ID:acquisitionos-alerts \
  --treat-missing-data notBreaching --region ${AWS_REGION}
```

The repo's `deploy/terraform/main.tf` already shows two of these as `aws_cloudwatch_metric_alarm` — mirror that shape for the rest (see [`terraform.md`](./terraform.md) §4).

**Verify:** `aws cloudwatch describe-alarms --query "MetricAlarms[].AlarmName"` lists them; set a test threshold (e.g., 5xx >= 0) once to confirm the SNS email arrives, then set the real threshold back.

---

## 4. Alarm tuning notes for this app

- **`HTTPCode_Target_5XX` vs `HTTPCode_ELB_5XX`:** target 5XX means the *app* errored; ELB 5XX means the ALB could not reach a healthy target. The first says "look at logs", the second says "look at target health/scaling" — separate alarms save triage time.
- **`TargetResponseTime` p95, not average** — averages hide slow SSE/SSE-handshake outliers; use `ExtendedStatistic: p95`.
- **Memory:** ECS publishes service-level `MemoryUtilization` for Fargate without any agent; that plus OOM-kill detection in [`troubleshooting.md`](./troubleshooting.md) §8 is enough to size tasks ([`backend.md`](./backend.md) §9).
- **`DatabaseConnections` budget:** with `connection_limit=10` per task, budget = running tasks × 10 + margin. Alarm at 80% of *budget*, not of `max_connections` — by the time you hit `max_connections`, you are already erroring.
- **PITR "lag":** RDS exposes no first-class PITR-lag metric; latest-restorable time is visible in the console/API during restore drills (NEEDS VERIFICATION for a dedicated alarm). Coverage comes from the drill cadence in [`backups.md`](./backups.md) §6.

---

## 5. Cron (EventBridge) monitoring

**What/Why:** a silently failing rule means expiring API keys, unreconciled payments, or dead sequences — no user complains, so nothing else notices.

```bash
for RULE in $(aws events list-rules --query "Rules[].Name" --output text --region ${AWS_REGION}); do
  aws cloudwatch put-metric-alarm --alarm-name "aos-cron-$RULE" \
    --namespace AWS/Events --metric-name FailedInvocations \
    --dimensions Name=RuleName,Value=$RULE \
    --statistic Sum --period 3600 --evaluation-periods 1 --threshold 0 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --alarm-actions arn:aws:sns:${AWS_REGION}:YOUR_ACCOUNT_ID:acquisitionos-alerts \
    --treat-missing-data notBreaching --region ${AWS_REGION}
done
```

Also alarm on `ThrottledRules` if you add high-frequency rules. For per-endpoint 200-vs-4xx/5xx confirmation, the **Log Insights queries in §10** beat metrics — the app logs each cron hit.

**Verify:** disable one rule temporarily, wait for the alarm to fire into SNS, re-enable. (Firing `FailedInvocations` on a healthy setup usually means the ALB idle timeout was reset, the domain moved, or the Connection's secret went stale — [`troubleshooting.md`](./troubleshooting.md) §17.)

---

## 6. Uptime probes: Route 53 health checks

**What/Why:** CloudWatch alarms are account-internal; a Route 53 health check tests the full public path (DNS → TLS → ALB → app → DB) from multiple AWS regions, like an external uptime service.

```bash
aws route53 create-health-check --caller-reference "aos-prod-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTPS",
    "FullyQualifiedDomainName": "app.yourdomain.com",
    "Port": 443,
    "ResourcePath": "/api/health",
    "RequestInterval": 30,
    "FailureThreshold": 3,
    "Regions": ["us-east-1","us-west-2","eu-west-1"]
  }'
```

Alarm on it:

```bash
HC_ID=$(aws route53 list-health-checks --query "HealthChecks[-1].Id" --output text)
aws cloudwatch put-metric-alarm --alarm-name aos-uptime \
  --namespace AWS/Route53 --metric-name HealthCheckStatus \
  --dimensions Name=HealthCheckId,Value=$HC_ID \
  --statistic Minimum --period 60 --evaluation-periods 2 --threshold 1 \
  --comparison-operator LessThanThreshold \
  --alarm-actions arn:aws:sns:${AWS_REGION}:YOUR_ACCOUNT_ID:acquisitionos-alerts \
  --region ${AWS_REGION}
```

**Verify:** the Route 53 console shows "Healthy" with ~0.x s latency from each region; stop the ECS service in staging and watch the alarm fire. Note `/api/health` checks the DB too — a green probe means the whole request path plus database works.

---

## 7. OpenTelemetry (OTLP) — traces and app metrics

**What:** the app registers OTel via `src/instrumentation.ts` and reads `OTEL_ENABLED`, `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` (verified — [`../01-architecture.md`](../01-architecture.md) §1 observability row). **Why:** logs tell you *what* failed; traces tell you *where and how long* (DB query vs AI call vs rendering).

- **CloudWatch does not accept raw OTLP.** Point `OTEL_EXPORTER_OTLP_ENDPOINT` at an **OpenTelemetry Collector** and let it export wherever you want: either (a) self-hosted collector as a sidecar/separate Fargate service in the same VPC, or (b) a vendor endpoint (Grafana/Datadog/Honeycomb — all accept OTLP natively).
- Starter task-def environment (values NON-secret):

```json
{ "name": "OTEL_ENABLED",                 "value": "true" },
{ "name": "OTEL_EXPORTER",                "value": "otlp" },
{ "name": "OTEL_EXPORTER_OTLP_ENDPOINT",  "value": "http://collector.local:4318" },
{ "name": "OTEL_SERVICE_NAME",            "value": "acquisitionos-prod" }
```

- `OTEL_SERVICE_NAME` per environment (`acquisitionos-prod`, `acquisitionos-staging`) keeps traces distinguishable. `LOG_LEVEL=info` controls the log layer separately ([`secrets.md`](./secrets.md) §2).
- The repo's `monitoring/` folder ships reference Prometheus + Grafana + OTel collector configs — usable as the self-hosted path.
- **AWS X-Ray correlation is OPTIONAL** (FUTURE/ALTERNATIVE): the ADOT collector can export to X-Ray for ServiceLens-style views; do not adopt X-Ray without first deciding you want AWS-native tracing over a vendor/Grafana stack (NEEDS VERIFICATION for ADOT sidecar sizing on Fargate).

**Verify:** `curl -s https://${APP_HOST}/api/health` still returns 200 with OTEL on; the collector receives batches (collector logs) and your backend of choice shows the `acquisitionos-prod` service.

---

## 8. Dashboards

**What/Why:** one page with the five numbers you check first. CloudWatch → Dashboards → Create (or CLI). Sketch (two widgets; add the §3 rows):

```bash
aws cloudwatch put-dashboard --dashboard-name acquisitionos-prod --dashboard-body '{
  "widgets": [
    { "type": "metric", "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": { "title": "ALB 5XX", "region": "us-east-1", "stat": "Sum",
        "metrics": [["AWS/ApplicationELB", "HTTPCode_Target_5XX", "LoadBalancer", "app/acquisitionos-prod/xxxxxxxx"]],
        "period": 300 } },
    { "type": "metric", "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": { "title": "ECS CPU + Memory", "region": "us-east-1", "stat": "Average",
        "metrics": [["AWS/ECS", "CPUUtilization", "ClusterName", "acquisitionos-prod", "ServiceName", "acquisitionos-app"],
                    [".", "MemoryUtilization", ".", ".", ".", "."]],
        "period": 300 } }
  ]}' --region ${AWS_REGION}
```

**Verify:** open the dashboard; each widget shows data. If a widget is empty, the dimension values are wrong — copy them from `aws cloudwatch list-metrics --namespace AWS/ECS` instead of typing them.

---

## 9. ALB access logs (S3 + Athena) — OPTIONAL

**What/Why:** per-request rows (client IP, path, target, status, timing) for forensics the app logs do not give you (e.g., which source IPs hammered `/api/auth/signin`). Enable per ALB:

```bash
aws s3 mb s3://${PROJECT}-alb-logs --region ${AWS_REGION}
aws elbv2 modify-load-balancer-attributes --load-balancer-arn ${ALB_ARN} \
  --attributes Key=access_logs.s3.enabled,Value=true \
               Key=access_logs.s3.bucket,Value=${PROJECT}-alb-logs \
               Key=access_logs.s3.prefix,Value=prod
```

Query via Athena (create a table over the S3 prefix — AWS docs include the ready-made DDL; see §11). Do this only when you actually need request-level forensics; app logs + metrics cover day-to-day operations.

---

## 10. CloudWatch Logs Insights — the queries to keep

Console → Logs → Logs Insights → log group `/acquisitionos/production`:

```sql
-- Last hour's errors, newest first
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100
```

```sql
-- Cron endpoint outcomes (adjust the path pattern to your log format)
fields @timestamp, @message
| filter @message like /api\/cron/
| stats count() by bin(5m)
```

```sql
-- 5xx responses by route (if you log status codes)
fields @timestamp, @message
| filter @message like /"status":5/
| stats count() by @message
| limit 50
```

```sql
-- Slowest DB-touching requests (when OTel/logs carry duration fields)
filter @message like /query duration/
| stats avg(durationMs) as avg_ms, max(durationMs) as max_ms by bin(15m)
```

Keep these in a saved-queries file in your ops repo — during an incident you want them pasted, not authored ([`troubleshooting.md`](./troubleshooting.md) §1).

---

## 11. CloudTrail audit trail

**What/Why:** CloudTrail records who did what in the AWS account (management events are on by default for 90 days). Create a trail for durable retention and tamper evidence — REQUIRED for production peace of mind, cheap to run:

```bash
aws cloudtrail create-trail --name acquisitionos-audit \
  --s3-bucket-name ${PROJECT}-audit-logs --is-multi-region-trail
aws cloudtrail start-logging --name acquisitionos-audit
```

**Verify:** `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateService --max-results 5` shows recent ECS changes with the principal that made them — invaluable when someone (or some pipeline) changed the wrong thing. AWS Config (OPTIONAL) adds resource-config history on top; skip until compliance requires it.

---

## 12. Monitoring checklist

```text
[ ] Log group retention set (30 days); awslogs streaming confirmed
[ ] Metric filters (app-errors at minimum) + namespace AcquisitionOS
[ ] SNS topic subscribed; alarms from §3 created and test-fired once
[ ] EventBridge FailedInvocations alarms for all 15 cron rules
[ ] Route 53 health check on https://${APP_HOST}/api/health from 3 regions + uptime alarm
[ ] OTLP endpoint set (collector or vendor); OTEL_SERVICE_NAME per environment
[ ] One dashboard with 5XX / healthy-hosts / CPU / memory / RDS panels
[ ] Two or three saved Logs Insights queries ready for incidents
[ ] CloudTrail trail created and start-logging confirmed
```

---

## 13. Official Documentation

- CloudWatch alarms — https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
- ECS CloudWatch metrics (Fargate) — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cloudwatch-metrics.html
- ALB metrics — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
- Metric filters — https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html
- EventBridge metrics — https://docs.aws.amazon.com/eventbridge/latest/userguide/monitoring-cloudwatch.html
- Route 53 health checks — https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks.html
- ALB access logs + Athena — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html
- CloudTrail — https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html
- OpenTelemetry Collector — https://opentelemetry.io/docs/collector/
