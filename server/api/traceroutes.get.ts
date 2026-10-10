export default defineEventHandler((event) => {
  const { node, limit } = getQuery(event)
  return queryTraceroutes(node ? involving(schema.traceroutes, Number(node)) : undefined, Math.min(Number(limit) || 100, 500))
})
