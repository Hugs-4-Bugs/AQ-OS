# Terraform on AWS — Infrastructure as Code for AcquisitionOS

This chapter teaches Terraform from zero and applies it to the exact architecture in [`manual-deployment.md`](./manual-deployment.md). By the end you can reproduce the whole AWS deployment with code, review it in pull requests, and tear environments down without console archaeology.

**Repository alignment first (important):** this repo already ships an AWS-oriented Terraform at `deploy/terraform/main.tf` (+ `variables.tf`, `outputs.tf`) — VPC, subnets, RDS, ElastiCache, ECS/ALB, S3, IAM, CloudWatch; S3 backend `acquisitionos-terraform-state`; `required_version >= 1.5`; provider `~> 5.0`. **That file is the starting point and matches this handbook's architecture.** Use it as the reference implementation; the representative code below mirrors it and closes the gaps listed in §2 so it fully matches the current single-container app.

---

## 1. Terraform concepts in 5 minutes

| Concept | What it is | Example in this project |
| --- | --- | --- |
| **Provider** | Plugin that talks to a cloud API (`aws`) | `hashicorp/aws ~> 5.0` (matches the repo) |
| **Resource** | A piece of infrastructure Terraform owns | `aws_db_instance.postgres` |
| **Data source** | Read-only lookup of something that exists | `data "aws_caller_identity" "current"` |
| **Variable / Output** | Inputs with types/defaults; readable results | `var.vpc_cidr`, `output "alb_dns_name"` |
| **Module** | Reusable folder of resources | `modules/vpc/`, `modules/ecs-app/` |
| **State** | Terraform's record of what it created (`terraform.tfstate`) | Lives in the S3 backend, not in Git |
| **Backend** | Where state is stored | S3 (bucket `acquisitionos-terraform-state`) |
| **Workspace / environments** | Separate state per environment | `terraform/environments/{dev,staging,production}` (§9) |

Core mental model: you declare **desired state**; Terraform computes a **plan** (what will change) and **applies** it. Never edit state by hand; never hand-tweak resources in the console after they are Terraform-managed (drift).

---

## 2. What the existing `deploy/terraform/main.tf` already gets right — and the deltas

Already correct and reusable as-is (or as module bodies):

- VPC `10.0.0.0/16`, IGW, 2 public + 2 private + 2 database subnets, NAT gateway, route tables (`aws_vpc`, `aws_subnet`, `aws_nat_gateway`, ...).
- Security-group layering: ALB (80/443 world) → ECS (3000 from ALB) → RDS (5432 from ECS) → Redis (6379 from ECS).
- RDS: `storage_encrypted`, `multi_az`, `backup_retention_period = 30`, backup/maintenance windows, `deletion_protection`, final snapshot, Performance Insights.
- SSM-parameter group with connection logging; ALB with access logs + deletion protection; ACM DNS-validated cert; ECS cluster with container insights; task execution role; CloudWatch alarms; S3 buckets (backups/uploads/logs) with lifecycle rules.

Deltas to make it match the **current** AcquisitionOS (single container, port 3000, SSE, Secrets Manager, EventBridge):

