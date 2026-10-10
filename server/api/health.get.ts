import { sql } from 'drizzle-orm'

/** For uptime monitors: 200 when the database is reachable and MQTT is connected, 503 otherwise. */
export default defineEventHandler(async (event) => {
  const db = await useDb().execute(sql`select 1`).then(() => true, () => false)
  const ok = db && meshStatus.mqttConnected
  setResponseStatus(event, ok ? 200 : 503)
  return { ok, db, ...meshStatus }
})
