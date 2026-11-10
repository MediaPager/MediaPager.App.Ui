import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { configuredApiBaseUrl } from './src/apiBaseUrl.js'

function apiLocationPlugin(configuredApiBaseUrl, localApiBaseUrl) {
  function sendApiLocation(request, response, next) {
    if (request.method !== 'GET') return next()
    const requestHost = request.headers.host?.split(':')[0]?.toLowerCase()
    const frpSuffix = '.frp.nobugsgiven.com'
    const siteName = requestHost?.endsWith(frpSuffix)
      ? requestHost.slice(0, -frpSuffix.length)
      : null
    const isLoopback = requestHost === 'localhost' || requestHost === '127.0.0.1'
    const apiBaseUrl = siteName
      ? `https://api-${siteName}${frpSuffix}`
      : isLoopback
        ? localApiBaseUrl
        : configuredApiBaseUrl
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ apiBaseUrl }))
  }

  return {
    name: 'mediapager-api-location',
    configureServer: installApiLocationMiddleware,
    configurePreviewServer: installApiLocationMiddleware,
  }

  function installApiLocationMiddleware(server) {
      server.middlewares.use('/info/apiurl', sendApiLocation)
      server.middlewares.use('/runtime-config.json', sendApiLocation)
  }
}

function runtimeConfigPlugin(apiBaseUrl) {
  return {
    name: 'mediapager-runtime-config',
    generateBundle() {
      const configured = apiBaseUrl || '/'
      this.emitFile({
        type: 'asset',
        fileName: 'runtime-config.json',
        source: `${JSON.stringify({ apiBaseUrl: configured }, null, 2)}\n`,
      })
    },
  }
}

function emailLogoPlugin() {
  const logo = readFileSync(fileURLToPath(new URL('./src/assets/images/icon.png', import.meta.url)))
  const fileName = 'mediapager-email-logo.png'

  return {
    name: 'mediapager-email-logo',
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next()
        response.statusCode = 200
        response.setHeader('Content-Type', 'image/png')
        response.setHeader('Cache-Control', 'public, max-age=86400')
        response.end(request.method === 'HEAD' ? undefined : logo)
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
  const localApiBaseUrl = configuredApiBaseUrl(
    process.env.MEDIAPAGER_DEV_LOCAL_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL,
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
      apiLocationPlugin(apiBaseUrl, localApiBaseUrl),
      runtimeConfigPlugin(apiBaseUrl),
      emailLogoPlugin(),
      vue({ template: { transformAssetUrls } }),
      quasar({
        sassVariables: fileURLToPath(new URL('./src/quasar-variables.sass', import.meta.url)),
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          assetFileNames: (asset) => asset.name === 'icon.png'
            ? 'mediapager-email-logo.png'
            : 'assets/[name]-[hash][extname]',
        },
      },
    },
  }
})
