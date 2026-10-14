import { fileURLToPath, URL } from 'node:url'

import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { configuredApiBaseUrl } from './src/apiBaseUrl.js'

function apiLocationPlugin(configuredApiBaseUrl) {
  function sendApiLocation(request, response, next) {
    if (request.method !== 'GET') return next()
    const requestHost = request.headers.host?.split(':')[0]?.toLowerCase()
    const frpSuffix = '.frp.nobugsgiven.com'
    const siteName = requestHost?.endsWith(frpSuffix)
      ? requestHost.slice(0, -frpSuffix.length)
      : null
    const apiBaseUrl = siteName
      ? `https://api-${siteName}${frpSuffix}`
      : configuredApiBaseUrl
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ apiBaseUrl }))
  }

  return {
    name: 'mediapager-api-location',
    configureServer(server) {
      server.middlewares.use('/info/apiurl', sendApiLocation)
      server.middlewares.use('/runtime-config.json', sendApiLocation)
    },
    generateBundle() {
      const apiBaseUrl = configuredApiBaseUrl || '/'
      this.emitFile({
        type: 'asset',
        fileName: 'runtime-config.json',
        source: `${JSON.stringify({ apiBaseUrl }, null, 2)}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = configuredApiBaseUrl(
    process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL,
  )
  const allowedHosts = String(process.env.VITE_ALLOWED_HOSTS ?? env.VITE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    server: {
      ...(allowedHosts.length ? { allowedHosts } : {}),
    },
    plugins: [
      apiLocationPlugin(apiBaseUrl),
      vue({ template: { transformAssetUrls } }),
      quasar({
        sassVariables: fileURLToPath(new URL('./src/quasar-variables.sass', import.meta.url)),
      }),
    ],
  }
})
