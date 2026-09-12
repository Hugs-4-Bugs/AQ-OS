#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Gmail PubSub Provisioning Helper
#
# This script helps set up Google Cloud PubSub for real-time
# Gmail push notifications. Run this after setting up GCP.
#
# Prerequisites:
#   1. Google Cloud project created
#   2. gcloud CLI installed and authenticated
#   3. Gmail API enabled
#   4. PubSub API enabled
#
# Usage:
#   chmod +x scripts/provision-gmail-pubsub.sh
#   ./scripts/provision-gmail-pubsub.sh <PROJECT_ID> <APP_URL> <VERIFICATION_TOKEN>
#
# Example:
#   ./scripts/provision-gmail-pubsub.sh my-project-123 https://app.example.com my-secret-token
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────
PROJECT_ID="${1:-}"
APP_URL="${2:-}"
VERIFICATION_TOKEN="${3:-$(openssl rand -hex 32)}"

TOPIC_NAME="gmail-push"
SUBSCRIPTION_NAME="gmail-push-sub"
WEBHOOK_URL="${APP_URL}/api/gmail/pubsub/webhook"
SERVICE_ACCOUNT="gmail-push-sa"

# ── Validation ───────────────────────────────────────────────────
if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: PROJECT_ID is required."
  echo ""
  echo "Usage: $0 <PROJECT_ID> <APP_URL> [VERIFICATION_TOKEN]"
  echo ""
  echo "Example:"
  echo "  $0 my-project-123 https://app.example.com"
  echo ""
  echo "Setup steps:"
  echo "  1. Create a GCP project: https://console.cloud.google.com/projectcreate"
  echo "  2. Enable Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com"
  echo "  3. Enable PubSub API: https://console.cloud.google.com/apis/library/pubsub.googleapis.com"
  echo "  4. Install gcloud CLI: https://cloud.google.com/sdk/docs/install"
  echo "  5. Authenticate: gcloud auth login && gcloud auth application-default login"
  echo ""
  exit 1
fi

if [ -z "$APP_URL" ]; then
  echo "ERROR: APP_URL is required."
  echo "Example: $0 $PROJECT_ID https://app.example.com"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     AcquisitionOS — Gmail PubSub Provisioning            ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║ Project:    $PROJECT_ID"
echo "║ Webhook:    $WEBHOOK_URL"
echo "║ Topic:      $TOPIC_NAME"
echo "║ Token:      ${VERIFICATION_TOKEN:0:16}..."
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Set project ─────────────────────────────────────────
echo "Step 1: Setting GCP project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# ── Step 2: Enable required APIs ────────────────────────────────
echo "Step 2: Enabling required APIs..."
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project="$PROJECT_ID"

# ── Step 3: Create PubSub topic ─────────────────────────────────
echo "Step 3: Creating PubSub topic ($TOPIC_NAME)..."
gcloud pubsub topics create "$TOPIC_NAME" --project="$PROJECT_ID" 2>/dev/null || echo "  Topic already exists, skipping."

# ── Step 4: Create push subscription ────────────────────────────
echo "Step 4: Creating push subscription ($SUBSCRIPTION_NAME)..."
gcloud pubsub subscriptions create "$SUBSCRIPTION_NAME" \
  --topic="$TOPIC_NAME" \
  --push-endpoint="$WEBHOOK_URL" \
  --push-auth-service-account="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --ack-deadline=60 \
  --project="$PROJECT_ID" 2>/dev/null || {
    echo "  Subscription creation failed (may already exist). Trying to update..."
    gcloud pubsub subscriptions update "$SUBSCRIPTION_NAME" \
      --push-endpoint="$WEBHOOK_URL" \
      --ack-deadline=60 \
      --project="$PROJECT_ID" 2>/dev/null || echo "  Could not update subscription. Continuing..."
  }

# ── Step 5: Create service account for push auth ────────────────
echo "Step 5: Creating service account for push authentication..."
gcloud iam service-accounts create "$SERVICE_ACCOUNT" \
  --display-name="Gmail Push Notification Service" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  Service account already exists, skipping."

# ── Step 6: Grant PubSub publisher role ─────────────────────────
echo "Step 6: Granting service account PubSub roles..."
gcloud pubsub topics add-iam-policy-binding "$TOPIC_NAME" \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project="$PROJECT_ID"

# ── Step 7: Grant invocation role on subscription ───────────────
echo "Step 7: Granting Cloud Run Invoker role (for webhook endpoint)..."
gcloud run services add-iam-policy-binding --region=us-central1 acquisitionos \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" 2>/dev/null || echo "  Note: Cloud Run binding not needed if using a different hosting platform."

# ── Step 8: Configure Gmail watch ───────────────────────────────
echo ""
echo "Step 8: Configure Gmail watch via the AcquisitionOS API..."
echo ""
echo "  After the server is running, trigger Gmail watch setup by calling:"
echo "  POST $APP_URL/api/gmail/pubsub/setup"
echo "  Authorization: Bearer <your-auth-token>"
echo ""

# ── Step 9: Output env vars ─────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     Setup Complete! Add these to your .env file:          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo ""
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GMAIL_PUBSUB_TOPIC=projects/$PROJECT_ID/topics/$TOPIC_NAME"
echo "GMAIL_PUBSUB_SUBSCRIPTION=projects/$PROJECT_ID/subscriptions/$SUBSCRIPTION_NAME"
echo "GMAIL_PUBSUB_WEBHOOK_URL=$WEBHOOK_URL"
echo "GMAIL_PUBSUB_VERIFICATION_TOKEN=$VERIFICATION_TOKEN"
echo ""
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Note: If your app is behind a proxy/load balancer, ensure"
echo "      the webhook URL is publicly accessible for GCP to push to."
echo ""
echo "To test the webhook, use:"
echo "  gcloud pubsub topics publish $TOPIC_NAME --message='test'"
echo ""
