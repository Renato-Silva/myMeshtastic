export default defineEventHandler((event) => {
  const { node, limit } = getQuery(event)
  return queryMessages(node ? involving(schema.messages, Number(node)) : undefined, Math.min(Number(limit) || 200, 1000))
})
