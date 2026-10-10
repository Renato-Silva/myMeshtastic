import { desc, eq, or, type SQL } from 'drizzle-orm'

/** Text messages, newest first, with sender/recipient names. */
export async function queryMessages(where?: SQL, limit = 200) {
  const { messages } = schema
  const rows = await useDb().select().from(messages).where(where).orderBy(desc(messages.id)).limit(limit)
  const names = await nodeNames(rows.flatMap(r => [r.from, r.to]))
  return rows.map(r => ({ ...r, fromName: names[r.from]!, toName: names[r.to] ?? null }))
}

/** Traceroute replies, newest first, with a name for every node on the path. */
export async function queryTraceroutes(where?: SQL, limit = 100) {
  const { traceroutes } = schema
  const rows = await useDb().select().from(traceroutes).where(where).orderBy(desc(traceroutes.id)).limit(limit)
  const names = await nodeNames(rows.flatMap(r => [r.from, r.to, ...r.route, ...r.routeBack]))
  return rows.map(r => ({ ...r, names }))
}

export const involving = (table: typeof schema.messages | typeof schema.traceroutes, num: number) =>
  or(eq(table.from, num), eq(table.to, num))
