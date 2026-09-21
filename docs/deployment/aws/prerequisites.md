# AWS Prerequisites — Account, Access, Guardrails, CLI

Everything in this file is done **once per AWS account** (or once per environment if you deliberately isolate them). Time: 30–60 minutes. You will create the account foundation, protect it, set cost guardrails, pick a region, install and configure the AWS CLI, and understand quotas, account IDs, and ARNs.

---

## 1. What → Why overview

| Step | What | Why it matters for AcquisitionOS |
| --- | --- | --- |
| 1 | AWS account + root MFA | The root user can delete everything, including your production database |
| 2 | IAM admin user (or Identity Center) | Daily work must never use root; the CLI needs non-root credentials |
| 3 | Budgets + Cost Anomaly Detection | ECS, RDS, and NAT gateways bill continuously — you want alerts, not surprises |
| 4 | Region choice | Every resource in this guide must live in one region, or nothing can talk to anything |
| 5 | AWS CLI v2 + `aws configure` | Every command in `manual-deployment.md` and `terraform.md` uses it |
| 6 | Quota check (Fargate vCPU) | Fargate has a per-region vCPU quota; a too-low quota blocks `desired count 2` or scale-up |
| 7 | Key pair (optional) | Fargate tasks are not SSH-ed into; you only need a key pair for EC2-based debugging |

---

## 2. Create the AWS account and protect root

1. Sign up at https://portal.aws.amazon.com/ (email + payment card + phone verification). If you already have a personal account, prefer creating a **new dedicated account** for this deployment — clean billing, clean quotas, no surprise resource sharing.
2. Enable **MFA on the root user**: Console → sign in as root → top-right account name → **Security credentials** → **MFA** → assign a virtual MFA device (authenticator app) or hardware key. Expected: "MFA device assigned".

**Why:** the root user ignores every permission policy. Losing control of it means losing the account; a leaked root key means a leaked production database. Enabling MFA takes two minutes.

**Rules from now on:**
- Never create root **access keys** (the Security credentials page should show zero access keys for root).
- Use root only for the handful of tasks that require it (see https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html).

---

## 3. Create an IAM admin user for daily work (never daily-use root)

Console → search "IAM" → **Users** → **Create user**:

1. User name: `acquisitionos-admin`.
2. Permissions: **Attach policies directly** → `AdministratorAccess` (fine for a solo/learning setup; teams should scope this down later — see [`../00-prerequisites.md`](../00-prerequisites.md) §14 on least privilege).
3. Enable **console access** with a strong password + MFA (same procedure as root).

Then create CLI credentials for that user: user page → **Security credentials** → **Create access key** → use case "Command Line Interface (CLI)" → copy the **Access Key ID** and **Secret Access Key**. The secret is shown **only once** — store it in your password manager.

**IAM Identity Center note (teams):** if more than one person will operate this deployment, prefer **IAM Identity Center** (Console → "IAM Identity Center") instead of long-lived IAM users: people sign in via a portal with SSO, and you can enforce MFA centrally. For a single operator, a single IAM admin user is fine to start. `NEEDS VERIFICATION` is not required here — both paths are documented AWS patterns; pick one and stay consistent.

---

## 4. Cost guardrails: budgets + Cost Anomaly Detection

1. Console → **Billing and Cost Management** → **Budgets** → **Create budget** → "Monthly cost budget":
   - Amount: a number that would alarm you, e.g. `200 USD` (a minimal Fargate + RDS + ALB + NAT setup is well under this in most regions; the point is the alert, not the estimate).
   - Alert threshold: 80% actual + 100% forecasted, email `YOUR_EMAIL`.
2. Same console → **Cost Anomaly Detection** → **Create monitor** → monitor type "Custom" → dimensions: Service → **Create**. Add an alert subscription so anomalies email you.

**Verify:** Budgets list shows your budget as "OK"; anomaly monitor shows "Active" (it needs ~2 weeks of history to learn, that is normal).

---

## 5. Choose a region — and stay in it

- Example used throughout this guide: **`us-east-1`** (N. Virginia). Any mainstream region works (`eu-central-1`, `ap-south-1`, …). Choose by latency to users and data-residency needs.
- **Consistency matters more than the choice.** ECR, ECS, RDS, Secrets Manager, ALB, EventBridge are all regional services. If your ECS service is in `us-east-1` and your ECR image is in `eu-west-1`, the deployment fails. Every command below and in [`manual-deployment.md`](./manual-deployment.md) passes `--region $AWS_REGION`.
- Note for Route 53 + CloudFront (if used later): those are global edge services, but the ACM certificate for an ALB must be in the ALB's region — [`manual-deployment.md`](./manual-deployment.md) §11.

```bash
export AWS_REGION="us-east-1"   # one region, everywhere, every time
```

---

## 6. Install AWS CLI v2 and configure it

**What:** the command-line client used by every step that follows. **Why:** the console is fine for reading, but copy-pasteable commands are reviewable, repeatable, and what CI/CD will use later.

```bash
# Linux (x86_64) — official installer
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# macOS
# brew install awscli   (or see https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

# Windows: MSI installer from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
```

