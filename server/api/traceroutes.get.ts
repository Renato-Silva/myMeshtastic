export default defineEventHandler((event) => {
  const node = nodeQuery(event)
  return queryTraceroutes(node !== undefined ? involving(schema.traceroutes, node) : undefined, limitQuery(event, 100, 500))
})
