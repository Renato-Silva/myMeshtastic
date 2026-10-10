#!/usr/bin/env bash
_CS_DEFAULT_URL="https://raw.githubusercontent.com/Renato-Silva/myMeshtastic/master"
_cs_boot="${COMMUNITY_SCRIPTS_CORE_DIR:-$(dirname "${BASH_SOURCE[0]}")/../../core}/core/build.func"
source "$_cs_boot" 2>/dev/null || source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")
# Proxmox LXC installer in the style of community-scripts.org, using their engine.
# Run on the Proxmox host:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Renato-Silva/myMeshtastic/master/ct/mymeshtastic.sh)"
# Source: https://github.com/Renato-Silva/myMeshtastic

APP="myMeshtastic"
var_tags="${var_tags:-meshtastic;mqtt}"
var_cpu="${var_cpu:-2}"
# The Nuxt build peaks at ~1.7 GB; the running server needs ~100 MB.
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-6}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -d /opt/mymeshtastic/.git ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  cd /opt/mymeshtastic || exit
  $STD git fetch origin master
  if [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/master)" ]]; then
    msg_ok "${APP} is already up to date ($(git rev-parse --short HEAD))"
    exit
  fi

  msg_info "Stopping Service"
  systemctl stop mymeshtastic
  msg_ok "Stopped Service"

  msg_info "Updating ${APP}"
  # .env is untracked, so the reset keeps it
  $STD git reset --hard origin/master
  NODE_VERSION="24" setup_nodejs
  $STD npm ci --no-audit --no-fund
  $STD npm run build
  msg_ok "Updated ${APP} to $(git rev-parse --short HEAD)"

  msg_info "Starting Service"
  systemctl start mymeshtastic
  msg_ok "Started Service"
  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Access it using the following URL:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}:3000${CL}"
echo -e "${INFO}${YW}Settings: /opt/mymeshtastic/.env (then: systemctl restart mymeshtastic)${CL}"
