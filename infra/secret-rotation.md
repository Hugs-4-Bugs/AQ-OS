# AcquisitionOS — Secret Rotation Strategy

## Overview

This document defines the procedures for rotating all secrets used by AcquisitionOS, including JWT secrets, payment provider keys, OAuth secrets, Redis passwords, and encryption keys.

---

## 1. JWT Secret Rotation

### Affected Components
- `JWT_SECRET` — Used for signing access tokens
- `JWT_REFRESH_SECRET` — Used for signing refresh tokens

### Rotation Procedure

```bash
#!/bin/bash
# rotate-jwt-secret.sh
set -euo pipefail

echo "=== JWT Secret Rotation ==="

# Step 1: Generate new secrets
NEW_JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
NEW_JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')

echo "New JWT_SECRET generated: ${NEW_JWT_SECRET:0:10}..."
echo "New JWT_REFRESH_SECRET generated: ${NEW_JWT_REFRESH_SECRET:0:10}..."

# Step 2: Update environment (both old and new must be valid during transition)
# Add JWT_SECRET_PREVIOUS to allow graceful token invalidation
export JWT_SECRET_PREVIOUS="$JWT_SECRET"
export JWT_SECRET="$NEW_JWT_SECRET"
export JWT_REFRESH_SECRET_PREVIOUS="$JWT_REFRESH_SECRET"
export JWT_REFRESH_SECRET="$NEW_JWT_REFRESH_SECRET"

# Step 3: Deploy updated environment
# Application should check both JWT_SECRET and JWT_SECRET_PREVIOUS
# This allows existing tokens to be validated during the transition period

# Step 4: After 24 hours (access token max lifetime), remove JWT_SECRET_PREVIOUS
echo "IMPORTANT: Remove JWT_SECRET_PREVIOUS after 24 hours"
echo "All old tokens will be invalid after removal."

# Step 5: Invalidate all existing sessions (optional, forces re-login)
# This can be done via the /api/settings/sessions/revoke-all endpoint
```

### Application Changes Required

The auth middleware must support dual-secret validation:

```typescript
// In auth middleware - support previous secret during rotation
const verifyToken = (token: string, secret: string) => {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
};

const decoded =
  verifyToken(token, process.env.JWT_SECRET!) ||
  verifyToken(token, process.env.JWT_SECRET_PREVIOUS || '');
```

### Rotation Schedule
- **Frequency**: Every 90 days
- **Transition period**: 24 hours (access token lifetime)
- **Alert**: 7 days before rotation due

---

## 2. Stripe/Razorpay Key Rotation

### Stripe Key Rotation

1. **Create new restricted API key** in Stripe Dashboard
2. **Update `STRIPE_SECRET_KEY`** in environment
3. **Update `STRIPE_WEBHOOK_SECRET`** if webhook endpoint changes
4. **Test with small transaction**
5. **Revoke old key** after 48 hours of successful operation

```bash
# Step 1: Add new key alongside old
STRIPE_SECRET_KEY_NEW="sk_live_..."
STRIPE_SECRET_KEY_OLD="$STRIPE_SECRET_KEY"

# Step 2: Deploy with new key
export STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY_NEW"

# Step 3: After 48 hours, revoke old key in Stripe Dashboard
```

### Razorpay Key Rotation

1. **Generate new API key pair** in Razorpay Dashboard
2. **Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`**
3. **Update `RAZORPAY_WEBHOOK_SECRET`**
4. **Test payment flow**
5. **Disable old key** after 48 hours

### Rotation Schedule
- **Frequency**: Every 180 days
- **Transition period**: 48 hours
- **Alert**: 14 days before rotation due

---

## 3. Google OAuth Client Secret Rotation

### Rotation Procedure

1. **Go to Google Cloud Console** → APIs & Services → Credentials
2. **Select the OAuth 2.0 Client** for AcquisitionOS
3. **Reset the client secret**
4. **Update `GOOGLE_CLIENT_SECRET`** in environment
5. **Update `GOOGLE_OAUTH_CLIENT_SECRET`** in backend config
6. **Test OAuth login flow**
7. **Old secret is invalidated immediately** — users must re-authenticate

```bash
# No transition period possible — Google invalidates old secret immediately
# Plan for brief user disruption

# Update environment
export GOOGLE_CLIENT_SECRET="new-secret-from-google-console"

# Deploy immediately
systemctl restart acquisitionos
```

### Pre-Rotation Steps
- [ ] Notify users of upcoming OAuth re-authentication requirement
- [ ] Schedule during low-traffic window
- [ ] Have rollback plan (can restore old secret in Google Console within 5 min)

### Rotation Schedule
- **Frequency**: Every 365 days (or on compromise)
- **Transition period**: None (instant invalidation)
- **Alert**: 30 days before rotation due

---

## 4. Redis Password Rotation

### Rotation Procedure

```bash
#!/bin/bash
# rotate-redis-password.sh
set -euo pipefail

echo "=== Redis Password Rotation ==="

# Step 1: Generate new password
NEW_REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=')

