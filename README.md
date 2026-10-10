# myMeshtastic

Dashboard for a Meshtastic mesh, fed from an MQTT broker. It decodes (and decrypts) packets from the broker,
stores nodes, telemetry, positions, messages, traceroutes and RF links in MySQL, and pushes live updates to the
browser over Server-Sent Events.

Stack: Nuxt 4 (Nitro server + Vue), Drizzle ORM, MySQL 8, mqtt.js.

## Development

```bash
cp .env.example .env          # adjust broker, channel keys and node IDs
docker compose up -d db       # MySQL on 127.0.0.1:3308
npm install
npm run dev                   # http://localhost:3000
```

Migrations run automatically on startup. After changing `server/database/schema.ts`, run `npm run db:generate`
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
| `NUXT_DATABASE_URL` | local compose DB | Or Forge-style `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` |
| `NUXT_MQTT_URL` | `mqtt://mqtt.meshtastic.pt:1883` | Credentials in the URL are redacted in logs and `/api/health` |
| `NUXT_MQTT_USERNAME` / `NUXT_MQTT_PASSWORD` | public `meshdev` login | |
| `NUXT_MQTT_TOPIC` | `msh/#` | |
| `NUXT_CHANNEL_KEYS` | `AQ==` | Comma-separated base64 PSKs, tried in order |
| `NUXT_NODE_IDS` | *(all)* | Comma-separated nodes to monitor, e.g. `!a0cc2ad0,!f5adab84` |
| `NUXT_RETENTION_DAYS` | `0` (forever) | Age limit for the raw packet log. Set this in production when monitoring all nodes |

## Production

### Docker

```bash
# set MYSQL_PASSWORD and MYSQL_ROOT_PASSWORD in .env first
docker compose --profile prod up -d --build
```

The app listens on `127.0.0.1:3000` by default; put a TLS reverse proxy in front, or set `APP_BIND=0.0.0.0`.
The image runs as a non-root user and has a healthcheck on `/api/health`.

### Bare Node (e.g. Forge)

```bash
npm ci && npm run build
node .output/server/index.mjs     # reads .env from the working directory
```

Run one instance only: live updates go through an in-process event bus, and each instance would ingest the
same MQTT traffic.

If nginx proxies the app, `/api/stream` sends `X-Accel-Buffering: no`, so no special SSE config is needed.
Keep `proxy_read_timeout` above 30s, because the stream sends a keep-alive every 25s.

### Monitoring

`GET /api/health` returns 200 when the database is reachable and MQTT is connected, and 503 otherwise.
The response also includes the time of the last broker message and the last packet from a monitored node.

The dashboard has no authentication. Everything it shows, including decoded channel messages, is public to
anyone who can reach it. Restrict access at the proxy if that matters.
