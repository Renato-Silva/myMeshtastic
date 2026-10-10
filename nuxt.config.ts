// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/leaflet'],
  css: ['~/assets/css/main.css'],
  app: {
    head: { title: 'Mesh Monitor' }
  },
  // Every key can be overridden with NUXT_<SNAKE_CASE> env vars (see .env.example)
  runtimeConfig: {
    databaseUrl: 'mysql://mesh:mesh@localhost:3308/meshtastic',
    mqttUrl: 'mqtt://mqtt.meshtastic.pt:1883',
    mqttUsername: 'meshdev',
    mqttPassword: 'large4cats',
    mqttTopic: 'msh/+/2/e/#',
    // Comma-separated base64 channel PSKs, tried in order. "AQ==" is the default LongFast key.
    channelKeys: 'AQ==',
    // Comma-separated node IDs to monitor (e.g. "!a0cc2ad0,!f5adab84"). Empty = every node on the broker.
    nodeIds: '',
    retentionDays: 30
  }
})