Configure with the IAM user credentials from §3 (never root):

```bash
aws configure
# AWS Access Key ID:     YOUR_ACCESS_KEY_ID          ← from IAM user, §3
# AWS Secret Access Key: YOUR_SECRET_ACCESS_KEY      ← shown once, §3
# Default region name:   us-east-1                   ← same value as $AWS_REGION, §5
# Default output format: json
```

**Verify:**

```bash
aws --version                       # → aws-cli/2.x.x Python/3.x ...
aws sts get-caller-identity
```

Expected output of the second command:

```json
{
    "UserId": "AID...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/acquisitionos-admin"
}
```

If `Arn` ends in `:user/` (not `:root`) and `Account` shows a 12-digit number, you are ready. If authentication fails, re-check the key pair and that the user has permissions attached.

---

## 7. Key pair (OPTIONAL)

**What:** an SSH key pair for EC2 instances. **Why (and why probably not):** this deployment runs on Fargate — you do **not** SSH into Fargate tasks; you read logs in CloudWatch ([`manual-deployment.md`](./manual-deployment.md) §13). Create a key pair only if you plan EC2-based debugging tools (e.g., a bastion or a psql jump host).

Console → EC2 → **Key Pairs** → Create key pair → `acquisitionos-debug` (`.pem`, chmod 400). Label: OPTIONAL.

---

## 8. Quotas and limits (the ones that can bite this deployment)

**What:** AWS caps how much of each resource an account may use per region. **Why:** the two most relevant here:

- **Fargate vCPU quota** ("Fargate On-Demand resource count" / vCPU-based limit): caps the sum of vCPUs across running Fargate tasks. A 1 vCPU × 2-task deployment is trivially small, but **new accounts often start with a low limit**, and auto-scaling to 4 tasks at 2 vCPU = 8 vCPU can hit it. The failure mode is a service event like `was unable to place a task... RESOURCE:CPU`.
- **RDS instances per region** and **public IPs per region** (if using public IPs on tasks).

Check / request:

```bash
# List the current Fargate-related quotas (Service Quotas API)
aws service-quotas list-service-quotas \
  --service-code fargate \
  --query "Quotas[?contains(QuotaName,'vCPU')].{Name:QuotaName,Value:Value}" \
  --region "$AWS_REGION"
```

Console route: **Service Quotas** → AWS services → search "Fargate" → check "On-Demand resource count" → **Request increase at account level** if it is low. Expected: quota value is comfortably above your maximum planned vCPU (recommended: >= 8 for this app's default setup, to allow HA + deploy overlap + scaling).

**Verify:** the service-quotas call returns values; note them in your deployment notes.

---

## 9. Understanding account IDs and ARNs (30 seconds, worth 3 hours)

- **Account ID:** the 12-digit number from `aws sts get-caller-identity` (e.g. `123456789012`). It appears in ECR image URLs (`123456789012.dkr.ecr.us-east-1.amazonaws.com/...`) and in every IAM policy. This guide uses the placeholder `YOUR_ACCOUNT_ID`.

```bash
export ACCOUNT_ID="YOUR_ACCOUNT_ID"      # replace with your real 12-digit ID
```

- **ARN (Amazon Resource Name):** the globally unique address of any resource:

```text
arn:aws:secretsmanager:us-east-1:123456789012:secret:acquisitionos/prod/JWT_SECRET-AbCdEf
arn:partition:service:region:account-id:resource-type/resource-name
```

You will paste ARNs in two places: the ECS task definition (each secret's `valueFrom` is a Secrets Manager ARN — [`secrets.md`](./secrets.md)) and IAM policies (which ARNs a role may read). The random suffix on Secrets Manager ARNs is normal; `aws secretsmanager list-secrets` shows exact values.

---

## 10. Pre-flight checklist

- [ ] Root user has MFA and zero access keys
- [ ] IAM admin user `acquisitionos-admin` exists with MFA; you are NOT using root for daily work
- [ ] (Teams) IAM Identity Center chosen instead of shared IAM users
- [ ] Monthly budget alarm + Cost Anomaly Detection created
- [ ] One region chosen (`AWS_REGION`), written down, and used consistently
- [ ] AWS CLI v2 installed; `aws sts get-caller-identity` returns your IAM user ARN + account ID
- [ ] `ACCOUNT_ID` and `AWS_REGION` exported in your shell (or noted where you keep them)
- [ ] Fargate vCPU quota >= 8 (or a pending increase request)
- [ ] (Optional) EC2 key pair created for debugging only

Next: [`manual-deployment.md`](./manual-deployment.md) — the full deployment.

---

## 11. Official Documentation

- Securing the AWS account root user — https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html
- IAM users — https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users.html
- IAM Identity Center — https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html
- AWS Budgets — https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html
- Cost Anomaly Detection — https://docs.aws.amazon.com/cost-management/latest/userguide/detect-anomalies.html
- AWS CLI install — https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- Service Quotas (Fargate) — https://docs.aws.amazon.com/general/latest/gr/fargate.html
- ARN format — https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html
