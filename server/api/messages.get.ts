export default defineEventHandler((event) => {
  const node = nodeQuery(event)
  return queryMessages(node !== undefined ? involving(schema.messages, node) : undefined, limitQuery(event, 200, 1000))
})
