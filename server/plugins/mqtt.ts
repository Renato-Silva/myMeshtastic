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
    await db.insert(schema.nodes).ignore().values([...allow].map(num => ({ num, id: numToId(num) })))
  }

  const client = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
    reconnectPeriod: 5000
  })
  client.on('connect', () => {
    console.info(`[mqtt] connected to ${config.mqttUrl}, subscribing to ${config.mqttTopic}` +
      (allow.size ? ` (${allow.size} nodes)` : ' (all nodes)'))
    client.subscribe(config.mqttTopic)
  })
  client.on('error', err => console.error('[mqtt]', err.message))
  client.on('message', (topic, payload) => {
    ingest(payload, { keys, allow }).catch(err => console.warn(`[mqtt] ${topic}: ${err.message}`))
  })

  const retentionMs = Number(config.retentionDays) * 86_400_000
  const cleanup = setInterval(() => {
    db.delete(schema.packets).where(lt(schema.packets.ts, new Date(Date.now() - retentionMs)))
      .catch(err => console.error('[cleanup]', err.message))
  }, 3_600_000)

  nitroApp.hooks.hook('close', async () => {
    clearInterval(cleanup)
    await client.endAsync()
  })
})
