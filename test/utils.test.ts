import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandKey, numToId, parseNodeId } from '../server/utils/meshtastic.ts'
import { bucketRows, dedupePositions } from '../server/utils/range.ts'
import { redactUrl, resolveDatabaseUrl } from '../server/database/url.ts'

test('parseNodeId accepts !hex, hex and decimal', () => {
  assert.equal(parseNodeId('!a0cc2ad0'), 0xa0cc2ad0)
  assert.equal(parseNodeId(' a0cc2ad0 '), 0xa0cc2ad0)
  assert.equal(parseNodeId('2697734864'), 2697734864)
  assert.equal(parseNodeId('9999999999'), undefined)
  assert.equal(parseNodeId('nope'), undefined)
  assert.equal(numToId(0xa0cc2ad0), '!a0cc2ad0')
  assert.equal(numToId(1), '!00000001')
})

test('expandKey expands 1-byte PSK shorthand like the firmware', () => {
  assert.equal(expandKey('AQ==')!.toString('base64'), '1PG7OiApB1nwvP+rz05pAQ==')
  assert.equal(expandKey('Ag==')![15], 0x02)
  assert.equal(expandKey('AA=='), undefined)
  assert.equal(expandKey(''), undefined)
  assert.equal(expandKey(Buffer.alloc(32, 7).toString('base64'))!.length, 32)
})

test('redactUrl hides passwords only', () => {
  assert.equal(redactUrl('mysql://u:p%40ss@h:3306/db'), 'mysql://u:***@h:3306/db')
  assert.equal(redactUrl('mqtt://user:secret@broker:1883'), 'mqtt://user:***@broker:1883')
  assert.equal(redactUrl('mqtt://broker:1883'), 'mqtt://broker:1883')
})

test('resolveDatabaseUrl precedence', () => {
  assert.equal(resolveDatabaseUrl({}, 'mysql://a@b/c'), 'mysql://a@b/c')
  assert.equal(resolveDatabaseUrl({ NUXT_DATABASE_URL: 'mysql://x@y/z' }), 'mysql://x@y/z')
  assert.equal(
    resolveDatabaseUrl({ DB_HOST: 'db', DB_DATABASE: 'mesh', DB_USERNAME: 'me', DB_PASSWORD: 'p@ss' }),
    'mysql://me:p%40ss@db:3306/mesh'
  )
  assert.equal(resolveDatabaseUrl({}), 'mysql://mesh:mesh@localhost:3308/meshtastic')
})

test('bucketRows averages numeric fields per bucket', () => {
  const rows = [
    { id: 1, nodeNum: 5, ts: new Date(0), battery: 10, voltage: null as number | null },
    { id: 2, nodeNum: 5, ts: new Date(30_000), battery: 20, voltage: 4 },
    { id: 3, nodeNum: 5, ts: new Date(60_000), battery: 50, voltage: 3 }
  ]
  const out = bucketRows(rows, 60_000)
  assert.equal(out.length, 2)
  assert.equal(out[0]!.battery, 15)
  assert.equal(out[0]!.voltage, 4)
  assert.equal(out[0]!.nodeNum, 5)
  assert.deepEqual(bucketRows(rows, 0), rows)
})

test('dedupePositions drops repeated fixes per node', () => {
  const p = (nodeNum: number, lat: number) => ({ nodeNum, lat, lon: 0 })
  const out = dedupePositions([p(1, 1), p(2, 1), p(1, 1), p(1, 2), p(2, 1), p(1, 1)])
  assert.deepEqual(out, [p(1, 1), p(2, 1), p(1, 2), p(1, 1)])
})