1. Target group health check: repo uses `path = "/"` + matcher `200-399` → change to `path = "/api/health"`, matcher `200`.
2. Delete the `aws_lb_target_group.backend` (port 8000) and its listener rule — the app has no separate backend on 8000; also remove port 8000 from the ECS security group.
3. Raise ALB idle timeout for SSE: `idle_timeout = 3600` (repo does not set it; default 60 s breaks SSE).
4. Engine: repo pins `15.4` → use current `16.x`; parameter family `postgres16`; add `rds.force_ssl = 1`.
5. Repo has no **ECS task definition / service** resources and no image variables wired to ECR — add per §4.7 (its `container_image_frontend/backend` defaults reference a Docker Hub split that does not exist here).
6. Add Secrets Manager secrets (repo's IAM policy reads SSM parameters) and inject via task def `secrets` — §4.6/4.7.
7. Add EventBridge scheduled rules + API destinations for the 15 cron endpoints — §4.8 (repo has no scheduler).
8. Optional: RDS Proxy, ElastiCache wiring to `REDIS_URL` (repo defines the ElastiCache cluster — keep it only if you enable the optional Redis fan-out).

> Reminder: `deploy/k8s/*` is a legacy Celery/Redis/Postgres template set that does not match this app — nothing in this chapter uses it.

---

## 3. Project structure

```text
deploy/terraform-aws/                # or extend the existing deploy/terraform/
├── README.md                        # how to run this (init/plan/apply per env, who owns it)
├── modules/
│   ├── vpc/                         # VPC, subnets, IGW, NAT, route tables
│   ├── security-groups/             # the 3-4 SGs (§2 list)
│   ├── ecr/
│   ├── rds/                         # subnet group, parameter group, instance
│   ├── secrets/                     # Secrets Manager secrets
│   ├── ecs-app/                     # cluster, roles, task def, service, log group
│   ├── alb/                         # ALB, target group, listeners, ACM, Route 53
│   └── cron/                        # EventBridge connection + destinations + rules
└── environments/
    ├── dev/                         # main.tf (module calls + backend), terraform.tfvars
    ├── staging/
    └── production/
```

Why modules + per-environment directories: modules remove copy-paste; directories give each environment its own state file and its own backend block (backend values are static — you cannot parametrize `key` with variables, which is the main reason directory-per-environment beats one shared config).

---

## 4. Representative code (mirrors `deploy/terraform/main.tf` + the §2 deltas)

### 4.1 `environments/production/main.tf` — provider, versions, backend

```hcl
terraform {
  required_version = ">= 1.5"            # matches repo
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }   # matches repo
  }
  backend "s3" {
    bucket = "acquisitionos-terraform-state"
    key    = "environments/production/terraform.tfstate"   # per-env static key
    region = "us-east-1"
    # Locking: classic = dynamodb_table = "terraform-locks".
    # Terraform >= 1.10 supports S3-native locking instead: use_lockfile = true.
    # Verify against current Terraform docs for your version (NEEDS VERIFICATION);
    # the repo's backend block sets neither — pick one and apply it consistently.
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = { Project = "acquisitionos", Environment = var.environment, ManagedBy = "terraform" } }
}

data "aws_caller_identity" "current" {}
```

### 4.2 `variables.tf` (trimmed; the repo's `variables.tf` is the full set)

```hcl
variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "environment" {
  type    = string
  default = "production"
}
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
variable "domain"   { type = string }   # app.yourdomain.com
variable "app_host" { type = string }   # host to serve, e.g. app.yourdomain.com
variable "image_tag" { type = string }  # git SHA from CI
variable "rds_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "rds_master_password" {
  type      = string
  sensitive = true
}
variable "db_password" {
  type      = string
  sensitive = true
}   # for the app_user secret
variable "ecs_cpu" {
  type    = number
  default = 1024
}
variable "ecs_memory" {
  type    = number
  default = 2048
}
variable "desired_count" {
  type    = number
  default = 2   # HA; 1 is acceptable to start
}
variable "secret_values" {
  type    = map(string)
  default = {}
}
```

### 4.3 VPC + subnets + IGW + NAT (`modules/vpc`)

Identical in shape to `deploy/terraform/main.tf` lines 42–150 — VPC with DNS support, `cidrsubnet(var.vpc_cidr, 8, n)` for 2 public + 2 private subnets across 2 AZs, IGW, public route table → IGW, private route table → NAT gateway in public subnet 0, EIP, associations. Do not change the topology: ALB needs the public subnets, tasks + RDS need the private ones.

### 4.4 Security groups (`modules/security-groups`)

As in the repo: `aws_security_group.alb` (80/443 from `0.0.0.0/0`), `aws_security_group.ecs` (3000 from `alb` — drop the 8000 rule), `aws_security_group.rds` (5432 from `ecs`), `aws_security_group.redis` (6379 from `ecs`, only if Redis enabled). Egress all-traffic on each.

### 4.5 ECR

```hcl
resource "aws_ecr_repository" "app" {
  name                 = "acquisitionos"
  image_tag_mutability = "MUTABLE"        # we push :latest + :sha; consider IMMUTABLE + CI-only latest
  image_scanning_configuration { scan_on_push = true }
}
```

### 4.6 RDS + Secrets Manager (`modules/rds`, `modules/secrets`)

```hcl
resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-db-subnets"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_parameter_group" "main" {
  family = "postgres16"
  name   = "${var.environment}-pg16-params"
  parameter {
    name  = "rds.force_ssl"
    value = "1"          # REQUIRED: TLS for all clients
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
}

resource "aws_db_instance" "postgres" {
  identifier                   = "acquisitionos-${var.environment}"
  engine                       = "postgres"
  engine_version               = "16.4"                   # pin the exact version RDS lists for your region
  instance_class               = var.rds_instance_class
  allocated_storage            = 50
  max_allocated_storage        = 500                      # storage autoscaling
  storage_type                 = "gp3"
  storage_encrypted            = true                     # REQUIRED
  db_name                      = "acquisitionos"
  username                     = "postgres"
  password                     = var.rds_master_password
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [var.rds_sg_id]
  parameter_group_name         = aws_db_parameter_group.main.name
  multi_az                     = true                     # trade-off: cost vs HA (see database.md)
  backup_retention_period      = 30                       # >= 7 required; repo uses 30
  backup_window                = "03:00-04:00"
  deletion_protection          = true                     # REQUIRED
  skip_final_snapshot          = false
  final_snapshot_identifier    = "acquisitionos-${var.environment}-final"
  performance_insights_enabled = true
}

resource "aws_secretsmanager_secret" "env" {
  for_each = var.secret_values
  name     = "acquisitionos/${var.environment}/${each.key}"
}
resource "aws_secretsmanager_secret_version" "env" {
  for_each      = var.secret_values
  secret_id     = aws_secretsmanager_secret.env[each.key].id
  secret_string = each.value
  # values come from CI/OIDC or tfvars marked sensitive — never committed for production
}
```

### 4.7 ECS: cluster, roles, task definition, service (`modules/ecs-app`)

```hcl
resource "aws_ecs_cluster" "main" {
  name = "acquisitionos-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/acquisitionos/${var.environment}"
  retention_in_days = 30
}

# execution role: pull image + read secrets (repo builds this role — reuse it;
# narrow its inline policy to secretsmanager:GetSecretValue on "${prefix}/*")

resource "aws_ecs_task_definition" "app" {
  family                   = "acquisitionos-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name  = "acquisitionos"
    image = "${var.ecr_repository_url}:${var.image_tag}"
    portMappings = [{ containerPort = 3000, protocol = "tcp", appProtocol = "http" }]
    environment = [
      { name = "NODE_ENV",       value = "production" },
      { name = "APP_PUBLIC_URL", value = "https://${var.app_host}" },
      { name = "LOG_LEVEL",      value = "info" }
      # ... full non-secret list from secrets.md §2
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.env["DATABASE_URL"].arn },
      { name = "DIRECT_URL",   valueFrom = aws_secretsmanager_secret.env["DIRECT_URL"].arn },
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.env["JWT_SECRET"].arn }
      # ... full secret list from secrets.md §2
    ]
    healthCheck = {
      command = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"],
      interval = 30, timeout = 10, retries = 3, startPeriod = 60
    }
    logConfiguration = {
      logDriver = "awslogs"
      options   = { "awslogs-group" = aws_cloudwatch_log_group.app.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "ecs" }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "acquisitionos-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count
  health_check_grace_period_seconds = 60
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_sg_id]
    assign_public_ip = false                  # requires NAT; true + public subnets as no-NAT alternative
  }
  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "acquisitionos"
    container_port   = 3000
  }
  depends_on = [var.alb_https_listener_arn]
}
```

### 4.8 ALB + target group + ACM + Route 53 (`modules/alb`)

```hcl
resource "aws_lb" "main" {
  name                       = "acquisitionos-${var.environment}"
  load_balancer_type         = "application"
  security_groups            = [var.alb_sg_id]
  subnets                    = var.public_subnet_ids
  idle_timeout               = 3600            # SSE: default 60 s breaks streams; >= 120 s minimum
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "app" {
  name                 = "acquisitionos-${var.environment}-tg"
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 30                   # grace for in-flight SSE on deploys
  health_check {
    path                = "/api/health"       # REQUIRED: the repo's "/" fails the DB check semantics
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_acm_certificate" "main" {
  domain_name       = var.app_host
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cert_validation" {          # per unique_to_be_created validation records
  for_each = { for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => dvo }
  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 60
  records = [each.value.resource_record_value]
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

data "aws_route53_zone" "main" { name = var.domain }

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.app_host
  type    = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
# add a second aws_route53_record type "AAAA" (same alias) for IPv6 clients
```

### 4.9 EventBridge: the 15 cron endpoints (`modules/cron`)

```hcl
variable "cron_jobs" {
  type = map(object({ path = string, schedule = string }))
  default = {
    expire_api_keys    = { path = "/api/cron/expire-api-keys",    schedule = "rate(30 minutes)" }
    hot_lead_scan      = { path = "/api/cron/hot-lead-scan",      schedule = "rate(30 minutes)" }
    process_sequences  = { path = "/api/cron/process-sequences",  schedule = "rate(10 minutes)" }
    sequence_processing= { path = "/api/cron/sequence-processing",schedule = "rate(10 minutes)" }
    meeting_reminders  = { path = "/api/cron/meeting-reminders",  schedule = "rate(10 minutes)" }
    gmail_replies      = { path = "/api/cron/process-gmail-replies", schedule = "rate(10 minutes)" }
    autonomous_outreach= { path = "/api/cron/autonomous-outreach",schedule = "rate(30 minutes)" }
    sdr_cycle          = { path = "/api/cron/sdr-cycle",          schedule = "rate(30 minutes)" }
    credit_renewal     = { path = "/api/cron/credit-renewal",     schedule = "cron(0 2 * * ? *)" }
    end_of_period      = { path = "/api/cron/end-of-period",      schedule = "cron(0 2 * * ? *)" }
    renew_subs         = { path = "/api/cron/renew-subscriptions",schedule = "cron(0 2 * * ? *)" }
    payment_reconcile  = { path = "/api/cron/payment-reconciliation", schedule = "cron(15 2 * * ? *)" }
    process_billing    = { path = "/api/payments/process-billing", schedule = "cron(0 3 * * ? *)" }
    retry_emails       = { path = "/api/feedback/retry-emails",   schedule = "cron(30 3 * * ? *)" }
  }   # /api/gmail/jobs/process: separate connection (GMAIL_CRON_API_KEY) — add when Gmail pull mode is used
}

resource "aws_cloudwatch_event_connection" "cron" {
  name               = "acquisitionos-cron"
  authorization_type = "API_KEY"
  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${var.cron_secret}"   # sensitive variable
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "cron" {
  for_each             = var.cron_jobs
  name                 = "acquisitionos-${each.key}"
  connection_arn       = aws_cloudwatch_event_connection.cron.arn
  invocation_endpoint  = "https://${var.app_host}${each.value.path}"
  http_method          = "POST"
}

resource "aws_cloudwatch_event_rule" "cron" {
  for_each            = var.cron_jobs
  name                = "acquisitionos-${each.key}"
  schedule_expression = each.value.schedule
}

resource "aws_cloudwatch_event_target" "cron" {
  for_each = var.cron_jobs
  rule     = aws_cloudwatch_event_rule.cron[each.key].name
  arn      = aws_cloudwatch_event_api_destination.cron[each.key].arn
  id       = "app"
}
```

### 4.10 `outputs.tf` (repo already has most)

```hcl
output "alb_dns_name"   { value = module.alb.dns_name }
output "rds_endpoint"   { value = module.rds.endpoint }          # mark sensitive = true if it embeds a password
output "ecr_repository" { value = module.ecr.repository_url }
```

---

## 5. Commands — and when NOT to destroy

```bash
cd environments/production
terraform init          # downloads providers; configures the S3 backend (first time / after backend edits)
terraform fmt -recursive      # canonical formatting — run in CI
terraform validate            # syntax/type check
terraform plan -out=tfplan    # READ-ONLY diff of what would change; read it line by line
terraform apply tfplan        # executes the reviewed plan
terraform destroy             # ⚠ deletes everything — see below
```

**When NOT to destroy:** never run `destroy` against an environment with a production database. `deletion_protection = true` on RDS and the ALB makes Terraform fail rather than delete — keep them on; if a teardown is ever genuinely required, the documented path is: snapshot → flip the protection flags explicitly in review → destroy. "Plan shows destroy" in CI means stop, not approve.

---

## 6. State: remote, locked, restricted

- **Remote S3 backend (required):** local state on one laptop cannot be reconciled with teammates. The repo already declares `bucket = "acquisitionos-terraform-state"`; create that bucket once (versioning + SSE on) before the first `init`.
- **Locking:** state locking prevents two applies from corrupting state. Options: a small DynamoDB table (`dynamodb_table` in the backend block) or, Terraform >= 1.10, S3-native locking with `use_lockfile = true`. Behavior depends on your Terraform version — `NEEDS VERIFICATION` against https://developer.hashicorp.com/terraform/language/backend/s3 for the version your team pins; pick one mechanism and apply it to every environment.
- **Security:** state can contain secrets (e.g., `rds_master_password`, generated `secret_string` values). Restrict the bucket with a bucket policy (IAM principals of the team only, no public access), enable versioning (state history = instant state rollback), and never commit `terraform.tfstate*` (add to `.gitignore`).
- **Team usage:** everyone runs `plan`/`apply` against the same backend; only one apply runs at a time (locking); review plans in PRs (§8) instead of sharing consoles.

---

## 7. Variables: three ways to pass values

| Method | Example | Use for |
| --- | --- | --- |
| `terraform.tfvars` (+ `-var-file=env.tfvars`) | `vpc_cidr = "10.0.0.0/16"` | Non-secret, per-environment values (gitignore tfvars that contain secrets) |
| `-var` flag | `terraform apply -var="image_tag=abc1234"` | One-off overrides, CI-injected image tags |
| Environment variables | `TF_VAR_db_password=... terraform plan` | Secrets — never written to disk or shell history in plaintext |

Mark secret variables `sensitive = true`; plan output masks them. Generated values (DB password, `JWT_SECRET`) are better generated by CI or passed via `TF_VAR_*` than stored in tfvars.

---

## 8. CI/CD: plan on PR, apply on main with approval, OIDC only

Pattern (full pipeline context in [`../05-cicd.md`](../05-cicd.md)): pull request → `fmt`, `validate`, `plan` posted as PR output; merge to `main` → apply to staging → (GitHub Environment approval) → apply to production. No static AWS keys anywhere: GitHub assumes an AWS IAM role via OIDC with `aws-actions/configure-aws-credentials`.

```yaml
# .github/workflows/terraform-aws.yml (deploy job, production)
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/github-terraform-apply
    aws-region: us-east-1
- run: terraform -chdir=environments/production init -input=false
- run: terraform -chdir=environments/production apply -input=false -auto-approve
```

The trusted role (`github-terraform-apply`) has a trust policy limited to `token.actions.githubusercontent.com` with `sub` = `repo:YOUR_ORG/REPO:environment:production`; the GitHub **Environment** carries the required-reviewer approval gate. CI also builds/pushes the image first and passes the git SHA as `-var="image_tag=..."` so every apply deploys a known, traceable image.

---

## 9. Workspaces vs environments (pick one)

- **Directory per environment (recommended, used above):** explicit, separate backends, separate variables, easy diffing between environments; slight duplication of the `main.tf` glue.
- **Terraform workspaces (`terraform.workspace`):** one config, `dev`/`staging`/`production` workspaces; less duplication but easy to apply to the wrong workspace and harder to keep per-env backend isolation.
This handbook standardizes on directories; if you inherit a workspace-based setup, keep the backend key convention consistent and document it in the module `README.md`.

---

## 10. Official Documentation

- Terraform language docs — https://developer.hashicorp.com/terraform/language
- AWS provider — https://developer.hashicorp.com/terraform/language/providers/aws
- S3 backend (+ locking options) — https://developer.hashicorp.com/terraform/language/backend/s3
- Modules — https://developer.hashicorp.com/terraform/language/modules/develop
- aws-actions/configure-aws-credentials — https://github.com/aws-actions/configure-aws-credentials
- GitHub OIDC to AWS — https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
