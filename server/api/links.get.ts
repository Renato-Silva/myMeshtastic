import { eq, or } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const node = nodeQuery(event)
  const { links } = schema
  return queryLinks(node !== undefined ? or(eq(links.fromNum, node), eq(links.toNum, node)) : undefined)
})
