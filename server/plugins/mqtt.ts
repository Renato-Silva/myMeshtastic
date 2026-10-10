import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import mqtt, { type MqttClient } from 'mqtt'
import { lt } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/mysql2/migrator'

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const db = useDb()
  let client: MqttClient | undefined
  let cleanup: ReturnType<typeof setInterval> | undefined
  let stopped = false

  nitroApp.hooks.hook('close', async () => {
    stopped = true
    clearInterval(cleanup)
    await client?.endAsync()
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

    client = mqtt.connect(config.mqttUrl, {
      username: config.mqttUsername || undefined,
      password: config.mqttPassword || undefined,
      reconnectPeriod: 5000
    })
    client.on('connect', () => {
      console.info(`[mqtt] connected to ${config.mqttUrl}, subscribing to ${config.mqttTopic}` +
        (allow.size ? ` (${allow.size} node${allow.size > 1 ? 's' : ''})` : ' (all nodes)'))
      client!.subscribe(config.mqttTopic)
    })
    client.on('error', err => console.error('[mqtt]', err.message))

    // One message at a time: dedup and relay resolution read what earlier messages wrote.
    let queue = Promise.resolve()
    client.on('message', (topic, payload) => {
      // Only protobuf envelopes (".../2/e/..."); skip JSON, map reports and status topics.
      if (!topic.includes('/e/')) return
      queue = queue
        .then(() => ingest(payload, { keys, allow }))
        .catch(err => console.warn(`[mqtt] ${topic}: ${err.message}`))
    })

    // retentionDays = 0 keeps the packet log forever
    const retentionMs = Number(config.retentionDays) * 86_400_000
    if (retentionMs > 0) {
      cleanup = setInterval(() => {
        db.delete(schema.packets).where(lt(schema.packets.ts, new Date(Date.now() - retentionMs)))
          .catch(err => console.error('[cleanup]', err.message))
      }, 3_600_000)
    }
  }
})
