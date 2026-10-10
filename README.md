# myMeshtastic

Dashboard for a Meshtastic mesh, fed from an MQTT broker. It decodes (and decrypts) packets from the broker,
stores nodes, telemetry, positions, messages, traceroutes and RF links in SQLite, and pushes live updates to the
browser over Server-Sent Events.

Stack: Nuxt 4 (Nitro server + Vue), Drizzle ORM, SQLite (built-in `node:sqlite`, no native modules), mqtt.js.

## Development

```bash
cp .env.example .env          # adjust broker, channel keys and node IDs
npm install
npm run dev                   # http://localhost:3000
```

The database is created at `.data/mesh.db`. Migrations run automatically on startup. After changing `server/database/schema.ts`, run `npm run db:generate`
and commit the new file in `server/database/migrations`.

```bash
npm test             # unit tests (node:test)
npm run typecheck
npm run build
```

## Configuration

All settings come from environment variables (see `.env.example`):

| Variable | Default | |
|---|---|---|
| `NUXT_DATABASE_PATH` | `.data/mesh.db` | SQLite file, relative to the working directory |
| `NUXT_MQTT_URL` | `mqtt://mqtt.meshtastic.pt:1883` | Credentials in the URL are redacted in logs and `/api/health` |
| `NUXT_MQTT_USERNAME` / `NUXT_MQTT_PASSWORD` | public `meshdev` login | |
| `NUXT_MQTT_TOPIC` | `msh/#` | |
| `NUXT_CHANNEL_KEYS` | `AQ==` | Comma-separated base64 PSKs, tried in order |
| `NUXT_NODE_IDS` | *(all)* | Comma-separated nodes to monitor, e.g. `!a0cc2ad0,!f5adab84` |
| `NUXT_RETENTION_DAYS` | `0` (forever) | Age limit for the raw packet log. Set this in production when monitoring all nodes |

## Production

### Proxmox VE

Run this as root on the Proxmox host. It creates an unprivileged Debian LXC container, installs Node.js 24,
builds the app and starts it as the `mymeshtastic` systemd service on port 3000:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Renato-Silva/myMeshtastic/master/scripts/proxmox.sh)"
```

Optional variables: `CTID`, `CT_HOSTNAME`, `STORAGE` (rootfs; defaults to the first storage that holds containers),
`BRIDGE` (`vmbr0`), `IP` (`dhcp`, or e.g. `192.168.1.50/24` plus `GATEWAY`), `MEMORY` (2048 MB; the build peaks
at ~1.7 GB, while the server itself uses ~100 MB), `CORES`, `DISK` (8 GB), `ENV_FILE` (a local `.env` to copy in),
and `REPO_URL` / `BRANCH`.

Settings live in `/opt/mymeshtastic/.env` (run `systemctl restart mymeshtastic` after editing it), and the
database lives in `/var/lib/mymeshtastic/mesh.db`. To update, run the same script again inside the container:

```bash
pct exec <ctid> -- bash /opt/mymeshtastic/scripts/proxmox.sh
```

The script also works directly in any Debian or Ubuntu VM or container.

### Docker

```bash
docker compose up -d --build     # database in the "data" volume
```

The app listens on `127.0.0.1:3000` by default; put a TLS reverse proxy in front, or set `APP_BIND=0.0.0.0`.
The image runs as a non-root user and has a healthcheck on `/api/health`.

### Bare Node

```bash
npm ci && npm run build
node .output/server/index.mjs     # reads .env and creates .data/ in the working directory
```

Run one instance only: live updates go through an in-process event bus, each instance would ingest the
same MQTT traffic, and SQLite expects a single writer.

If nginx proxies the app, `/api/stream` sends `X-Accel-Buffering: no`, so no special SSE config is needed.
Keep `proxy_read_timeout` above 30s, because the stream sends a keep-alive every 25s.

### Monitoring

`GET /api/health` returns 200 when the database is reachable and MQTT is connected, and 503 otherwise.
The response also includes the time of the last broker message and the last packet from a monitored node.

The dashboard has no authentication. Everything it shows, including decoded channel messages, is public to
anyone who can reach it. Restrict access at the proxy if that matters.
