import { inArray } from 'drizzle-orm'

/** Names for a set of node numbers (unknown nodes get just their !id). */
export async function nodeNames(nums: Iterable<number>): Promise<Record<number, NodeName>> {
  const list = [...new Set(nums)].filter(n => n !== BROADCAST)
  const out: Record<number, NodeName> = {}
  for (const num of list) out[num] = { id: numToId(num), shortName: null, longName: null }
  if (!list.length) return out
  const { nodes } = schema
  const rows = await useDb().select({ num: nodes.num, shortName: nodes.shortName, longName: nodes.longName })
    .from(nodes).where(inArray(nodes.num, list))
  for (const r of rows) out[r.num] = { id: numToId(r.num), shortName: r.shortName, longName: r.longName }
  return out
}
