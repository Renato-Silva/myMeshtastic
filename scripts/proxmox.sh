#!/usr/bin/env bash
# Installs or updates myMeshtastic.
#
# On a Proxmox VE host: creates a Debian LXC container and installs the app inside it.
#   bash proxmox.sh
#   CTID=120 IP=192.168.1.50/24 GATEWAY=192.168.1.1 ENV_FILE=./.env bash proxmox.sh
#
# Inside any Debian/Ubuntu machine or container (also how updates work, just run it again):
#   bash /opt/mymeshtastic/scripts/proxmox.sh
#
# The app runs as a systemd service (mymeshtastic) on port 3000. Settings are in /opt/mymeshtastic/.env,
# the SQLite database is in /var/lib/mymeshtastic.
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/Renato-Silva/myMeshtastic.git}
BRANCH=${BRANCH:-master}
APP_DIR=${APP_DIR:-/opt/mymeshtastic}
APP_USER=mymeshtastic
PORT=${PORT:-3000}
NODE_MAJOR=24

msg() { printf '\e[1;32m==>\e[0m %s\n' "$*"; }
die() { printf '\e[1;31mError:\e[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root"

# --------------------------------------------------------------------------- Proxmox host: create the container
host_install() {
  local ctid=${CTID:-$(pvesh get /cluster/nextid)}
  local hostname=${CT_HOSTNAME:-mymeshtastic}
  local storage=${STORAGE:-$(pvesm status -content rootdir | awk 'NR > 1 { print $1; exit }')}
  local tpl_storage=${TEMPLATE_STORAGE:-local}
  local bridge=${BRIDGE:-vmbr0}
  local ip=${IP:-dhcp}
  # The Nuxt build peaks at ~1.7 GB; at runtime the server uses ~100 MB. This is a limit, not a reservation.
  local memory=${MEMORY:-2048} swap=${SWAP:-512} cores=${CORES:-2} disk=${DISK:-8}

  pct status "$ctid" &>/dev/null && die "container $ctid already exists (set CTID=...)"
  [[ -z ${ENV_FILE:-} || -f $ENV_FILE ]] || die "ENV_FILE $ENV_FILE not found"

  msg "Finding a Debian template"
  pveam update >/dev/null
  local template
  template=$(pveam available --section system | awk '{print $2}' | grep -E '^debian-13-standard' | sort -V | tail -1)
  [[ -n $template ]] || template=$(pveam available --section system | awk '{print $2}' | grep -E '^debian-12-standard' | sort -V | tail -1)
  [[ -n $template ]] || die "no Debian template available"
  if ! pveam list "$tpl_storage" | grep -q "$template"; then
    msg "Downloading $template"
    pveam download "$tpl_storage" "$template" >/dev/null
  fi

  local net="name=eth0,bridge=$bridge,ip=$ip"
  [[ $ip == dhcp || -z ${GATEWAY:-} ]] || net+=",gw=$GATEWAY"

  msg "Creating container $ctid ($hostname)"
  pct create "$ctid" "$tpl_storage:vztmpl/$template" \
    --hostname "$hostname" \
    --cores "$cores" --memory "$memory" --swap "$swap" \
    --rootfs "$storage:$disk" \
    --net0 "$net" \
    --unprivileged 1 --features nesting=1 \
    --onboot 1 --start 1 \
    --description "myMeshtastic dashboard: http://<ip>:$PORT" >/dev/null

  msg "Waiting for the network"
  for _ in $(seq 60); do
    pct exec "$ctid" -- getent hosts deb.debian.org &>/dev/null && break
    sleep 2
  done
  pct exec "$ctid" -- getent hosts deb.debian.org &>/dev/null || die "container $ctid has no network/DNS"

  pct push "$ctid" "${BASH_SOURCE[0]}" /root/mymeshtastic-install.sh
  if [[ -n ${ENV_FILE:-} ]]; then
    pct exec "$ctid" -- mkdir -p "$APP_DIR"
    pct push "$ctid" "$ENV_FILE" "$APP_DIR/.env"
  fi
  pct exec "$ctid" -- env REPO_URL="$REPO_URL" BRANCH="$BRANCH" APP_DIR="$APP_DIR" PORT="$PORT" \
    bash /root/mymeshtastic-install.sh
  pct exec "$ctid" -- rm -f /root/mymeshtastic-install.sh

  local addr
  addr=$(pct exec "$ctid" -- hostname -I | awk '{print $1}')
  msg "Done: http://${addr:-<container-ip>}:$PORT"
  echo "    Settings: pct enter $ctid, then edit $APP_DIR/.env and run: systemctl restart mymeshtastic"
  echo "    Update:   pct exec $ctid -- bash $APP_DIR/scripts/proxmox.sh"
}

# --------------------------------------------------------------------------- Inside the container/VM: install or update the app
guest_install() {
  command -v apt-get >/dev/null || die "only Debian/Ubuntu are supported"
  export DEBIAN_FRONTEND=noninteractive

  msg "Installing packages"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git >/dev/null

  if ! command -v node >/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 22 )); then
    msg "Installing Node.js $NODE_MAJOR"
    curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi

  id "$APP_USER" &>/dev/null || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
  mkdir -p "$APP_DIR"
  chown "$APP_USER:" "$APP_DIR"
  as_app() { runuser -u "$APP_USER" -- env HOME="$APP_DIR" "$@"; }

  if [[ -d $APP_DIR/.git ]]; then
    msg "Updating to the latest $BRANCH"
    as_app git -C "$APP_DIR" fetch -q origin "$BRANCH"
    as_app git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
  else
    msg "Cloning $REPO_URL"
    # A pushed .env may already be there, so clone next to it rather than into an empty dir.
    as_app git -C "$APP_DIR" init -q
    as_app git -C "$APP_DIR" remote add origin "$REPO_URL"
    as_app git -C "$APP_DIR" fetch -q origin "$BRANCH"
    as_app git -C "$APP_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  fi

  if [[ ! -f $APP_DIR/.env ]]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    created_env=1
  fi
  chown "$APP_USER:" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"

  msg "Building (takes a few minutes)"
  local log=/var/log/mymeshtastic-build.log
  if ! as_app bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build" >"$log" 2>&1; then
    tail -n 40 "$log"
    die "build failed, full log in $log"
  fi

  cat > /etc/systemd/system/mymeshtastic.service <<EOF
[Unit]
Description=myMeshtastic dashboard
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production HOST=0.0.0.0 PORT=$PORT NUXT_DATABASE_PATH=/var/lib/mymeshtastic/mesh.db
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
RestartSec=5
StateDirectory=mymeshtastic
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable -q mymeshtastic
  systemctl restart mymeshtastic

  msg "Checking the service"
  for _ in $(seq 30); do
    curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/health" && break
    sleep 2
  done
  if systemctl is-active -q mymeshtastic; then
    msg "myMeshtastic is running on port $PORT"
  else
    journalctl -u mymeshtastic -n 30 --no-pager
    die "service failed to start"
  fi
  if [[ -n ${created_env:-} ]]; then
    echo "    Created $APP_DIR/.env from the example. Set NUXT_NODE_IDS and NUXT_CHANNEL_KEYS there,"
    echo "    then: systemctl restart mymeshtastic"
  fi
}

if command -v pct >/dev/null; then host_install; else guest_install; fi
