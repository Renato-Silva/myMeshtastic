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
  # Commit of the last successful build; a failed update leaves it stale, so the next run retries
  local marker=/opt/mymeshtastic/.output/.built-commit
  $STD git fetch origin master
  if [[ "$(cat "$marker" 2>/dev/null)" == "$(git rev-parse origin/master)" && -f .output/server/index.mjs ]]; then
    msg_ok "${APP} is already up to date ($(git rev-parse --short HEAD))"
    systemctl is-active -q mymeshtastic || systemctl start mymeshtastic
    exit
  fi

  msg_info "Stopping Service"
  systemctl stop mymeshtastic
  msg_ok "Stopped Service"

  # Never leave the dashboard down: restart it whatever happens below, keeping core's exit handler
  local core_exit_trap
  core_exit_trap="$(trap -p EXIT)"
  trap '_rc=$?; systemctl start mymeshtastic; if declare -F on_exit >/dev/null; then (exit $_rc); on_exit; fi' EXIT

  msg_info "Updating ${APP}"
  # .env is untracked, so the reset keeps it
  $STD git reset --hard origin/master
  NODE_VERSION="24" setup_nodejs
  # setup_nodejs leaves us in /opt
  cd /opt/mymeshtastic || exit
  # npm ci occasionally fails on a stale node_modules or a network hiccup; retry once from scratch
  if ! $STD npm ci --no-audit --no-fund; then
    msg_warn "npm ci failed, retrying with a clean node_modules"
    rm -rf node_modules
    $STD npm cache verify
    $STD npm ci --no-audit --no-fund
  fi
  $STD npm run build
  git rev-parse HEAD >"$marker"
  msg_ok "Updated ${APP} to $(git rev-parse --short HEAD)"

  eval "${core_exit_trap:-trap - EXIT}"
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
