// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/leaflet'],
  css: ['~/assets/css/main.css'],
  vite: {
    optimizeDeps: {
      include: ['@vue-leaflet/vue-leaflet', 'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'vue-echarts']
    }
  },
  app: {
    head: {
      title: 'myMeshtastic',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    },
    // Live data: never let a proxy or browser serve a stale copy
    '/api/**': { headers: { 'Cache-Control': 'no-store' } }
  },
  nitro: {
    rollupConfig: {
      output: {
        // Production doesn't read .env, and pm2 (Forge) doesn't either. Load it before Nitro snapshots
        // the env into runtimeConfig; variables already set (compose, systemd) still win.
        banner: chunk => chunk.fileName.endsWith('nitro.mjs')
          ? `try { process.loadEnvFile() } catch {}`
          : ''
      }
    }
  },
  // Every key can be overridden with NUXT_<SNAKE_CASE> env vars (see .env.example)
  runtimeConfig: {
    // Empty = DB_HOST/DB_DATABASE/... (Forge) or the local docker-compose database, see server/database/url.ts
    databaseUrl: '',
    mqttUrl: 'mqtt://mqtt.meshtastic.pt:1883',
    mqttUsername: 'meshdev',
    mqttPassword: 'large4cats',
    mqttTopic: 'msh/#',
    // Comma-separated base64 channel PSKs, tried in order. "AQ==" is the default LongFast key.
    channelKeys: 'AQ==',
    // Comma-separated node IDs to monitor (e.g. "!a0cc2ad0,!f5adab84"). Empty = every node on the broker.
    nodeIds: '',
    // Days to keep the raw packet log; 0 = forever
    retentionDays: 0
  }
})
