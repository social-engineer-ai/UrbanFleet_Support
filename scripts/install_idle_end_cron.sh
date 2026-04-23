#!/bin/bash
# Idempotent installer for the 5-minute idle-end cron.
#
# The cron invokes scripts/end_idle_conversations.ts which analyzes + grades
# any conversation whose last message is older than 30 min but is still open.
# Without this, students who close the tab (or never click End Session)
# never get requirements_uncovered/hint_log/architecture_decisions credited.
#
# Paired with end-on-resume logic in POST /api/conversations as a front-line
# defense; this cron is the insurance policy.
#
# Usage: bash scripts/install_idle_end_cron.sh

set -e

APP_DIR="/opt/stakeholdersim"
SCRIPT_PATH="$APP_DIR/scripts/end_idle_conversations.ts"
WRAPPER_PATH="$APP_DIR/scripts/run_idle_end.sh"
LOG_DIR="/var/log/stakeholdersim"
LOG_FILE="$LOG_DIR/idle_end.log"
CRON_LINE="*/5 * * * * $WRAPPER_PATH >> $LOG_FILE 2>&1"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "ERROR: idle-end script not found at $SCRIPT_PATH" >&2
  exit 1
fi

# Wrapper exists so the cron entry is a simple path, env loading is in one
# place, and we don't rely on cron's minimal PATH.
cat > "$WRAPPER_PATH" <<'EOF'
#!/bin/bash
# Wrapper for the idle-end cron. Loads .env (for DATABASE_URL and
# ANTHROPIC_API_KEY) and invokes tsx with a full PATH.
#
# flock guard: if a previous invocation is still running when the next
# */5-min cron fires, exit immediately instead of starting a concurrent
# pass. Without this, a slow Claude API day produces a snowball of
# overlapping tsx processes all racing on the same conversations.
set -e
APP_DIR="/opt/stakeholdersim"
LOCK_FILE="/tmp/stakeholdersim-idle-end.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") idle-end skipped: previous run still active"
  exit 0
fi
cd "$APP_DIR"
set -a
source "$APP_DIR/.env"
set +a
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") === idle-end run starting ==="
npx tsx scripts/end_idle_conversations.ts
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") === idle-end run done ==="
EOF
chmod +x "$WRAPPER_PATH"

# Ensure log directory exists and is writable by the app user
if [ ! -d "$LOG_DIR" ]; then
  sudo mkdir -p "$LOG_DIR"
  sudo chown "$USER":"$USER" "$LOG_DIR"
fi

# Install cron line if not already present
if crontab -l 2>/dev/null | grep -qF "$WRAPPER_PATH"; then
  echo "Idle-end cron already installed (no change)."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Installed cron: $CRON_LINE"
fi

echo "Idle-end cron ready. Logs: $LOG_FILE"
