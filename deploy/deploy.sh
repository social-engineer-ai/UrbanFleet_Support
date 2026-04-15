#!/bin/bash
# StakeholderSim — Deployment Script
# Run from /opt/stakeholdersim after cloning the repo
# Usage: bash deploy/deploy.sh

set -e

APP_DIR="/opt/stakeholdersim"
cd "$APP_DIR"

echo "=== Deploying StakeholderSim ==="

# Pull latest code
echo "--- Pulling latest code ---"
git pull origin main

# Install dependencies
echo "--- Installing dependencies ---"
npm ci --production=false

# Generate Prisma client
echo "--- Generating Prisma client ---"
npx prisma generate

# Run migrations
echo "--- Running database migrations ---"
npx prisma migrate deploy

# Seed database (idempotent — uses upsert)
echo "--- Seeding database ---"
npx tsx prisma/seed.ts

# Enable SQLite WAL mode for better concurrent performance
echo "--- Enabling SQLite WAL mode ---"
sqlite3 prisma/dev.db "PRAGMA journal_mode=WAL;"

# Install / refresh Tier 1 hourly backup cron (idempotent)
echo "--- Ensuring backup cron installed ---"
bash scripts/install_backups.sh || echo "WARNING: backup cron install failed (non-blocking)"

# Build the app
echo "--- Building Next.js ---"
npm run build

# Restart with PM2
echo "--- Restarting application ---"
pm2 stop stakeholdersim 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=== Deployment complete ==="
echo "App running at http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'your-server-ip'):80"
echo ""
echo "Check status: pm2 status"
echo "Check logs:   pm2 logs stakeholdersim"
echo ""
