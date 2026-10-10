import { join } from 'node:path'
import mqtt from 'mqtt'
import { lt } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/mysql2/migrator'

export default defineNitroPlugin(async (nitroApp) => {
  const config = useRuntimeConfig()
  const db = useDb()

  await migrate(db, { migrationsFolder: join(process.cwd(), 'server/database/migrations') })

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

  const client = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
    reconnectPeriod: 5000
  })
  client.on('connect', () => {
    console.info(`[mqtt] connected to ${config.mqttUrl}, subscribing to ${config.mqttTopic}` +
      (allow.size ? ` (${allow.size} node${allow.size > 1 ? 's' : ''})` : ' (all nodes)'))
    client.subscribe(config.mqttTopic)
  })
  client.on('error', err => console.error('[mqtt]', err.message))
  client.on('message', (topic, payload) => {
    // Only protobuf envelopes (".../2/e/..."); skip JSON, map reports and status topics.
    if (!topic.includes('/e/')) return
    ingest(payload, { keys, allow }).catch(err => console.warn(`[mqtt] ${topic}: ${err.message}`))
  })

  // retentionDays = 0 keeps the packet log forever
  const retentionMs = Number(config.retentionDays) * 86_400_000
  const cleanup = retentionMs > 0
    ? setInterval(() => {
        db.delete(schema.packets).where(lt(schema.packets.ts, new Date(Date.now() - retentionMs)))
          .catch(err => console.error('[cleanup]', err.message))
      }, 3_600_000)
    : undefined

  nitroApp.hooks.hook('close', async () => {
    clearInterval(cleanup)
    await client.endAsync()
  })
})
