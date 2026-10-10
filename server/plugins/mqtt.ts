import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import mqtt, { type MqttClient } from 'mqtt'
import { lt } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { redactUrl } from '../database/url'

/** Messages waiting for the database; beyond this they're dropped so a stalled DB can't exhaust memory. */
const MAX_PENDING = 10_000
const RETENTION_BATCH = 5_000
/** After the broker refuses the connection (e.g. "Not authorized"), wait before retrying: hammering it can get the IP banned. */
const REFUSED_RETRY_MS = 30 * 60_000

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const db = useDb()
  let client: MqttClient | undefined
  let cleanup: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  // One message at a time: dedup and relay resolution read what earlier messages wrote.
  let queue = Promise.resolve()

  nitroApp.hooks.hook('close', async () => {
    stopped = true
    clearInterval(cleanup)
    clearTimeout(retry)
    await client?.endAsync().catch(() => {})
    // Let already-received messages finish, but don't hang shutdown on a dead database.
    await Promise.race([queue, sleep(10_000, undefined, { ref: false })])
    await closeDb()
  })

  // Nitro doesn't await plugins, so start in the background and retry until MySQL is reachable.
  start().catch(err => console.error('[mqtt] failed to start:', err))

  async function start() {
    while (!stopped) {
      try {
        await migrate(db, { migrationsFolder: join(process.cwd(), 'server/database/migrations') })
        break
      } catch (err) {
        console.error(`[db] not ready (${(err as Error).message}), retrying in 5s`)
        await sleep(5000)
      }
    }
    if (stopped) return

    const keys = String(config.channelKeys).split(',').map(expandKey).filter((k): k is Buffer => !!k)
    const allow = new Set(String(config.nodeIds).split(',').map(parseNodeId).filter((n): n is number => n !== undefined))

    // Configured nodes show up on the dashboard even before they are heard.
    if (allow.size) {
      await db.update(schema.nodes).set({ monitored: false })
      await db.insert(schema.nodes)
        .values([...allow].map(num => ({ num, id: numToId(num), monitored: true })))
        .onDuplicateKeyUpdate({ set: { monitored: true } })
    } else {
      await db.update(schema.nodes).set({ monitored: true })
    }

    const broker = redactUrl(config.mqttUrl)
    meshStatus.broker = broker
    client = mqtt.connect(config.mqttUrl, {
      username: config.mqttUsername || undefined,
      password: config.mqttPassword || undefined,
      reconnectPeriod: 5000
    })
    client.on('connect', () => {
      console.info(`[mqtt] connected to ${broker}, subscribing to ${config.mqttTopic}` +
        (allow.size ? ` (${allow.size} node${allow.size > 1 ? 's' : ''})` : ' (all nodes)'))
      client!.subscribe(config.mqttTopic)
      meshStatus.mqttConnected = true
      emitStatus()
    })
    client.on('close', () => {
      if (!meshStatus.mqttConnected) return
      meshStatus.mqttConnected = false
      emitStatus()
    })
    client.on('error', (err) => {
      console.error('[mqtt]', err.message)
      // A CONNACK refusal has a numeric reason code, and mqtt.js stops reconnecting after one. Try again much later.
      if (typeof (err as { code?: unknown }).code === 'number' && !client!.connected && !retry && !stopped) {
        console.warn(`[mqtt] broker refused the connection, retrying in ${REFUSED_RETRY_MS / 60_000} min`)
        retry = setTimeout(() => {
          retry = undefined
          client?.reconnect()
        }, REFUSED_RETRY_MS)
      }
    })

    let pending = 0
    let dropped = 0
    let droppedLoggedAt = 0
    client.on('message', (topic, payload) => {
      meshStatus.lastMessageAt = new Date()
      // Only protobuf envelopes (".../2/e/...") and map reports; skip JSON and status topics.
      if (!topic.includes('/e/') && !topic.includes('/map/')) return
      if (pending >= MAX_PENDING) {
        dropped++
        if (Date.now() - droppedLoggedAt > 60_000) {
          console.warn(`[mqtt] ingest backlog full, dropped ${dropped} message(s) so far`)
          droppedLoggedAt = Date.now()
        }
        return
      }
      pending++
      queue = queue
        .then(() => ingest(payload, { keys, allow }))
        .catch(err => console.warn(`[mqtt] ${topic}: ${err.message}`))
        .finally(() => pending--)
    })

    // retentionDays = 0 keeps the packet log forever
    const retentionMs = Number(config.retentionDays) * 86_400_000
    if (retentionMs > 0) {
      const prune = () => prunePackets(new Date(Date.now() - retentionMs)).catch(err => console.error('[cleanup]', err.message))
      prune()
      cleanup = setInterval(prune, 3_600_000)
    }
  }

  /** Deletes in batches so a large backlog doesn't hold one long lock on the packets table. */
  async function prunePackets(before: Date) {
    let total = 0
    while (!stopped) {
      const [res] = await db.delete(schema.packets).where(lt(schema.packets.ts, before)).limit(RETENTION_BATCH)
      total += res.affectedRows
      if (res.affectedRows < RETENTION_BATCH) break
    }
    if (total) console.info(`[cleanup] deleted ${total} packet(s) older than ${before.toISOString()}`)
  }
})
