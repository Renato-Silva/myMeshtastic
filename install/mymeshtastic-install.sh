#!/usr/bin/env bash

# Runs inside the container, called by ct/mymeshtastic.sh.
# Source: https://github.com/Renato-Silva/myMeshtastic

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt install -y git
msg_ok "Installed Dependencies"

NODE_VERSION="24" setup_nodejs

msg_info "Installing myMeshtastic (takes a few minutes)"
$STD git clone -b master https://github.com/Renato-Silva/myMeshtastic.git /opt/mymeshtastic
cd /opt/mymeshtastic || exit
cp .env.example .env
chmod 600 .env
$STD npm ci --no-audit --no-fund
$STD npm run build
msg_ok "Installed myMeshtastic"

msg_info "Creating Service"
# systemd reads .env as root and passes it on; the database lives in /var/lib/mymeshtastic
cat <<SERVICE >/etc/systemd/system/mymeshtastic.service
[Unit]
Description=myMeshtastic dashboard
After=network-online.target
Wants=network-online.target

[Service]
DynamicUser=yes
StateDirectory=mymeshtastic
WorkingDirectory=/opt/mymeshtastic
EnvironmentFile=/opt/mymeshtastic/.env
Environment=NODE_ENV=production HOST=0.0.0.0 PORT=3000 NUXT_DATABASE_PATH=/var/lib/mymeshtastic/mesh.db
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
systemctl enable -q --now mymeshtastic
msg_ok "Created Service"

motd_ssh
customize
cleanup_lxc
