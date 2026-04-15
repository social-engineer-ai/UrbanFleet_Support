#!/bin/bash
# Idempotent installer for Tier 2 continuous replication via Litestream.
# Downloads the Litestream deb if not already installed, writes the config,
# adds a systemd drop-in that loads AWS creds from /opt/stakeholdersim/.env,
# and starts the service. Safe to run on every deploy — all steps check
# state first.
#
# Usage (one-time, on fresh servers): sudo bash scripts/install_litestream.sh

set -e

APP_DIR="/opt/stakeholdersim"
LITESTREAM_VERSION="0.5.11"
LITESTREAM_URL="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.deb"
CONFIG_SRC="$APP_DIR/deploy/litestream.yml"
CONFIG_DST="/etc/litestream.yml"
OVERRIDE_DIR="/etc/systemd/system/litestream.service.d"
OVERRIDE_FILE="$OVERRIDE_DIR/override.conf"

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: this installer needs sudo. Run with: sudo bash $0" >&2
    exit 1
  fi
}

require_root

# 1. Install the Litestream binary if not already present
if command -v litestream >/dev/null 2>&1; then
  echo "Litestream already installed: $(litestream version)"
else
  echo "Downloading Litestream ${LITESTREAM_VERSION}..."
  TMP_DEB=$(mktemp /tmp/litestream.XXXXXX.deb)
  curl -sL -o "$TMP_DEB" "$LITESTREAM_URL"
  dpkg -i "$TMP_DEB"
  rm -f "$TMP_DEB"
  echo "Installed: $(litestream version)"
fi

# 2. Install the config file
if [ ! -f "$CONFIG_SRC" ]; then
  echo "ERROR: config template not found at $CONFIG_SRC" >&2
  exit 1
fi
if cmp -s "$CONFIG_SRC" "$CONFIG_DST"; then
  echo "Litestream config already up to date: $CONFIG_DST"
else
  cp "$CONFIG_SRC" "$CONFIG_DST"
  echo "Installed config: $CONFIG_DST"
fi

# 3. Install systemd drop-in so the service gets AWS creds from .env
mkdir -p "$OVERRIDE_DIR"
cat > "$OVERRIDE_FILE" << 'OVERRIDE_EOF'
[Service]
# Load AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION from the app's .env
EnvironmentFile=/opt/stakeholdersim/.env
OVERRIDE_EOF
echo "Installed systemd drop-in: $OVERRIDE_FILE"

# 4. Reload systemd and start the service
systemctl daemon-reload
systemctl enable litestream >/dev/null 2>&1 || true

if systemctl is-active --quiet litestream; then
  systemctl restart litestream
  echo "Litestream restarted."
else
  systemctl start litestream
  echo "Litestream started."
fi

sleep 2
systemctl status litestream --no-pager | head -10
echo
echo "Tier 2 continuous replication ready. Tail logs with: sudo journalctl -u litestream -f"