# Step 2: Update Redis configuration
# Add new password while keeping old (dual-password support)
cat >> /etc/redis/redis.conf <<EOF
# Rotation: temporary dual-password support
requirepass "${NEW_REDIS_PASSWORD}"
EOF

# Step 3: Restart Redis
systemctl restart redis

# Step 4: Update application environment
export REDIS_PASSWORD="$NEW_REDIS_PASSWORD"

# Step 5: Deploy updated application
systemctl restart acquisitionos

# Step 6: Verify connectivity
redis-cli -a "$NEW_REDIS_PASSWORD" PING

echo "Redis password rotated successfully."
```

### Rotation Schedule
- **Frequency**: Every 90 days
- **Transition period**: Immediate (single password)
- **Alert**: 7 days before rotation due

---

## 5. Encryption Key Rotation

### Fernet Key Rotation (OAuth Token Encryption)

The `ENCRYPTION_KEY` is used for encrypting OAuth tokens (Google, etc.) stored in the database.

### Rotation Procedure

1. **Generate new Fernet key**
   ```python
   from cryptography.fernet import Fernet
   new_key = Fernet.generate_key().decode()
   ```

2. **Create key rotation script** that re-encrypts all data:
   ```python
   #!/usr/bin/env python3
   """rotate-encryption-key.py - Re-encrypt all data with new key"""
   import os
   from cryptography.fernet import Fernet
   
   OLD_KEY = os.environ["ENCRYPTION_KEY"]
   NEW_KEY = os.environ["ENCRYPTION_KEY_NEW"]
   
   old_fernet = Fernet(OLD_KEY.encode())
   new_fernet = Fernet(NEW_KEY.encode())
   
   # Re-encrypt all EmailAccount tokens
   # ... query all records, decrypt with old key, encrypt with new key, update
   ```

3. **Run rotation script**:
   ```bash
   export ENCRYPTION_KEY="current-key"
   export ENCRYPTION_KEY_NEW="new-key"
   python3 rotate-encryption-key.py
   ```

4. **Update environment** with new key as primary
5. **Keep old key** as `ENCRYPTION_KEY_PREVIOUS` for 7 days
6. **Remove old key** after verification

### Rotation Schedule
- **Frequency**: Every 180 days
- **Transition period**: 7 days
- **Alert**: 14 days before rotation due

---

## 6. Secret Rotation Schedule Summary

| Secret | Frequency | Transition Period | Downtime | Automation |
|--------|-----------|------------------|----------|------------|
| JWT_SECRET | 90 days | 24 hours | None | Semi-automatic |
| JWT_REFRESH_SECRET | 90 days | 24 hours | None | Semi-automatic |
| STRIPE_SECRET_KEY | 180 days | 48 hours | None | Manual (Dashboard) |
| RAZORPAY_KEY_SECRET | 180 days | 48 hours | None | Manual (Dashboard) |
| GOOGLE_CLIENT_SECRET | 365 days | None | Brief | Manual (Console) |
| REDIS_PASSWORD | 90 days | None | Brief (<30s) | Semi-automatic |
| ENCRYPTION_KEY | 180 days | 7 days | None | Script-based |

---

## 7. Emergency Rotation (Compromise)

If any secret is suspected of being compromised:

1. **IMMEDIATE rotation** — no transition period
2. **Invalidate all sessions** — force all users to re-authenticate
3. **Audit logs** — check for unauthorized access since compromise window
4. **Notify security team** —PagerDuty P1 alert
5. **Post-incident review** — document root cause within 48 hours

### Quick Emergency Rotation

```bash
# Emergency: Rotate all critical secrets at once
NEW_JWT=$(openssl rand -base64 64 | tr -d '\n')
NEW_JWT_REFRESH=$(openssl rand -base64 64 | tr -d '\n')
NEW_REDIS=$(openssl rand -base64 32 | tr -d '\n/=+')

# Update all at once
export JWT_SECRET="$NEW_JWT"
export JWT_REFRESH_SECRET="$NEW_JWT_REFRESH"
export REDIS_PASSWORD="$NEW_REDIS"

# Restart everything
systemctl restart redis acquisitionos

# Force all users to re-login
curl -X POST http://localhost:3000/api/settings/sessions/revoke-all \
  -H "Authorization: Bearer admin-token"
```

---

## 8. Secret Storage

All secrets are stored in:
- **Development**: `.env` file (gitignored)
- **Staging/Production**: GitHub Secrets + environment-specific `.env` on server
- **Rotation tracking**: `infra/secret-rotation-log.csv`

```csv
secret_name,last_rotated,next_rotation,rotated_by
JWT_SECRET,2026-03-01,2026-06-01,ops-team
JWT_REFRESH_SECRET,2026-03-01,2026-06-01,ops-team
REDIS_PASSWORD,2026-02-15,2026-05-15,ops-team
STRIPE_SECRET_KEY,2026-01-01,2026-07-01,ops-team
ENCRYPTION_KEY,2026-01-15,2026-07-15,ops-team
```
