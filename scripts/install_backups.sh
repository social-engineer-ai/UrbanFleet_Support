#!/bin/bash
# Idempotent installer for the Tier 1 hourly SQLite backup cron.
# Safe to run on every deploy — checks whether the cron entry already
# exists and only installs it if missing.
#
# Usage: bash scripts/install_backups.sh

set -e

APP_DIR="/opt/stakeholdersim"
SCRIPT_PATH="$APP_DIR/scripts/backup_sqlite.sh"
LOG_DIR="/var/log/stakeholdersim"
CRON_LINE="0 * * * * $SCRIPT_PATH >> $LOG_DIR/backup.log 2>&1"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "ERROR: backup script not found at $SCRIPT_PATH" >&2
  exit 1
fi

chmod +x "$SCRIPT_PATH"

# Ensure log directory exists and is writable by the app user
if [ ! -d "$LOG_DIR" ]; then
  sudo mkdir -p "$LOG_DIR"
  sudo chown "$USER":"$USER" "$LOG_DIR"
fi

# Install cron line if not already present
if crontab -l 2>/dev/null | grep -qF "$SCRIPT_PATH"; then
  echo "Backup cron already installed (no change)."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Installed cron: $CRON_LINE"
fi

echo "Tier 1 backup cron ready. Logs: $LOG_DIR/backup.log"
