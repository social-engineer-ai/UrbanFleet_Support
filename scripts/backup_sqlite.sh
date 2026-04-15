#!/bin/bash
# Tier 1 SQLite backup: hourly snapshot, daily copy on the hour 00 UTC,
# uploaded to S3. Safe to run alongside the live app — sqlite3 .backup uses
# the SQLite online backup API to produce a consistent snapshot without
# blocking writers.
#
# Installed to cron by scripts/install_backups.sh. Pairs with the Litestream
# continuous replication (see scripts/install_litestream.sh) — this hourly
# cron is a belt-and-suspenders backstop.

set -e

APP_DIR="/opt/stakeholdersim"
DB_PATH="$APP_DIR/prisma/prisma/dev.db"
TMP_DIR="/tmp/stakeholdersim-backup"
BUCKET="${DUMP_S3_BUCKET:-stakeholdersim-data}"
LOG_FILE="/var/log/stakeholdersim/backup.log"

mkdir -p "$TMP_DIR" "$(dirname "$LOG_FILE")"

log() {
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $*" | tee -a "$LOG_FILE"
}

# Load AWS creds from .env so node can see them.
set -a
source "$APP_DIR/.env"
set +a

TS=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
HOUR=$(date -u +"%Y-%m-%d-%H")
DAY=$(date -u +"%Y-%m-%d")
HH=$(date -u +"%H")

SNAP_PATH="$TMP_DIR/dev-$TS.db"
HOURLY_KEY="backups/hourly/$HOUR.db"

log "=== Backup starting: $TS ==="

# Hot snapshot via SQLite online backup API
sqlite3 "$DB_PATH" ".backup $SNAP_PATH"
SIZE=$(stat -c%s "$SNAP_PATH")
log "Snapshot created: $SNAP_PATH ($SIZE bytes)"

# Upload hourly — node reads bucket/key/path from env
cd "$APP_DIR"
BACKUP_BUCKET="$BUCKET" BACKUP_KEY="$HOURLY_KEY" BACKUP_FILE="$SNAP_PATH" node -e '
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
const body = fs.readFileSync(process.env.BACKUP_FILE);
s3.send(new PutObjectCommand({ Bucket: process.env.BACKUP_BUCKET, Key: process.env.BACKUP_KEY, Body: body, ContentType: "application/vnd.sqlite3", ServerSideEncryption: "AES256" }))
  .then(() => console.log("Uploaded: s3://" + process.env.BACKUP_BUCKET + "/" + process.env.BACKUP_KEY))
  .catch(e => { console.error("Upload failed:", e.name, e.message); process.exit(1); });
' 2>&1 | tee -a "$LOG_FILE"

# At midnight UTC, also upload a daily copy (kept for 90 days by the lifecycle rule)
if [ "$HH" = "00" ]; then
  DAILY_KEY="backups/daily/$DAY.db"
  BACKUP_BUCKET="$BUCKET" BACKUP_KEY="$DAILY_KEY" BACKUP_FILE="$SNAP_PATH" node -e '
  const fs = require("fs");
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
  const body = fs.readFileSync(process.env.BACKUP_FILE);
  s3.send(new PutObjectCommand({ Bucket: process.env.BACKUP_BUCKET, Key: process.env.BACKUP_KEY, Body: body, ContentType: "application/vnd.sqlite3", ServerSideEncryption: "AES256" }))
    .then(() => console.log("Uploaded daily: s3://" + process.env.BACKUP_BUCKET + "/" + process.env.BACKUP_KEY))
    .catch(e => { console.error("Daily upload failed:", e.name, e.message); process.exit(1); });
  ' 2>&1 | tee -a "$LOG_FILE"
fi

rm -f "$SNAP_PATH"
log "=== Backup complete ==="
