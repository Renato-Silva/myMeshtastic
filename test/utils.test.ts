import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandKey, firstCount, numToId, parseNodeId } from '../server/utils/meshtastic.ts'
import { bucketRows, dedupePositions } from '../server/utils/range.ts'
import { redactUrl } from '../server/utils/redact.ts'
import { chargeSessions } from '../server/utils/power.ts'
import { mergeById } from '../app/utils/mesh.ts'

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
  assert.equal(redactUrl('mqtts://u:p%40ss@h:8883'), 'mqtts://u:***@h:8883')
  assert.equal(redactUrl('mqtt://user:secret@broker:1883'), 'mqtt://user:***@broker:1883')
  assert.equal(redactUrl('mqtt://broker:1883'), 'mqtt://broker:1883')
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

test('chargeSessions finds voltage climbs and external power', () => {
  const t0 = Date.UTC(2026, 9, 1)
  const at = (min: number, voltage: number | null, battery: number | null = 50) =>
    ({ ts: new Date(t0 + min * 60_000), battery, voltage })
  const rows = [
    at(0, 3.90), at(30, 3.88), at(60, 3.89), at(90, 3.87), // discharging with jitter
    at(120, 3.95), at(150, 4.05), at(180, 4.10), at(210, 4.10), // solar charge from 3.87
    at(240, 4.05), at(270, 4.02), // drop ends it at the last 4.10 reading
    at(300, null, 101), at(330, null, 101), // USB power
    at(360, 4.00)
  ]
  const out = chargeSessions(rows, t0 + 10 * 86_400_000)
  assert.equal(out.length, 2)
  assert.deepEqual(
    out.map(c => [c.kind, (c.start.getTime() - t0) / 60_000, (c.end.getTime() - t0) / 60_000, c.fromV, c.toV]),
    [['charging', 90, 210, 3.87, 4.10], ['external', 300, 330, null, null]]
  )
  assert.equal(out.some(c => c.ongoing), false)
})

test('chargeSessions ignores jitter and marks a recent session ongoing', () => {
  const t0 = Date.UTC(2026, 9, 1)
  const at = (min: number, voltage: number) => ({ ts: new Date(t0 + min * 60_000), battery: 80, voltage })
  assert.equal(chargeSessions([at(0, 4.0), at(30, 4.02), at(60, 3.99), at(90, 4.02)]).length, 0)
  const out = chargeSessions([at(0, 3.8), at(30, 3.9), at(60, 3.95)], t0 + 90 * 60_000)
  assert.equal(out.length, 1)
  assert.equal(out[0]!.ongoing, true)
})

test('firstCount counts a packet once per link within the hour', () => {
  const t0 = Date.UTC(2026, 9, 1)
  assert.equal(firstCount('1:7>1>2', t0), true)
  assert.equal(firstCount('1:7>1>2', t0 + 5_000), false) // another gateway's copy
  assert.equal(firstCount('1:7>1>3', t0 + 5_000), true) // same packet, different relayer
  assert.equal(firstCount('1:7>1>2', t0 + 3_600_000), true) // packet ID reused later
})

test('mergeById keeps live rows that arrived during a refetch', () => {
  const r = (id: number, v = '') => ({ id, v })
  const out = mergeById([r(3, 'new'), r(2), r(1)], [r(4), r(3, 'old'), r(1)])
  assert.deepEqual(out, [r(4), r(3, 'new'), r(2), r(1)])
})

test('rangeOutline joins the farthest peer per sector and dips to the centre in gaps', async () => {
  const { rangeOutline, rangeRings, destination, bearingDeg } = await import('../shared/utils/geo.ts')
  const c: [number, number] = [41, -8]
  const north = destination(...c, 0, 10)
  const northNear = destination(...c, 2, 3)
  const east = destination(...c, 90, 5)
  assert.ok(Math.abs(bearingDeg(...c, ...east) - 90) < 0.1)
  assert.deepEqual(rangeOutline(c, [north]), [])
  assert.deepEqual(rangeOutline(c, [northNear, north, east]), [north, c, east, c])
  assert.deepEqual(rangeRings(9.6), [2.5, 5, 7.5, 10])
  assert.deepEqual(rangeRings(30), [10, 20, 30])
})
