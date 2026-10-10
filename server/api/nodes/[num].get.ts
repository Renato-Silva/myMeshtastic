import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const num = Number(getRouterParam(event, 'num'))
  const [node] = await useDb().select().from(schema.nodes).where(eq(schema.nodes.num, num))
  if (!node) throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  return node
})
