import { eq, or } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const { node } = getQuery(event)
  const { links } = schema
  return queryLinks(node ? or(eq(links.fromNum, Number(node)), eq(links.toNum, Number(node))) : undefined)
})
