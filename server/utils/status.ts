/** Live health of the MQTT side, shown in the header and served by /api/health. */
export const meshStatus = {
  broker: '',
  mqttConnected: false,
  /** Any message from the broker, from anyone. */
  lastMessageAt: null as Date | null,
  /** Last stored packet from one of the monitored nodes. */
  lastNodePacketAt: null as Date | null
}

export function emitStatus() {
  meshBus.emit('event', { type: 'status', data: { ...meshStatus } })
}
