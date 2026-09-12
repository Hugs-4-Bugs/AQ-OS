#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Nginx Entrypoint Script
# Interpolates environment variables in nginx config before starting.
# Phase 10: DevOps Infrastructure
# ═══════════════════════════════════════════════════════════════════

set -e

# Interpolate environment variables in nginx config template
envsubst '${DOMAIN}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "[nginx] Environment variables interpolated into nginx.conf"
echo "[nginx] DOMAIN=${DOMAIN:-localhost}"

exit 0
