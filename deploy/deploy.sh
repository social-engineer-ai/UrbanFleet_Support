#!/bin/bash
# StakeholderSim — Deployment Script
# Run from /opt/stakeholdersim after cloning the repo
# Usage: bash deploy/deploy.sh

set -e

APP_DIR="/opt/stakeholdersim"
cd "$APP_DIR"

echo "=== Deploying StakeholderSim ==="

# Pull latest code on whatever branch prod is checked out to. Prod has
# historically tracked feat/final-558; pulling "main" would try to merge
# main into the current branch and break the working tree.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "--- Pulling latest code (branch: $BRANCH) ---"
git pull origin "$BRANCH"

# Install dependencies
echo "--- Installing dependencies ---"
npm ci --production=false

# Generate Prisma client
echo "--- Generating Prisma client ---"
npx prisma generate

# Stop everything that holds the SQLite file before running migrations.
# Both PM2 (the app's Prisma connection pool) and Litestream (continuous
# replication) hold open handles. With either running, prisma migrate
# deploy fails with "database is locked". Both restart at the end.
LITESTREAM_WAS_ACTIVE=0
if systemctl is-active --quiet litestream 2>/dev/null; then
  LITESTREAM_WAS_ACTIVE=1
  echo "--- Pausing Litestream for migrations ---"
  sudo systemctl stop litestream
fi

echo "--- Stopping app for migrations ---"
pm2 stop stakeholdersim 2>/dev/null || true

# Force a WAL checkpoint so any pending writes are merged into the main
# DB file before Prisma touches it. Belt-and-suspenders against stale lock state.
sqlite3 prisma/prisma/dev.db "PRAGMA wal_checkpoint(TRUNCATE);" || true

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

# Install / refresh 5-minute idle-end cron (idempotent). Closes out
# conversations the student abandoned without clicking End Session, so their
# requirements_uncovered / hint_log / grades actually get updated.
echo "--- Ensuring idle-end cron installed ---"
bash scripts/install_idle_end_cron.sh || echo "WARNING: idle-end cron install failed (non-blocking)"

# Build the app
echo "--- Building Next.js ---"
npm run build

# Restart with PM2 (was stopped before migrations)
echo "--- Restarting application ---"
pm2 start ecosystem.config.js 2>/dev/null || pm2 restart stakeholdersim
pm2 save

# Resume Litestream if we paused it
if [ "$LITESTREAM_WAS_ACTIVE" = "1" ]; then
  echo "--- Resuming Litestream ---"
  sudo systemctl start litestream
fi

echo ""
echo "=== Deployment complete ==="
echo "App running at http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'your-server-ip'):80"
echo ""
echo "Check status: pm2 status"
echo "Check logs:   pm2 logs stakeholdersim"
echo ""
