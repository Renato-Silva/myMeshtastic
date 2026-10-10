import type { H3Event } from 'h3'

/** A node number (decimal, or "!hex") from a query/route value, or a 400 if it isn't one. */
export function toNodeNum(value: unknown): number {
  const v = typeof value === 'string' ? value.trim() : ''
  const num = /^\d{1,10}$/.test(v) ? Number(v) : /^![0-9a-f]{1,8}$/i.test(v) ? Number.parseInt(v.slice(1), 16) : NaN
  if (!(num >= 0 && num <= 0xffffffff)) throw createError({ statusCode: 400, statusMessage: 'Invalid node' })
  return num
}

/** ?node= if present (validated), else undefined. */
export function nodeQuery(event: H3Event) {
  const { node } = getQuery(event)
  return node === undefined || node === '' ? undefined : toNodeNum(node)
}

/** ?limit= clamped to 1..max. */
export function limitQuery(event: H3Event, fallback: number, max: number) {
  const n = Math.floor(Number(getQuery(event).limit))
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback
}

export const routeNodeNum = (event: H3Event) => toNodeNum(getRouterParam(event, 'num'))
